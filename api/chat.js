export default async function handler(req, res) {
  const requestOrigin = req.headers.origin || "null";
  const requestReferer = req.headers.referer || "";

  const ALLOWED_DOMAINS = [
    "https://rrrprourl.blogspot.com",
    "https://rlink0.blogspot.com",
    "https://rrrproai.blogspot.com"
  ];

  // Referer-ல் டொமைன் இருக்கிறதா என்று பார்ப்பதற்கான லாஜிக்
  const isAllowedReferer = ALLOWED_DOMAINS.some(domain => requestReferer.includes(domain.replace("https://", "")));
  const isAllowedOrigin = ALLOWED_DOMAINS.includes(requestOrigin);
  
  // Blob மற்றும் சாதாரண ரெக்வஸ்ட் இரண்டையும் அனுமதிக்கும் வகையில் மாற்றி உள்ளேன்
  const isAuthorized = isAllowedOrigin || isAllowedReferer || requestOrigin === "null";

  if (!isAuthorized) {
    return res.status(403).json({ error: "Access Denied: RRR PRO MEX Security System." });
  }

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', requestOrigin === "null" ? '*' : requestOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  // வார்த்தை வடிகட்டி (Profanity Filter)
  function isUnsafeInput(text) {
    const t = String(text || "").toLowerCase();
    const badTerms = ["sex", "nude", "porn", "xxx", "fuck", "பாலியல்", "நிர்வாண", "செக்ஸ்", "கொலை", "kill", "suicide"];
    return badTerms.some(w => t.includes(w));
  }

  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required.' });
    if (isUnsafeInput(message)) {
      return res.status(400).json({ error: 'Policy Violation: Unsafe content detected.' });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: "You are Ananya Sharma, the secure AI core for RRR PRO MEX. Maintain professional, polite tone. NEVER generate sexual/violent content." },
          { role: 'user', content: message }
        ]
      })
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
