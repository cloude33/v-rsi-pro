// api/proxy.js
export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url parametresi gereklidir' });

  try {
    const target = decodeURIComponent(url);
    const allowed = ['bybit.com', 'mexc.com', 'okx.com']; // Binance'e gerek yok
    if (!allowed.some(d => target.includes(d))) {
      return res.status(403).json({ error: 'Bu domain proxy ile kullanılamaz' });
    }

    const response = await fetch(target, {
      headers: { 'User-Agent': 'Vercel-Proxy' }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Hedef API hatası' });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    console.error('Proxy error:', e.message);
    res.status(500).json({ error: 'Proxy isteği başarısız' });
  }
}