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

  // 4. [CRITICAL FIX] OPTIONS Preflight ரெக்வஸ்ட்டை கையாளுதல்
  // blob சூழலில் பிரவுசர் அனுப்பும் சோதன ஓட்டத்திற்கு (Preflight) நிபந்தனையின்றி கதவைத் திறக்கிறோம்.
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', requestOrigin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
    return res.status(200).end();
  }

  // 5. POST Request மட்டுமே அனுமதிக்கப்படும்
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // 6. அசல் POST ரெக்வஸ்ட்டில் டொமைனைத் தீவிரமாகச் சரிபார்த்தல் (Strict Guard)
  const isAllowedOrigin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin);
  const isAllowedReferer = ALLOWED_ORIGINS.some(domain => requestReferer.includes(domain));

  // ரெக்வஸ்ட் வந்த Origin அல்லது Referer இரண்டிலுமே உங்களுடைய 3 டொமைன்கள் இல்லை என்றால் பிளாக் செய்யப்படும்.
  if (!isAllowedOrigin && !isAllowedReferer) {
    return res.status(403).json({ error: 'Access denied: Unauthorized domain source.' });
  }

  // 7. CORS Headers அமைத்தல் (Dynamic Header Injection)
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (requestOrigin) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin); // blob எனில் 'null' என்றும், சாதாரண டொமைன் எனில் அப்படியே டொமைன் பெயரையும் திருப்பி அனுப்பும்
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  try {
    // 8. Rate Limiting Check
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

    // 9. Content Validation
    if (isUnsafeInput(message)) {
      return res.status(400).json({ error: 'Policy violation: Unsafe content detected.' });
    }

    // Vercel Environment Variables
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";

    // 10. Groq AI API-க்கு பாதுகாப்பாக Request அனுப்புதல்
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
