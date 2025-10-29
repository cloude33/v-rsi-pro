// Tüm işlem gören coinleri çekmek için fonksiyon
async function getAllTradingCoins() {
    try {
        const response = await fetch('https://api.binance.com/api/v3/exchangeInfo');
        const data = await response.json();
        
        // USDT ile işlem gören coinleri filtrele
        const usdtPairs = data.symbols.filter(symbol => 
            symbol.quoteAsset === 'USDT' && 
            symbol.status === 'TRADING' &&
            !symbol.symbol.includes('UP') && 
            !symbol.symbol.includes('DOWN') &&
            !symbol.symbol.includes('BULL') &&
            !symbol.symbol.includes('BEAR')
        );
        
        return usdtPairs.map(pair => pair.symbol);
    } catch (error) {
        console.error('Coin listesi alınamadı:', error);
        // Hata durumunda fallback olarak bazı popüler coinler
        return ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT', 'LINKUSDT', 'LTCUSDT', 'BCHUSDT', 'XLMUSDT', 'XRPUSDT'];
    }
}

// Sigmoid fonksiyonu
function sigmoid(x, steepness = 0.15) {
    return 2 / (1 + Math.exp(-steepness * x)) - 1;
}

// V-RSI hesaplama
function calculateVRSI(closes, period = 4) {
    if (closes.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    for (let i = closes.length - period; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }

    if (gains + losses === 0) return 50;

    const rs = gains / (gains + losses);
    return rs * 100;
}

// Tek bir coin için sinyal analizi
async function analyzeCoinSignal(symbol, interval, period, steepness) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${period + 20}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const klines = await response.json();
        
        if (!klines || klines.length < period + 1) {
            return null;
        }

        const closes = klines.map(k => parseFloat(k[4]));
        const currentPrice = closes[closes.length - 1];
        
        const vrsi = calculateVRSI(closes, period);
        if (vrsi === null) return null;

        const normalizedSignal = sigmoid(vrsi - 50, steepness);

        let decision;
        if (normalizedSignal > 0.2) {
            decision = 'LONG';
        } else if (normalizedSignal < -0.2) {
            decision = 'SHORT';
        } else {
            decision = 'NÖTR';
        }

        return {
            symbol,
            normalized: normalizedSignal,
            rsi: vrsi,
            price: currentPrice,
            decision
        };

    } catch (error) {
        console.warn(`${symbol} verisi alınamadı:`, error.message);
        return null;
    }
}

// Tüm coinleri analiz et
async function analyzeAllSignals() {
    const interval = document.getElementById('interval').value;
    const period = parseInt(document.getElementById('period').value);
    const steepness = parseFloat(document.getElementById('steepness').value);
    
    const statusDiv = document.getElementById('status');
    const tbody = document.querySelector('#resultsTable tbody');
    
    statusDiv.textContent = 'Coin listesi alınıyor...';
    tbody.innerHTML = '<tr><td colspan="5">Yükleniyor...</td></tr>';
    
    try {
        // Tüm coinleri al
        const allCoins = await getAllTradingCoins();
        statusDiv.textContent = `${allCoins.length} coin bulundu. Analiz başlatılıyor...`;
        
        const results = [];
        let completed = 0;
        
        // 5 paralel request ile sınırla (rate limiting için)
        const batchSize = 5;
        
        for (let i = 0; i < allCoins.length; i += batchSize) {
            const batch = allCoins.slice(i, i + batchSize);
            const batchPromises = batch.map(symbol => 
                analyzeCoinSignal(symbol, interval, period, steepness)
            );
            
            const batchResults = await Promise.allSettled(batchPromises);
            
            for (const result of batchResults) {
                if (result.status === 'fulfilled' && result.value) {
                    results.push(result.value);
                }
                completed++;
                
                // İlerleme durumunu güncelle
                const progress = ((completed / allCoins.length) * 100).toFixed(1);
                statusDiv.textContent = `Analiz ediliyor... ${completed}/${allCoins.length} (${progress}%)`;
            }
            
            // Rate limiting - batch'ler arasında bekle
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Sonuçları normalize sinyale göre sırala
        results.sort((a, b) => Math.abs(b.normalized) - Math.abs(a.normalized));
        
        // Tabloyu güncelle
        updateTable(results);
        statusDiv.textContent = `Analiz tamamlandı! ${results.length} coin işlendi.`;
        
    } catch (error) {
        console.error('Analiz hatası:', error);
        statusDiv.textContent = 'Hata: ' + error.message;
    }
}

// Tabloyu güncelle
function updateTable(data) {
    const tbody = document.querySelector('#resultsTable tbody');
    tbody.innerHTML = '';

    data.forEach(item => {
        const row = document.createElement('tr');
        
        const normalizedFormatted = item.normalized.toFixed(3);
        const rsiFormatted = item.rsi.toFixed(2);
        const priceFormatted = formatPrice(item.price);
        
        let signalClass = 'signal-neutral';
        if (item.decision === 'LONG') signalClass = 'signal-long';
        else if (item.decision === 'SHORT') signalClass = 'signal-short';

        row.innerHTML = `
            <td>${item.symbol}</td>
            <td>${normalizedFormatted}</td>
            <td>${rsiFormatted}</td>
            <td>${priceFormatted}</td>
            <td class="${signalClass}">${item.decision}</td>
        `;
        
        tbody.appendChild(row);
    });
}

// Fiyat formatlama
function formatPrice(price) {
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(3);
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
}

// Tablo sıralama
let sortDirection = {};
document.querySelectorAll('#resultsTable th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
        const sortKey = th.getAttribute('data-sort');
        sortDirection[sortKey] = !sortDirection[sortKey];
        
        const tbody = document.querySelector('#resultsTable tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        
        rows.sort((a, b) => {
            let aValue = a.cells[th.cellIndex].textContent;
            let bValue = b.cells[th.cellIndex].textContent;
            
            // Sayısal değerler için
            if (sortKey === 'normalized' || sortKey === 'rsi' || sortKey === 'price') {
                aValue = parseFloat(aValue);
                bValue = parseFloat(bValue);
            }
            
            if (aValue < bValue) return sortDirection[sortKey] ? -1 : 1;
            if (aValue > bValue) return sortDirection[sortKey] ? 1 : -1;
            return 0;
        });
        
        tbody.innerHTML = '';
        rows.forEach(row => tbody.appendChild(row));
    });
});

// Sayfa yüklendiğinde bazı coinleri otomatik analiz et
window.addEventListener('load', function() {
    // İsteğe bağlı: Sayfa yüklendiğinde otomatik başlatmak için aşağıdaki satırın yorumunu kaldırın
    // analyzeAllSignals();
});