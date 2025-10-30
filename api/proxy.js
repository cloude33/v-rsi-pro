// api/proxy.js
export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parametresi eksik' });
  }

  try {
    const target = decodeURIComponent(url);
    // Basit güvenlik: sadece bilinen domainlere izin ver
    const allowed = ['binance.com', 'bybit.com', 'okx.com', 'mexc.com'];
    if (!allowed.some(domain => target.includes(domain))) {
      return res.status(403).json({ error: 'Yasaklı domain' });
    }

    const response = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Vercel Proxy)'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Hedef API hatası', status: response.status });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ error: 'Proxy isteği başarısız' });
  }
}