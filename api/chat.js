export default async function handler(req, res) {
  const requestOrigin = req.headers.origin || "";
  const requestReferer = req.headers.referer || "";

  // 1. அனுமதித்த டொமைன்கள் (கடைசியில் `/` இருக்கக்கூடாது)
  const ALLOWED_DOMAINS = [
    "https://rrrprourl.blogspot.com",
    "https://rlink0.blogspot.com",
    "https://rrrproai.blogspot.com",
    "https://novaforge-ai.pages.dev"
  ];

  // 2. Security Check Logic
  const isAllowedOrigin = ALLOWED_DOMAINS.includes(requestOrigin);
  const isAllowedReferer = ALLOWED_DOMAINS.some(domain => requestReferer.startsWith(domain));
  const isBlob = (requestOrigin === "null" || requestOrigin === "") && isAllowedReferer;

  // Domain சரியாக இருக்கிறதா என்று பார்ப்பது
  const isAuthorized = isAllowedOrigin || isAllowedReferer || isBlob;

  if (!isAuthorized) {
    return res.status(403).json({ error: "Access Denied: RRR PRO MEX Security System. Unauthorized Domain." });
  }

  // 3. Dynamic CORS Headers setup
  if (isBlob) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  } else {
    // Referer மட்டும் சரியாக இருந்தால், Referer-ன் Base Domain-ஐ Origin-ஆக அமைக்கிறோம்
    const matchedDomain = ALLOWED_DOMAINS.find(domain => requestReferer.startsWith(domain));
    res.setHeader('Access-Control-Allow-Origin', matchedDomain || '*');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  // Vercel-ல் CORS Cache ஆவதைத் தடுக்க இந்த Header முக்கியம்
  res.setHeader('Vary', 'Origin');

  // 4. Handle OPTIONS Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message payload is required.' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: message }]
      })
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
