/**
 * 台股精選歷史數據產生器
 * 採用確定性隨機演算法 (Deterministic Pseudo-Random) 模擬各個股票在不同階段的真實市場特徵，
 * 以便於進行策略教學與回測。
 */

const StockDataGenerator = (() => {
  // LCG 偽隨機數產生器，確保每次給定相同 seed 時產生的資料完全一致
  function createRandom(seed) {
    let s = seed;
    return function() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  // 格式化日期 YYYY-MM-DD
  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 產生一組交易日（避開週末）
  function generateTradingDates(startDateStr, length) {
    const dates = [];
    let current = new Date(startDateStr);
    while (dates.length < length) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) { // 避開週六、週日
        dates.push(formatDate(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  /**
   * 根據個股特性模擬日K線資料
   * @param {string} ticker 股票代號
   * @param {number} length 資料筆數，預設 320 筆 (約 1.3 年交易日)
   */
  function generateData(ticker, length = 320) {
    const rand = createRandom(parseInt(ticker) || 12345);
    const dates = generateTradingDates("2025-01-02", length);
    const data = [];

    let price = 100;
    let baseVol = 5000;
    
    // 根據不同股票設定初始值與走勢特徵
    if (ticker === '2330') { // 台積電 (趨勢段：震盪 -> 大跌 -> 噴出 -> 高檔盤整)
      price = 620;
      baseVol = 25000;
    } else if (ticker === '2317') { // 鴻海 (擠壓突破段：長期盤整 -> 爆量突破 -> 回檔 -> 二波噴出)
      price = 105;
      baseVol = 35000;
    } else if (ticker === '2454') { // 聯發科 (寬幅震盪段：大型箱型整理，適合 KD/RSI)
      price = 950;
      baseVol = 4000;
    } else if (ticker === '0050') { // 元大台灣50 (穩健上升段：緩慢向上，小幅拉回)
      price = 135;
      baseVol = 8000;
    }

    for (let i = 0; i < length; i++) {
      let changePercent = 0;
      let volMultiplier = 1.0;

      if (ticker === '2330') {
        // 台積電走勢模擬
        if (i < 80) {
          // 階段 1: 溫和上漲加震盪
          changePercent = (rand() - 0.45) * 2.5 + 0.1; // 略偏向上
        } else if (i < 150) {
          // 階段 2: 大幅拉回下跌段 (空頭)
          changePercent = (rand() - 0.58) * 3.2 - 0.15; // 偏向下跌
          volMultiplier = 1.3; // 下跌帶量
        } else if (i < 260) {
          // 階段 3: 主升段噴出 (均線黃金交叉)
          changePercent = (rand() - 0.38) * 3.8 + 0.4; // 強烈偏向上漲
          volMultiplier = 2.0; // 突破爆量
        } else {
          // 階段 4: 高檔箱型震盪
          changePercent = (rand() - 0.5) * 2.2;
          volMultiplier = 0.9;
        }
      } 
      else if (ticker === '2317') {
        // 鴻海走勢模擬
        if (i < 120) {
          // 階段 1: 極窄幅盤整 (布林通道擠壓)
          changePercent = (rand() - 0.5) * 0.8; // 波動極小
          volMultiplier = 0.3; // 量極縮
        } else if (i < 180) {
          // 階段 2: 強勢爆量突破上軌
          changePercent = (rand() - 0.3) * 4.5 + 0.8; // 強烈上攻
          volMultiplier = 4.0; // 量暴增 4 倍
        } else if (i < 230) {
          // 階段 3: 回檔修正整理
          changePercent = (rand() - 0.55) * 2.5 - 0.1;
          volMultiplier = 1.2;
        } else {
          // 階段 4: 第二波多頭噴出
          changePercent = (rand() - 0.35) * 3.5 + 0.5;
          volMultiplier = 2.5;
        }
      } 
      else if (ticker === '2454') {
        // 聯發科走勢模擬 (箱型震盪，高低波折劇烈)
        // 使用正弦波控制價格中樞，使其在 820 ~ 1250 之間反覆震盪
        const cycle = Math.sin(i * (Math.PI / 40)); // 週期約 80 天
        const drift = cycle * 15; // 產生中樞引力
        
        const currentTarget = 1000 + drift;
        const gap = currentTarget - price;
        
        changePercent = (rand() - 0.5) * 3.5 + (gap * 0.015); // 引入往均值拉回的力道
        volMultiplier = 0.8 + rand() * 0.8;
      } 
      else if (ticker === '0050') {
        // 元大台灣50走勢模擬 (長期慢牛，低波動)
        changePercent = (rand() - 0.44) * 1.5 + 0.05; // 波動小，且期望值為正
        if (i > 100 && i < 130) { // 模擬一次除息或短暫回檔
          changePercent -= 0.3;
        }
        volMultiplier = 0.7 + rand() * 0.6;
      }

      // 計算當天價格 (限制台股 10% 漲跌幅限制作為安全閥，雖模擬不易達到)
      let change = price * (changePercent / 100);
      const maxChange = price * 0.1;
      if (Math.abs(change) > maxChange) {
        change = Math.sign(change) * maxChange;
      }

      const prevClose = price;
      price = prevClose + change;

      // 產生當日的 High / Low / Open
      const noise1 = rand() * 0.4;
      const noise2 = rand() * 0.4;
      
      let open = prevClose + (rand() - 0.5) * (prevClose * 0.01);
      let close = price;
      
      // 確保 open / close 在合理範圍
      let high = Math.max(open, close) + (Math.max(open, close) * (noise1 / 100));
      let low = Math.min(open, close) - (Math.min(open, close) * (noise2 / 100));

      // 隨機微調以防最高/最低完全等於開盤/收盤
      if (high === Math.max(open, close)) high += 0.1;
      if (low === Math.min(open, close)) low -= 0.1;

      // 四捨五入到台股小數點規範 (一般百元以上 0.5 元，百元以下 0.1 或 0.05 元，這裡簡化為小數後兩位)
      open = Math.round(open * 100) / 100;
      high = Math.round(high * 100) / 100;
      low = Math.round(low * 100) / 100;
      close = Math.round(close * 100) / 100;
      
      const volume = Math.round(baseVol * volMultiplier * (0.7 + rand() * 0.6));

      data.push({
        time: dates[i],
        open,
        high,
        low,
        close,
        volume
      });
    }

    return data;
  }

  // 股票基本資訊與描述
  const stockMeta = {
    '2330': {
      name: '台積電',
      ticker: '2330',
      description: '全球半導體代工龍頭，台股權值王。其走勢引領大盤，極具趨勢性。當大波段行情啟動時，使用均線糾合或突破策略能捕捉到極大的獲利空間。',
      tags: ['權值股', '半導體', '趨勢型'],
      defaultStrategy: 'MA_BREAKOUT'
    },
    '2317': {
      name: '鴻海',
      ticker: '2317',
      description: '全球電子代工龍頭。歷史走勢常在長達數月的窄幅區間整理後，配合題材爆量突破。本數據集完美重現了這種「盤整後噴出」的布林通道擠壓型態。',
      tags: ['權值股', '電子代工', '突破型'],
      defaultStrategy: 'BOLLINGER_SQUEEZE'
    },
    '2454': {
      name: '聯發科',
      ticker: '2454',
      description: '全球IC設計大廠。高價股且波動劇烈，長期處於寬幅箱型整理區間。非常適合低買高賣的逆勢指標策略（如 KD 指標在低檔黃金交叉且 RSI 超賣時進場）。',
      tags: ['高價股', 'IC設計', '震盪型'],
      defaultStrategy: 'KD_RSI'
    },
    '0050': {
      name: '元大台灣50',
      ticker: '0050',
      description: '追蹤台灣前 50 大市值公司。波動度低且長期趨勢向上，適合做為長線投資與穩健型策略的標的。對於新手學習趨勢交易與均線扣抵極具價值。',
      tags: ['ETF', '穩健型', '大盤連動'],
      defaultStrategy: 'MA_BREAKOUT'
    }
  };

  /**
   * 從 Yahoo Finance 獲取真實即時與歷史 K 線數據
   * 包含多重 CORS proxy 容錯機制
   */
  async function fetchRealData(ticker) {
    let cleanTicker = ticker.trim().toUpperCase();
    if (!cleanTicker.includes('.')) {
      cleanTicker = `${cleanTicker}.TW`;
    }

    const proxies = [
      (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
      (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
      (url) => `https://thingproxy.freeboard.io/fetch/${url}`
    ];

    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${cleanTicker}?interval=1d&range=2y`;
    let responseText = null;

    for (let i = 0; i < proxies.length; i++) {
      try {
        const proxyUrl = proxies[i](yahooUrl);
        const res = await fetch(proxyUrl);
        if (!res.ok) continue;

        const resData = await res.json();
        
        if (i === 0) {
          responseText = resData.contents;
        } else {
          responseText = typeof resData === 'string' ? resData : JSON.stringify(resData);
        }
        
        if (responseText) break;
      } catch (err) {
        console.warn(`CORS 代理 ${i} 失敗，嘗試下一個...`);
      }
    }

    if (!responseText) {
      throw new Error("無法連接任何 CORS 代理以拉取 Yahoo Finance 數據。請檢查網路連線。");
    }

    const json = JSON.parse(responseText);
    if (!json.chart || !json.chart.result || json.chart.result.length === 0) {
      throw new Error(`找不到股票代號 [${ticker}] 的台股數據。請確認輸入是否正確。`);
    }

    const result = json.chart.result[0];
    const timestamps = result.timestamp;
    
    if (!timestamps || timestamps.length === 0) {
      throw new Error(`找不到股票代號 [${ticker}] 的歷史價格數據。`);
    }

    const quote = result.indicators.quote[0];
    const formatted = [];

    for (let i = 0; i < timestamps.length; i++) {
      if (
        quote.open[i] === null || 
        quote.close[i] === null || 
        quote.high[i] === null || 
        quote.low[i] === null ||
        isNaN(quote.open[i]) ||
        isNaN(quote.close[i])
      ) {
        continue;
      }

      const date = new Date(timestamps[i] * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      formatted.push({
        time: dateStr,
        open: Math.round(quote.open[i] * 100) / 100,
        high: Math.round(quote.high[i] * 100) / 100,
        low: Math.round(quote.low[i] * 100) / 100,
        close: Math.round(quote.close[i] * 100) / 100,
        volume: Math.round(quote.volume[i] || 0)
      });
    }

    return formatted;
  }

  return {
    getHistoryData: generateData,
    fetchRealData,
    stockMeta
  };
})();

// 在瀏覽器環境下掛載至 window，Node 環境下匯出
if (typeof window !== 'undefined') {
  window.StockDataGenerator = StockDataGenerator;
} else if (typeof module !== 'undefined') {
  module.exports = StockDataGenerator;
}
