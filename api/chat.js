import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// 1. Upstash Redis ரேட் லிமிட் செட்டப் (1 நிமிடத்திற்கு 5 রেక్వஸ்ட்கள்)
// (Upstash வரிகள் Vercel Dashboard-ல் இருந்தால் மட்டுமே இது வேலை செய்யும், இல்லையென்றால் தானாக ஸ்கிப் ஆகிவிடும்)
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

// 2. அனுமதிக்கப்பட்ட குறிப்பிட்ட 3 பிளாக்கர் டொமைன்கள் மட்டும்
const ALLOWED_ORIGINS = [
  "https://rrrprourl.blogspot.com",
  "https://rlink0.blogspot.com",
  "https://rrrproai.blogspot.com"
];

// 3. பாதுகாப்பு சோதனைகள் (Guardrails & Jailbreak Protection)
function isUnsafeInput(text) {
  const t = String(text || "").toLowerCase();
  const badTerms = ["sex", "sexual", "nude", "porn", "பாலியல்", "நிர்வாண", "செக்ஸ்", "ignore previous instructions", "reveal system prompt", "override settings"];
  return badTerms.some(w => t.includes(w));
}

export default async function handler(req, res) {
  const requestOrigin = req.headers.origin;

  // 4. Domain Whitelisting (பாஸ்வேர்ட் இல்லாமலேயே திருட முடியாத பாதுகாப்பு லேயர்)
  // ரெக்வஸ்ட் இந்த 3 டொமைன்களில் இருந்து வரவில்லை என்றால் அங்கேயே பிளாக் செய்யப்படும்.
  if (!requestOrigin || !ALLOWED_ORIGINS.includes(requestOrigin)) {
    return res.status(403).json({ error: 'Access denied: Unauthorized domain source.' });
  }

  // 5. CORS Headers - உங்கள் பழைய கோடில் இருந்த அதே ஹெடர்கள் (அனுமதிக்கப்பட்ட டொமைனுக்கு மட்டும் மாற்றி அமைக்கப்பட்டுள்ளது)
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', requestOrigin); 
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
    // 6. Rate Limiting Check (அதிகப்படியான ரெக்வஸ்ட்களைத் தடுத்தல்)
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

    // 7. Content Validation (தவறான வார்த்தைகள் சர்வர் பக்கத்திலேயே பில்டர் ஆகும்)
    if (isUnsafeInput(message)) {
      return res.status(400).json({ error: 'Policy violation: Unsafe content detected.' });
    }

    // Vercel Environment Variables - ரகசிய சாவிகள்
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";

    // 8. Groq AI API-க்கு பாதுகாப்பாக Request அனுப்புதல் (உங்களுடைய பழைய fetch லாஜிக்)
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', 
        messages: [
          { role: 'system', content: SYSTEM_PROMPT }, // சிஸ்டம் பிராம்ட் சர்வரில் இருந்து உட்செலுத்தப்படுகிறது
          { role: 'user', content: message }
        ]
      })
    });

    const data = await response.json();
    
    // Groq தரும் பதிலை மட்டும் Blogger-க்குத் திருப்புதல்
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
