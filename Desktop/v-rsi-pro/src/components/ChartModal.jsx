import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import { calculateVRSI, sigmoid } from '../utils/vrsi'

export default function ChartModal({ symbol, klines, period, steepness, onClose }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!klines) return
    const closes = klines.map(k => parseFloat(k[4]))
    const volumes = klines.map(k => parseFloat(k[5]))
    const signals = []

    for (let i = period; i < closes.length; i++) {
      const vrsi = calculateVRSI(closes.slice(0, i + 1), volumes.slice(0, i + 1), period)
      if (vrsi !== null) signals.push(sigmoid(vrsi - 50, steepness))
    }

    if (chartRef.current) chartRef.current.destroy()
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { labels: signals.map((_, i) => i + 1), datasets: [{ data: signals, borderColor: '#5cb85c', fill: true }] },
      options: { scales: { y: { min: -1, max: 1 } }, plugins: { legend: { display: false } } }
    })
  }, [klines, period, steepness])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', padding: '20px', borderRadius: '12px', maxWidth: '800px', width: '90%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
          <h2>{symbol} - Sinyal Geçmişi</h2>
          <span onClick={onClose} style={{ cursor: 'pointer', fontSize: '1.5em' }}>X</span>
        </div>
        <canvas ref={canvasRef} height="300"></canvas>
      </div>
    </div>
  )
}