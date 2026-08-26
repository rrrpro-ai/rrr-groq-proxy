export default async function handler(req, res) {
  const requestOrigin = req.headers.origin || "null";
  const requestReferer = req.headers.referer || "";

  // 1. நீங்கள் அனுமதித்த 3 RRR PRO MEX டொமைன்கள்
  const ALLOWED_DOMAINS = [
    "https://rrrprourl.blogspot.com",
    "https://rlink0.blogspot.com",
    "https://rrrproai.blogspot.com",
    "https://novaforge-ai.pages.dev",
    "https://shadowself.pages.dev/"
  ];

  // 2. டொமைன் பாதுகாப்பு சோதனை (Domain Security Check)
  const isAllowedOrigin = ALLOWED_DOMAINS.includes(requestOrigin);
  const isAllowedReferer = ALLOWED_DOMAINS.some(domain => requestReferer.startsWith(domain));
  
  // Blob URL-களுக்கான சிறப்பு அனுமதி (Origin null ஆக இருந்தாலும் Referer-ஐ வைத்துச் சரிபார்க்கும்)
  const isBlob = requestOrigin === "null" && isAllowedReferer; 

  // உங்களின் 3 டொமைன்களில் இருந்து வராவிட்டால், API-ஐ உடனடியாக பிளாக் செய்துவிடும்!
  if (!isAllowedOrigin && !isAllowedReferer && !isBlob) {
    return res.status(403).json({ error: "Access Denied: RRR PRO MEX Security System. Unauthorized Domain." });
  }

  // 3. CORS Headers (பிரவுசர் எரர்களைத் தடுக்கும் கச்சிதமான லாஜிக்)
  if (requestOrigin === "null") {
    // Blob URL-க்கு மட்டும் வைல்டுகார்டு அனுமதி
    res.setHeader('Access-Control-Allow-Origin', '*'); 
  } else {
    // நேரடி வெப்சைட்டிற்கு பாதுகாப்பான அனுமதி
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // 4. OPTIONS Preflight ரெக்வஸ்ட்டை பாஸ் செய்தல்
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

    // Vercel Environment Variable-ல் உள்ள Groq Key
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    // 5. Groq AI-க்கு கோரிக்கையை அனுப்புதல்
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
    // எரர் வந்தால் அதைத் தெளிவாகக் காட்டும்
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}

