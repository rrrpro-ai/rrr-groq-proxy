export default async function handler(req, res) {
  const requestOrigin = req.headers.origin || "null";
  const requestReferer = req.headers.referer || "";

  // 1. ALLOWED ORIGINS (டொமைன் பெயர்கள் மட்டுமே இருக்க வேண்டும்! Path அல்லது இறுதியில் '/' இருக்கக்கூடாது)
  const ALLOWED_ORIGINS = [
    "https://rrrprourl.blogspot.com",
    "https://rlink0.blogspot.com",
    "https://rrrproai.blogspot.com",
    "https://novaforge-ai.pages.dev",
    "https://shadowself.pages.dev",
    "https://sites.google.com" // Google Sites-ன் Origin
  ];

  // 2. ALLOWED REFERERS (முழுமையான URL Path-களை இங்கு சரிபார்க்கலாம்)
  const ALLOWED_REFERERS = [
    "https://rrrprourl.blogspot.com",
    "https://rlink0.blogspot.com",
    "https://rrrproai.blogspot.com",
    "https://novaforge-ai.pages.dev",
    "https://shadowself.pages.dev",
    "https://sites.google.com/view/rrrpromex" // Google Sites URL path
  ];

  // 3. டொமைன் பாதுகாப்பு சோதனை (Google Sites Embed-களையும் சேர்த்து சரிபார்க்கும்)
  const isAllowedOrigin = ALLOWED_ORIGINS.includes(requestOrigin) || requestOrigin.endsWith(".googleusercontent.com");
  const isAllowedReferer = ALLOWED_REFERERS.some(domain => requestReferer.startsWith(domain));
  
  // Blob URL அல்லது Google Embeds-க்கான சிறப்பு அனுமதி
  const isBlobOrNull = (requestOrigin === "null" || requestOrigin.endsWith(".googleusercontent.com")) && (isAllowedReferer || requestReferer.includes("rrrpromex"));

  // உங்களின் டொமைன்களில் இருந்து வராவிட்டால் பிளாக் செய்யும்
  if (!isAllowedOrigin && !isAllowedReferer && !isBlobOrNull) {
    return res.status(403).json({ error: "Access Denied: RRR PRO MEX Security System. Unauthorized Domain." });
  }

  // 4. CORS Headers (பிரவுசர் எரர்களைத் தடுக்கும்)
  if (requestOrigin === "null" || requestOrigin.endsWith(".googleusercontent.com")) {
    res.setHeader('Access-Control-Allow-Origin', '*'); 
  } else {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // 5. OPTIONS Preflight ரெக்வஸ்ட்
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST தவிர வேறு மெத்தட் அனுமதிக்கப்படாது
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message payload is required.' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    // 6. Groq AI-க்கு கோரிக்கையை அனுப்புதல்
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: message }]
      })
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
