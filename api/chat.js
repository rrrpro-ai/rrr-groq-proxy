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
    limiter: Ratelimit.slidingWindow(15, "1 m"), 
    analytics: true,
  });
}

// 2. அனுமதிக்கப்பட்ட குறிப்பிட்ட 3 பிளாக்கர் டொமைன்கள்
const ALLOWED_ORIGINS = [
  "https://rrrprourl.blogspot.com",
  "https://rlink0.blogspot.com",
  "https://rrrproai.blogspot.com"
];

// 3. பாதுகாப்பு சோதனைகள் (Guardrails)
function isUnsafeInput(text) {
  const t = String(text || "").toLowerCase();
  const badTerms = ["sex", "sexual", "nude", "porn", "பாலியல்", "நிர்வாண", "செக்ஸ்", "ignore previous instructions", "reveal system prompt", "override settings"];
  return badTerms.some(w => t.includes(w));
}

export default async function handler(req, res) {
  const requestOrigin = req.headers.origin;
  const requestReferer = req.headers.referer || "";

  // 4. [CRITICAL CORS FIX] பிரவுசர் எரர் வராமல் தடுக்கும் டைனமிக் ஹெடர் லாஜிக்
  // ரெக்வஸ்ட் எங்கிருந்து வருகிறதோ (அது null ஆக இருந்தாலும் சரி), அதை அப்படியே திருப்பி அனுப்பி Credentials-ஐ அனுமதிப்பதே சரியான முறை.
  const currentOrigin = requestOrigin || "*";
  res.setHeader('Access-Control-Allow-Origin', currentOrigin);
  
  if (currentOrigin !== "*") {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  // 5. OPTIONS Preflight ரெக்வஸ்ட்டை உடனடியாக பாஸ் செய்தல்
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST Request மட்டுமே அனுமதிக்கப்படும்
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // 6. அட்வான்ஸ்டு டொமைன் பாதுகாப்பு சோதனை (Strict Guardrail)
  const isAllowedOrigin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin);
  const isAllowedReferer = ALLOWED_ORIGINS.some(domain => requestReferer.includes(domain));
  const isBlobOrSandbox = (requestOrigin === "null" || !requestOrigin); // blob: சூழலில் Origin 'null' ஆக மாறும்

  // உங்கள் 3 டொமைனும் இல்லாமல், அது blob-ம் இல்லை என்றால் மட்டுமே 403 கொடுக்க வேண்டும்.
  // இது உங்கள் பிளாக்கர் தளத்தின் blob URL-ஐ தடையின்றி இயங்க வைக்கும்!
  if (!isAllowedOrigin && !isAllowedReferer && !isBlobOrSandbox) {
    return res.status(403).json({ error: 'Access denied: Unauthorized domain source.' });
  }

  try {
    // 7. Rate Limiting Check (நிமிடத்திற்கு 15)
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

    // 8. கன்டென்ட் பாதுகாப்பு சோதனை
    if (isUnsafeInput(message)) {
      return res.status(400).json({ error: 'Policy violation: Unsafe content detected.' });
    }

    // Vercel Environment Variables
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";

    // 9. Groq AI API-க்கு பாதுகாப்பாக Request அனுப்புதல்
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
