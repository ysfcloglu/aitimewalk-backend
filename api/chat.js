// api/chat.js
export default async function handler(req, res) {
  // Sadece POST isteklerine izin verelim
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Yönteme izin verilmedi' });
  }

  // Vercel paneline ekleyeceğimiz gizli anahtarı alıyoruz
  const apiKey = process.env.OPENAI_API_KEY;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(req.body) // HTML'den gelen mesajları aynen iletiyoruz
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
}
