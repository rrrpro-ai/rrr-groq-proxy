export default async function handler(req, res) {
  // CORS Headers - உங்கள் Blogger தளம் மட்டும் அணுக அனுமதி அளிக்கிறது
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
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
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message payload is required.' });
    }

    // Vercel Environment Variable-ல் நாம் மறைத்து வைக்கப்போகும் Groq Key
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    // Groq AI API-க்கு பாதுகாப்பாக Request அனுப்புதல்
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768', 
        messages: [
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
