export function calculateVRSI(closes, volumes, period) {
  if (closes.length < period + 1) return null
  let wg = 0, wl = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const ch = closes[i] - closes[i-1]
    const vol = volumes[i]
    if (ch > 0) wg += ch * vol
    else wl += Math.abs(ch) * vol
  }
  return wg + wl === 0 ? 50 : 100 / (1 + wl / wg)
}

export function sigmoid(x, a = 0.12) {
  return 2 / (1 + Math.exp(-a * x)) - 1
}