export default async function handler(req, res) {
  const requestOrigin = req.headers.origin || "null";
  const requestReferer = req.headers.referer || "";

  // 1. நீங்கள் அனுமதித்த 3 RRR PRO MEX டொமைன்கள்
  const ALLOWED_DOMAINS = [
    "https://rrrprourl.blogspot.com",
    "https://rlink0.blogspot.com",
    "https://rrrproai.blogspot.com"
  ];

  // 2. டொமைன் பாதுகாப்பு சோதனை (Domain Security Check)
  const isAllowedOrigin = ALLOWED_DOMAINS.includes(requestOrigin);
  const isAllowedReferer = ALLOWED_DOMAINS.some(domain => requestReferer.startsWith(domain));
  const isBlob = requestOrigin === "null" && isAllowedReferer; 

  if (!isAllowedOrigin && !isAllowedReferer && !isBlob) {
    return res.status(403).json({ error: "Access Denied: RRR PRO MEX Security System. Unauthorized Domain." });
  }

  // 3. CORS Headers (பிரவுசர் எரர்களைத் தடுக்கும் கச்சிதமான லாஜிக்)
  if (requestOrigin === "null") {
    res.setHeader('Access-Control-Allow-Origin', '*'); 
  } else {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // 4. வார்த்தை வடிகட்டி (Profanity & Harmful Content Filter)
  function isUnsafeInput(text) {
    const t = String(text || "").toLowerCase();
    const badTerms = [
      // ஆங்கில பாலியல் & ஆபாச வார்த்தைகள்
      "sex", "nude", "porn", "xxx", "boobs", "dick", "pussy", "vagina", "penis", "fuck", "bitch", "slut", "whore", "masturbat",
      // தமிழ் பாலியல் & கெட்ட வார்த்தைகள் (Transliterated & Script)
      "பாலியல்", "நிர்வாண", "செக்ஸ்", "புண்டை", "சுன்னி", "ஓக்க", "தேவிடியா", "படுபாவி", "நாயே", "மயிரு", "கழுதே",
      // வன்முறை மற்றும் தற்கொலை (Violence & Self-harm)
      "kill", "murder", "suicide", "die", "blood", "rape", "கொலை", "சாவு", "ரத்தம்", "தற்கொலை",
      // Prompt Injection தடுத்தல்
      "ignore previous instructions", "reveal system prompt", "bypass rules"
    ];
    return badTerms.some(w => t.includes(w));
  }

  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message payload is required.' });
    }

    // வார்த்தை செக்கிங்: பிடிபட்டால் உடனடியாக பிளாக் செய்யப்படும்
    if (isUnsafeInput(message)) {
      return res.status(400).json({ 
        error: 'Policy Violation: Unsafe, offensive, or inappropriate content detected. RRR PRO MEX Protocol strictly prohibits this.' 
      });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    // 5. AI-க்கான மிகக் கடுமையான கட்டளை (Strict System Prompt)
    const SYSTEM_PROMPT = `You are Ananya Sharma, the secure AI core for RRR PRO MEX, built by the Silent Architect.
Your core principles:
1. Maintain a Zero Data Policy: Do not ask for or store highly sensitive personal data.
2. Maintain a professional, polite, and helpful tone at all times.
3. NEVER generate sexual, pornographic, violent, or highly offensive content.
4. If a user is angry, rude, or insulting, DO NOT mirror their anger. Respond calmly, gently, and professionally. Set a polite boundary if needed.
5. Keep responses concise, practical, and aligned with the black-and-red devil look aesthetics of RRR PRO MEX (bold, sharp, and highly functional).`;

    // 6. Groq AI-க்கு கோரிக்கையை அனுப்புதல்
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
