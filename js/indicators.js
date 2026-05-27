/**
 * 技術指標計算模組
 * 計算常用的台股技術指標：SMA, KD, RSI, Bollinger Bands, MACD。
 * 每個函數皆傳入 OHLC 資料陣列，並回傳與輸入陣列等長、時間對齊的指標結果陣列。
 */

const Indicators = (() => {
  
  /**
   * 簡單移動平均線 (SMA)
   * @param {Array} data OHLC 資料
   * @param {number} period 週期
   * @returns {Array} [{ time, value }]
   */
  function calculateSMA(data, period) {
    const result = [];
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
      sum += data[i].close;
      if (i >= period) {
        sum -= data[i - period].close;
      }

      if (i < period - 1) {
        result.push({ time: data[i].time, value: null });
      } else {
        result.push({ time: data[i].time, value: sum / period });
      }
    }
    return result;
  }

  /**
   * 指數移動平均線 (EMA)
   * @param {Array} data OHLC 資料或數值陣列
   * @param {number} period 週期
   * @returns {Array} [{ time, value }]
   */
  function calculateEMA(data, period) {
    const result = [];
    const k = 2 / (period + 1);
    let ema = null;

    for (let i = 0; i < data.length; i++) {
      const val = typeof data[i] === 'number' ? data[i] : (data[i].close !== undefined ? data[i].close : data[i].value);
      const time = data[i].time || null;

      if (ema === null) {
        // 第一個值：若資料量足夠，先以 SMA 初始化，或者直接以當日收盤價為起點
        if (i >= period - 1) {
          let sum = 0;
          const startIdx = i - period + 1;
          for (let j = startIdx; j <= i; j++) {
            sum += typeof data[j] === 'number' ? data[j] : data[j].close;
          }
          ema = sum / period;
        }
      } else {
        ema = val * k + ema * (1 - k);
      }

      result.push({ time, value: ema });
    }
    return result;
  }

  /**
   * KD 隨機指標 (Stochastic Oscillator)
   * @param {Array} data OHLC 資料
   * @param {number} period 週期 (一般台股常用 9)
   * @param {number} smoothK K值平滑週期 (一般為 3)
   * @param {number} smoothD D值平滑週期 (一般為 3)
   * @returns {Array} [{ time, k, d }]
   */
  function calculateKD(data, period = 9, smoothK = 3, smoothD = 3) {
    const result = [];
    let k = 50; // 初始值設定在 50
    let d = 50;

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push({ time: data[i].time, k: null, d: null });
        continue;
      }

      // 1. 尋找過去 N 天的最高價與最低價
      let highestHigh = -Infinity;
      let lowestLow = Infinity;
      for (let j = i - period + 1; j <= i; j++) {
        if (data[j].high > highestHigh) highestHigh = data[j].high;
        if (data[j].low < lowestLow) lowestLow = data[j].low;
      }

      // 2. 計算 RSV 值
      const close = data[i].close;
      let rsv = 50;
      if (highestHigh !== lowestLow) {
        rsv = ((close - lowestLow) / (highestHigh - lowestLow)) * 100;
      }

      // 3. 計算 K 值與 D 值 (台股公式：今日K = 2/3 * 昨日K + 1/3 * 今日RSV)
      k = (2 / 3) * k + (1 / 3) * rsv;
      d = (2 / 3) * d + (1 / 3) * k;

      result.push({ time: data[i].time, k, d });
    }
    return result;
  }

  /**
   * 相對強弱指標 (RSI)
   * @param {Array} data OHLC 資料
   * @param {number} period 週期 (預設 14)
   * @returns {Array} [{ time, value }]
   */
  function calculateRSI(data, period = 14) {
    const result = [];
    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        result.push({ time: data[i].time, value: null });
        continue;
      }

      const change = data[i].close - data[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;

      if (i < period) {
        avgGain += gain;
        avgLoss += loss;
        result.push({ time: data[i].time, value: null });
        
        // 在第 period 天進行初次平均化
        if (i === period - 1) {
          avgGain /= period;
          avgLoss /= period;
        }
        continue;
      }

      // Wilder 平滑法
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      let rsi = 100;
      if (avgLoss !== 0) {
        const rs = avgGain / avgLoss;
        rsi = 100 - (100 / (1 + rs));
      } else if (avgGain === 0) {
        rsi = 50; // 若無波動則為 50
      }

      result.push({ time: data[i].time, value: rsi });
    }
    return result;
  }

  /**
   * 布林通道 (Bollinger Bands)
   * @param {Array} data OHLC 資料
   * @param {number} period 週期 (預設 20)
   * @param {number} multiplier 標準差倍數 (預設 2)
   * @returns {Array} [{ time, upper, middle, lower, bandwidth }]
   */
  function calculateBollingerBands(data, period = 20, multiplier = 2) {
    const result = [];
    const smaList = calculateSMA(data, period);

    for (let i = 0; i < data.length; i++) {
      const middle = smaList[i].value;

      if (middle === null) {
        result.push({ time: data[i].time, upper: null, middle: null, lower: null, bandwidth: null });
        continue;
      }

      // 計算標準差
      let sumSqDiff = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const diff = data[j].close - middle;
        sumSqDiff += diff * diff;
      }
      const stdDev = Math.sqrt(sumSqDiff / period);

      const upper = middle + multiplier * stdDev;
      const lower = middle - multiplier * stdDev;
      const bandwidth = middle !== 0 ? (upper - lower) / middle : 0;

      result.push({
        time: data[i].time,
        upper,
        middle,
        lower,
        bandwidth
      });
    }
    return result;
  }

  /**
   * 指數平滑異同移動平均線 (MACD)
   * @param {Array} data OHLC 資料
   * @param {number} fast 快線週期 (預設 12)
   * @param {number} slow 慢線週期 (預設 26)
   * @param {number} signal 訊號線週期 (預設 9)
   * @returns {Array} [{ time, dif, dem, osc }]
   */
  function calculateMACD(data, fast = 12, slow = 26, signal = 9) {
    const result = [];
    const emaFast = calculateEMA(data, fast);
    const emaSlow = calculateEMA(data, slow);
    
    // 計算 DIF (快線 - 慢線)
    const difList = [];
    for (let i = 0; i < data.length; i++) {
      const fastVal = emaFast[i].value;
      const slowVal = emaSlow[i].value;
      
      if (fastVal === null || slowVal === null) {
        difList.push({ time: data[i].time, value: null });
      } else {
        difList.push({ time: data[i].time, value: fastVal - slowVal });
      }
    }

    // 計算 DEM (DIF 的訊號線，即 9日 EMA)
    const demList = calculateEMA(difList.map(d => d.value !== null ? d : { time: d.time, close: 0 }), signal);
    
    // 重新修正 demList 的 null 值
    // 慢線需要 26 筆以上才有效，因此 DIF 在 25 筆以前是 null
    // DEM 又需要額外的 9 筆，因此在第 25 + 9 = 34 筆以前應該都設為 null
    const validIdx = slow - 1 + signal - 1;

    for (let i = 0; i < data.length; i++) {
      const dif = difList[i].value;
      let dem = demList[i].value;
      
      if (i < validIdx) {
        result.push({ time: data[i].time, dif: null, dem: null, osc: null });
      } else {
        // OSC (柱狀體) = DIF - DEM
        const osc = dif - dem;
        result.push({
          time: data[i].time,
          dif,
          dem,
          osc
        });
      }
    }

    return result;
  }

  return {
    calculateSMA,
    calculateEMA,
    calculateKD,
    calculateRSI,
    calculateBollingerBands,
    calculateMACD
  };
})();

// 在瀏覽器環境下掛載至 window，Node 環境下匯出
if (typeof window !== 'undefined') {
  window.Indicators = Indicators;
} else if (typeof module !== 'undefined') {
  module.exports = Indicators;
}
