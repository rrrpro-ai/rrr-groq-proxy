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

  // 4. செக்யூரிட்டி செக்: Origin மற்றும் Referer இரண்டையும் சரிபார்த்தல்
  const isAllowedOrigin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin);
  const isAllowedReferer = ALLOWED_ORIGINS.some(domain => requestReferer.startsWith(domain));

  // Blob URL பாதுகாப்பு லாஜிக்:
  // Blob URL-ல் இருந்து வரும்போது Origin "null" என்று வரும்.
  // அந்த சமயத்தில், அது உங்களுடைய Blogger-ல் இருந்துதான் வருகிறதா என்பதை Referer மூலம் மட்டுமே கண்டுபிடிக்க முடியும்.
  const isSecureBlob = (requestOrigin === "null" && isAllowedReferer);

  // உங்களுடைய 3 டொமைனிலிருந்து நேரடியாகவோ, அல்லது அதனுள் உருவாக்கப்பட்ட Blob வழியாகவோ வரவில்லை என்றால், அனுமதி மறுக்கப்படும்!
  if (!isAllowedOrigin && !isSecureBlob && !isAllowedReferer) {
    return res.status(403).json({ error: 'Access denied: Unauthorized domain source.' });
  }

  // 5. [CRITICAL CORS FIX] பிரவுசர் எரர் வராமல் தடுக்கும் டைனமிக் ஹெடர் லாஜிக்
  // பிரவுசர் "Credentials true" ஆக இருக்கும்போது "*" ஐ அனுமதிக்காது. எனவே சரியான Origin-ஐயே திருப்பி அனுப்ப வேண்டும்.
  let corsOrigin = ALLOWED_ORIGINS[0]; // Default fallback
  if (isAllowedOrigin) {
    corsOrigin = requestOrigin;
  } else if (isSecureBlob) {
    corsOrigin = "null"; // Blob-க்காக பிரத்யேக அனுமதி (இதுதான் Blob-ஐ வேலை செய்ய வைக்கும் ரகசியம்)
  } else if (requestOrigin && isAllowedReferer) {
    corsOrigin = requestOrigin;
  }

  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  // 6. OPTIONS Preflight ரெக்வஸ்ட்டை உடனடியாக பாஸ் செய்தல்
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST Request மட்டுமே அனுமதிக்கப்படும்
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
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
    // 🔥 உங்களின் பழைய கோடில் இருந்த அரைகுறை வரியை (Syntax Bug) சரிசெய்துவிட்டேன் 🔥
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
