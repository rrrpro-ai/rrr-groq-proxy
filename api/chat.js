import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// 1. Upstash Redis ரேட் லிமிட் செட்டப் (1 நிமிடத்திற்கு 15 ரெக்வஸ்ட்கள்)
let ratelimit = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  ratelimit = new Ratelimit({
    redis: redis,
    limiter: Ratelimit.slidingWindow(15, "1 m"), // நீங்கள் கேட்டபடி 15 ஆக மாற்றப்பட்டது
    analytics: true,
  });
}

// 2. அனுமதிக்கப்பட்ட டொமைன்கள்
const ALLOWED_ORIGINS = [
  "https://rrrprourl.blogspot.com",
  "https://rlink0.blogspot.com",
  "https://rrrproai.blogspot.com"
];

// 3. பாதுகாப்பு சோதனைகள்
function isUnsafeInput(text) {
  const t = String(text || "").toLowerCase();
  const badTerms = ["sex", "sexual", "nude", "porn", "பாலியல்", "நிர்வாண", "செக்ஸ்", "ignore previous instructions", "reveal system prompt", "override settings"];
  return badTerms.some(w => t.includes(w));
}

export default async function handler(req, res) {
  const requestOrigin = req.headers.origin;
  const requestReferer = req.headers.referer || ""; // blob URL-ஐக் கண்டுபிடிக்க இது உதவும்

  // 4. Smart Domain Whitelisting (Blob URL-களையும் அனுமதிக்கும் அட்வான்ஸ்டு பாதுகாப்பு)
  // சாதாரண லிங்க்காக இருந்தால் Origin செக் செய்யும்; blob: லிங்க்காக இருந்தால் Referer செக் செய்யும்.
  const isAllowedOrigin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin);
  const isAllowedReferer = ALLOWED_ORIGINS.some(domain => requestReferer.includes(domain));

  if (!isAllowedOrigin && !isAllowedReferer) {
    return res.status(403).json({ error: 'Access denied: Unauthorized domain source.' });
  }

  // 5. Dynamic CORS Handling (Blob/Null முகவரிகளுக்கு கதவைத் திறப்பது)
  let corsOrigin = "*";
  if (requestOrigin && requestOrigin !== 'null') {
    corsOrigin = requestOrigin;
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (requestOrigin === 'null' || requestReferer.includes("blob:")) {
    corsOrigin = "null"; // பிரவுசர் blob-க்கு 'null' என்று கேட்டால் 'null' என்றே அனுமதி தர வேண்டும்
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Origin', corsOrigin); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // OPTIONS Request-ஐ கையாளுதல் (Preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // POST Request மட்டுமே அனுமதிக்கப்படும்
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    // 6. Rate Limiting Check
    if (ratelimit) {
      const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "global";
      const { success } = await ratelimit.limit(ip);
      if (!success) {
        return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
      }
    }

    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message payload is required.' });
    }

    // 7. Content Validation
    if (isUnsafeInput(message)) {
      return res.status(400).json({ error: 'Policy violation: Unsafe content detected.' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";

    // 8. Groq AI API-க்கு Request அனுப்புதல்
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', 
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message }
        ]
      })
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
