// src/components/ChartModal.jsx
import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import { calculateVRSI } from '../utils/vrsi'

export default function ChartModal({ symbol, klines, period, steepness, onClose }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!klines || !canvasRef.current) return

    const closes = klines.map(k => parseFloat(k[4]))
    const volumes = klines.map(k => parseFloat(k[5]))
    const times = klines.map(k => new Date(k[0]).toLocaleTimeString())

    const vrsiData = []
    for (let i = period; i < closes.length; i++) {
      const sliceCloses = closes.slice(i - period, i)
      const sliceVolumes = volumes.slice(i - period, i)
      const vrsi = calculateVRSI(sliceCloses, sliceVolumes, period)
      vrsiData.push(vrsi !== null ? vrsi : 50)
    }

    const ctx = canvasRef.current.getContext('2d')
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: times.slice(-vrsiData.length),
        datasets: [
          {
            label: 'V-RSI',
            data: vrsiData,
            borderColor: '#5cb85c',
            fill: false
          },
          {
            label: 'Fiyat',
            data: closes.slice(-vrsiData.length),
            borderColor: '#007bff',
            fill: false,
            yAxisID: 'price'
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: { position: 'left', title: { display: true, text: 'V-RSI' } },
          price: { position: 'right', title: { display: true, text: 'Fiyat' } }
        }
      }
    })

    return () => {
      if (chartRef.current) chartRef.current.destroy()
    }
  }, [klines, period])

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'white',
        padding: '20px',
        borderRadius: '8px',
        width: '90%',
        maxWidth: '800px'
      }}>
        <h2>{symbol} Grafiği</h2>
        <canvas ref={canvasRef}></canvas>
        <button onClick={onClose} style={{ marginTop: '10px' }}>Kapat</button>
      </div>
    </div>
  )
}