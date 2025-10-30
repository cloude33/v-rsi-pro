import { useState, useEffect, useRef } from 'react'
import { useLocalStorage } from './hooks/useLocalStorage'
import FilterBar from './components/FilterBar'
import ChartModal from './components/ChartModal'
import { calculateVRSI, sigmoid } from './utils/vrsi'
import { getAllUSDTCoins, fetchKlines } from './utils/api'

export default function App() {
  // === AYARLAR ===
  const [exchange, setExchange] = useLocalStorage('vr_exchange', 'binance')
  const [market, setMarket] = useLocalStorage('vr_market', 'spot')
  const [interval, setInterval] = useLocalStorage('vr_interval', '15m')
  const [period, setPeriod] = useLocalStorage('vr_period', 14)
  const [steepness, setSteepness] = useLocalStorage('vr_steepness', 0.12)

  // === ANALİZ DURUMU ===
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [allResults, setAllResults] = useState(new Map())
  const abortControllerRef = useRef(null) // Durdurma için

  // === FAVORİLER & SES ===
  const [favorites, setFavorites] = useLocalStorage('vr_fav', [])
  const [soundEnabled, setSoundEnabled] = useLocalStorage('vr_sound', true)
  const audioRef = useRef(new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3'))

  // === FİLTRELER ===
  const [currentFilter, setCurrentFilter] = useState('all')
  const [coinMode, setCoinMode] = useState('all') // all | custom | favorites
  const [customCoins, setCustomCoins] = useState('')

  // === FAVORİ SET ===
  const favoritesSet = new Set(favorites)

  // === FİLTRELENMİŞ SONUÇLAR ===
  const filteredResults = [...allResults.values()]
    .filter(item => {
      if (currentFilter === 'all') return true
      if (currentFilter === 'FAV') return favoritesSet.has(item.symbol)
      return item.decision === currentFilter
    })
    .sort((a, b) => Math.abs(b.normalized) - Math.abs(a.normalized))

  // === İSTATİSTİKLER ===
  const stats = {
    total: allResults.size,
    long: [...allResults.values()].filter(i => i.decision === 'LONG').length,
    short: [...allResults.values()].filter(i => i.decision === 'SHORT').length,
    neutral: [...allResults.values()].filter(i => i.decision === 'NÖTR').length,
    fav: [...allResults.values()].filter(i => favoritesSet.has(i.symbol)).length
  }

  // === FAVORİ EKLE/ÇIKAR ===
  const toggleFavorite = (symbol) => {
    const newFavs = favoritesSet.has(symbol)
      ? favorites.filter(s => s !== symbol)
      : [...favorites, symbol]
    setFavorites(newFavs)
  }

  // === SES ÇAL ===
  const playSound = () => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.play().catch(() => {})
    }
  }

  // === DURDURMA FONKSİYONU ===
  const stopAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsAnalyzing(false)
    setProgress(0)
  }

  // === ANA TARAMA FONKSİYONU ===
  const startAnalysis = async () => {
    setIsAnalyzing(true)
    setProgress(0)
    setAllResults(new Map())
    abortControllerRef.current = new AbortController()

    let coins = []
    if (coinMode === 'custom') {
      coins = customCoins.split(',').map(c => c.trim().toUpperCase() + 'USDT').filter(c => c.length > 4)
    } else if (coinMode === 'favorites') {
      coins = favorites
    } else {
      coins = await getAllUSDTCoins(exchange, market)
    }

    if (!coins.length) {
      alert('Coin bulunamadı!')
      setIsAnalyzing(false)
      return
    }

    const batchSize = 6
    let scanned = 0
    const total = coins.length

    try {
      for (let i = 0; i < coins.length; i += batchSize) {
        if (abortControllerRef.current?.signal.aborted) break

        const batch = coins.slice(i, i + batchSize)
        await Promise.all(
          batch.map(async (sym) => {
            if (abortControllerRef.current?.signal.aborted) return

            const klines = await fetchKlines(sym, interval, period + 50, exchange, market)
            if (!klines || klines.length === 0) return

            const closes = klines.map(k => parseFloat(k[4]))
            const volumes = klines.map(k => parseFloat(k[5]))
            const vrsi = calculateVRSI(closes, volumes, period)
            if (vrsi === null) return

            const norm = sigmoid(vrsi - 50, steepness)
            const price = closes[closes.length - 1]
            const prevPrice = closes[closes.length - 2]
            const change = prevPrice ? ((price - prevPrice) / prevPrice * 100).toFixed(2) : '0.00'
            let decision = norm > 0.25 ? 'LONG' : norm < -0.25 ? 'SHORT' : 'NÖTR'

            setAllResults(prev => new Map(prev).set(sym, {
              symbol: sym,
              normalized: norm,
              vrsi,
              price,
              change,
              decision,
              klines
            }))

            scanned++
            setProgress(Math.round((scanned / total) * 100))
          })
        )

        await new Promise(resolve => setTimeout(resolve, 200))
      }
    } catch (error) {
      if (error.name !== 'AbortError') console.error(error)
    }

    setIsAnalyzing(false)
    if (!abortControllerRef.current?.signal.aborted && soundEnabled) {
      audioRef.current.play().catch(() => {})
    }
    abortControllerRef.current = null
  }

  // === GRAFİK MODAL ===
  const [showChart, setShowChart] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState('')

  const openChart = (symbol) => {
    setSelectedSymbol(symbol)
    setShowChart(true)
  }

  return (
    <div className="container" style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '1000px', margin: '0 auto', padding: '15px' }}>
      <h1 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: '20px' }}>V-RSI Pro PWA</h1>

      {/* Borsa & Piyasa */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Borsa</label>
          <select value={exchange} onChange={e => setExchange(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}>
            <option value="binance">Binance</option>
            <option value="bybit">Bybit</option>
            <option value="okx">OKX</option>
            <option value="mexc">MEXC</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Piyasa</label>
          <select value={market} onChange={e => setMarket(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}>
            <option value="spot">Spot</option>
            <option value="futures">Futures</option>
          </select>
        </div>
      </div>

      {/* Analiz Ayarları */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '15px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Zaman Dilimi</label>
          <select value={interval} onChange={e => setInterval(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}>
            <option value="5m">5 Dakika</option>
            <option value="15m">15 Dakika</option>
            <option value="30m">30 Dakika</option>
            <option value="1h">1 Saat</option>
            <option value="4h">4 Saat</option>
            <option value="1d">Günlük</option>
            <option value="1w">Haftalık</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Periyot</label>
          <input type="number" value={period} onChange={e => setPeriod(+e.target.value)} min="5" max="50" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Sigmoid (α)</label>
          <input type="number" value={steepness} onChange={e => setSteepness(+e.target.value)} step="0.01" min="0.01" max="1" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }} />
        </div>
      </div>

      {/* Coin Modu */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Coin Seçimi</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button onClick={() => setCoinMode('all')} style={{ background: coinMode === 'all' ? '#007bff' : '#eee', color: coinMode === 'all' ? 'white' : 'black', padding: '8px 16px', borderRadius: '6px', border: 'none', flex: 1 }}>Tümü</button>
          <button onClick={() => setCoinMode('custom')} style={{ background: coinMode === 'custom' ? '#007bff' : '#eee', color: coinMode === 'custom' ? 'white' : 'black', padding: '8px 16px', borderRadius: '6px', border: 'none', flex: 1 }}>Özel</button>
          <button onClick={() => setCoinMode('favorites')} style={{ background: coinMode === 'favorites' ? '#007bff' : '#eee', color: coinMode === 'favorites' ? 'white' : 'black', padding: '8px 16px', borderRadius: '6px', border: 'none', flex: 1 }}>Favoriler</button>
        </div>
        {coinMode === 'custom' && (
          <textarea
            placeholder="BTC, ETH, SOL (virgülle ayır)"
            value={customCoins}
            onChange={e => setCustomCoins(e.target.value)}
            style={{ width: '100%', height: '60px', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9em' }}
          />
        )}
      </div>

      {/* Başlat & Durdur & Ses */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
        <button 
          onClick={isAnalyzing ? stopAnalysis : startAnalysis} 
          style={{ 
            flex: 1, 
            background: isAnalyzing ? '#dc3545' : '#28a745', 
            color: 'white', 
            padding: '12px', 
            borderRadius: '6px', 
            border: 'none', 
            fontWeight: 'bold', 
            fontSize: '1em' 
          }}
        >
          {isAnalyzing ? `Durdur (${progress}%)` : 'Başlat'}
        </button>
        <button onClick={() => setSoundEnabled(!soundEnabled)} style={{ background: soundEnabled ? '#ffc107' : '#eee', color: soundEnabled ? 'white' : 'black', padding: '12px', borderRadius: '6px', border: 'none', fontSize: '0.9em' }}>
          Ses: {soundEnabled ? 'AÇIK' : 'KAPALI'}
        </button>
      </div>

      {/* İlerleme Çubuğu */}
      {isAnalyzing && (
        <div style={{ marginBottom: '15px' }}>
          <div style={{ height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#5cb85c', transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {/* Filtre Butonları */}
      <FilterBar currentFilter={currentFilter} onFilter={setCurrentFilter} />

      {/* Sıkı İstatistikler */}
      <div style={{
        background: '#f8f9fa',
        padding: '10px',
        borderRadius: '6px',
        marginBottom: '15px',
        fontSize: '0.9em',
        textAlign: 'center',
        fontWeight: 'bold'
      }}>
        Toplam: <span style={{color: '#333'}}>{stats.total}</span> | 
        LONG: <span style={{color: '#28a745'}}>{stats.long}</span> | 
        SHORT: <span style={{color: '#dc3545'}}>{stats.short}</span> | 
        NÖTR: <span style={{color: '#ffc107'}}>{stats.neutral}</span> | 
        FAV: <span style={{color: '#007bff'}}>{stats.fav}</span>
      </div>

      {/* Sonuç Tablosu - Yıldız + Sola Dayalı Coin */}
      <div style={{ overflowX: 'auto', marginTop: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em' }}>
          <thead>
            <tr style={{ background: '#f8f9fa', textAlign: 'center' }}>
              <th style={{ width: '35px', borderRight: '1px solid #ddd' }}></th>
              <th style={{ borderRight: '1px solid #ddd', textAlign: 'left', paddingLeft: '8px' }}>Coin</th>
              <th style={{ borderRight: '1px solid #ddd' }}>Sinyal</th>
              <th style={{ borderRight: '1px solid #ddd' }}>V-RSI</th>
              <th style={{ borderRight: '1px solid #ddd' }}>Fiyat</th>
              <th style={{ borderRight: '1px solid #ddd' }}>Değişim</th>
              <th>Karar</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.map(item => (
              <tr key={item.symbol} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ textAlign: 'center', borderRight: '1px solid #ddd' }}>
                  <span
                    onClick={() => toggleFavorite(item.symbol)}
                    style={{
                      cursor: 'pointer',
                      fontSize: '1.3em',
                      color: favoritesSet.has(item.symbol) ? '#28a745' : '#ccc'
                    }}
                  >
                    {favoritesSet.has(item.symbol) ? '★' : '☆'}
                  </span>
                </td>
                <td
                  onClick={() => openChart(item.symbol)}
                  style={{ 
                    cursor: 'pointer', 
                    fontWeight: 'bold', 
                    textAlign: 'left', 
                    paddingLeft: '8px',
                    borderRight: '1px solid #ddd' 
                  }}
                >
                  {item.symbol.replace('USDT', '')}
                </td>
                <td style={{ textAlign: 'center', borderRight: '1px solid #ddd' }}>
                  {item.normalized.toFixed(3)}
                </td>
                <td style={{ textAlign: 'center', borderRight: '1px solid #ddd' }}>
                  {item.vrsi.toFixed(1)}
                </td>
                <td style={{ textAlign: 'center', borderRight: '1px solid #ddd' }}>
                  {item.price.toFixed(item.price > 1 ? 4 : 6)}
                </td>
                <td style={{ 
                  textAlign: 'center', 
                  borderRight: '1px solid #ddd',
                  color: item.change >= 0 ? '#28a745' : '#dc3545',
                  fontWeight: 'bold'
                }}>
                  {item.change >= 0 ? '+' : ''}{item.change}%
                </td>
                <td style={{
                  textAlign: 'center',
                  fontWeight: 'bold',
                  color: item.decision === 'LONG' ? '#28a745' : item.decision === 'SHORT' ? '#dc3545' : '#ffc107'
                }}>
                  {item.decision}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Grafik Modal */}
      {showChart && (
        <ChartModal
          symbol={selectedSymbol}
          klines={allResults.get(selectedSymbol)?.klines}
          period={period}
          steepness={steepness}
          onClose={() => setShowChart(false)}
        />
      )}
    </div>
  )
}