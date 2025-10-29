import { useState, useEffect, useRef } from 'react'
import { useLocalStorage } from './hooks/useLocalStorage'
import FilterBar from './components/FilterBar'
import ChartModal from './components/ChartModal'
import { calculateVRSI, sigmoid } from './utils/vrsi'

export default function App() {
  const [exchange, setExchange] = useLocalStorage('vr_exchange', 'binance')
  const [market, setMarket] = useLocalStorage('vr_market', 'spot')
  const [interval, setInterval] = useState('15m')
  const [period, setPeriod] = useState(14)
  const [steepness, setSteepness] = useState(0.12)
  const [currentFilter, setCurrentFilter] = useState('all')
  const [favorites, setFavorites] = useLocalStorage('vr_fav', [])
  const [allResults, setAllResults] = useState(new Map())
  const [progress, setProgress] = useState(0)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [showChart, setShowChart] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState('')
  const wsRef = useRef(null)
  const audioRef = useRef(new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3'))

  const favoritesSet = new Set(favorites)

  const filteredResults = [...allResults.values()].filter(item => {
    if (currentFilter === 'all') return true
    if (currentFilter === 'FAV') return favoritesSet.has(item.symbol)
    return item.decision === currentFilter
  }).sort((a, b) => Math.abs(b.normalized) - Math.abs(a.normalized))

  const stats = {
    total: allResults.size,
    long: [...allResults.values()].filter(i => i.decision === 'LONG').length,
    short: [...allResults.values()].filter(i => i.decision === 'SHORT').length,
    neutral: [...allResults.values()].filter(i => i.decision === 'NÖTR').length,
    fav: [...allResults.values()].filter(i => favoritesSet.has(i.symbol)).length
  }

  const toggleFavorite = (symbol) => {
    const newFavs = favoritesSet.has(symbol)
      ? favorites.filter(s => s !== symbol)
      : [...favorites, symbol]
    setFavorites(newFavs)
  }

  const startAnalysis = async () => {
    // ... (vanilla'daki aynı mantık, setAllResults ile güncelle)
    // İlerleme: setProgress
    // Sonuç: setAllResults(new Map())
  }

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const playSound = () => {
    if (soundEnabled) audioRef.current.play().catch(() => {})
  }

  return (
    <div className="container">
      <h1>V-RSI Pro PWA</h1>

      {/* Borsa & Piyasa */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label>Borsa</label>
          <select value={exchange} onChange={e => setExchange(e.target.value)}>
            <option value="binance">BİNANCE</option>
            <option value="bybit">BYBIT</option>
            <option value="okx">OKX</option>
            <option value="mexc">MEXC</option>
          </select>
        </div>
        <div>
          <label>Piyasa</label>
          <select value={market} onChange={e => setMarket(e.target.value)}>
            <option value="spot">Spot</option>
            <option value="futures">Perpetual Futures</option>
          </select>
        </div>
      </div>

      {/* Diğer bileşenler: FuturesSettings, CoinSelection, AnalysisSettings */}

      <div style={{ display: 'flex', gap: '6px', margin: '15px 0' }}>
        <button onClick={startAnalysis} disabled={isAnalyzing}>Başlat</button>
        <button onClick={() => setSoundEnabled(!soundEnabled)}>
          Ses: {soundEnabled ? 'AÇIK' : 'KAPALI'}
        </button>
      </div>

      {isAnalyzing && (
        <div style={{ margin: '15px 0' }}>
          <div style={{ height: '22px', background: '#e9ecef', borderRadius: '11px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #5cb85c, #4cae4c)', transition: 'width 0.4s' }} />
          </div>
          <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '0.85em' }}>{progress}%</div>
        </div>
      )}

      <FilterBar currentFilter={currentFilter} onFilter={setCurrentFilter} />

      <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '0.9em' }}>
        Toplam: <strong>{stats.total}</strong> | LONG: <strong style={{color: '#28a745'}}>{stats.long}</strong> | SHORT: <strong style={{color: '#dc3545'}}>{stats.short}</strong> | NÖTR: <strong style={{color: '#ffc107'}}>{stats.neutral}</strong> | FAV: <strong style={{color: '#007bff'}}>{stats.fav}</strong>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em' }}>
        <thead>
          <tr>
            <th></th>
            <th>Coin</th>
            <th>Sinyal</th>
            <th>V-RSI</th>
            <th>Fiyat</th>
            <th>Değişim</th>
            <th>Karar</th>
          </tr>
        </thead>
        <tbody>
          {filteredResults.map(item => (
            <tr key={item.symbol}>
              <td>
                <span
                  style={{ cursor: 'pointer', fontSize: '1.3em', color: favoritesSet.has(item.symbol) ? '#28a745' : '#ccc' }}
                  onClick={() => toggleFavorite(item.symbol)}
                >Star</span>
              </td>
              <td onClick={() => { setSelectedSymbol(item.symbol); setShowChart(true); }} style={{ cursor: 'pointer' }}>
                <strong>{item.symbol.replace('USDT', '')}</strong>
              </td>
              <td>{item.normalized.toFixed(3)}</td>
              <td>{item.vrsi.toFixed(1)}</td>
              <td>{item.price.toFixed(item.price > 1 ? 4 : 6)}</td>
              <td style={{ color: item.change >= 0 ? 'green' : 'red' }}>
                {item.change >= 0 ? '+' : ''}{item.change}%
              </td>
              <td style={{ fontWeight: 'bold', color: item.decision === 'LONG' ? 'green' : item.decision === 'SHORT' ? 'red' : 'orange' }}>
                {item.decision}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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