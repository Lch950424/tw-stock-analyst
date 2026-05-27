/**
 * 交易策略邏輯與訊號產生模組
 * 定義了四套經典且實用的台股獲利策略：
 * 1. 均線糾合突破策略 (MA_BREAKOUT)
 * 2. KD低檔黃金交叉 + RSI策略 (KD_RSI)
 * 3. 布林通道擠壓突破策略 (BOLLINGER_SQUEEZE)
 * 4. MACD柱狀體翻紅策略 (MACD_MOMENTUM)
 */

const Strategies = (() => {

  /**
   * 1. 均線糾合突破策略 (MA_BREAKOUT)
   */
  const MABreakout = {
    name: "均線糾合突破策略",
    description: "當短期(5MA)、中期(20MA)與長期(60MA)均線極度靠攏（糾合）時，代表市場在此區間整理已久，籌碼沉澱。一旦股價爆量突破均線，且均線呈現多頭排列，通常是波段主升段起漲點。",
    calculateSignals: (data) => {
      const ma5 = Indicators.calculateSMA(data, 5);
      const ma20 = Indicators.calculateSMA(data, 20);
      const ma60 = Indicators.calculateSMA(data, 60);
      
      const signals = Array(data.length).fill(null);
      let position = false; // 是否持有部位

      // 計算成交量均線 (5日)
      const volMA5 = [];
      let volSum = 0;
      for (let i = 0; i < data.length; i++) {
        volSum += data[i].volume;
        if (i >= 5) volSum -= data[i - 5].volume;
        volMA5.push(i >= 4 ? volSum / 5 : null);
      }

      for (let i = 60; i < data.length; i++) {
        const p5 = ma5[i].value;
        const p20 = ma20[i].value;
        const p60 = ma60[i].value;
        const prevP5 = ma5[i-1].value;
        const prevP20 = ma20[i-1].value;
        const prevP60 = ma60[i-1].value;

        if (!p5 || !p20 || !p60 || !prevP5 || !prevP20 || !prevP60) continue;

        // 計算均線糾合度 (最大值與最小值的差距比率)
        const maxMA = Math.max(p5, p20, p60);
        const minMA = Math.min(p5, p20, p60);
        const spread = (maxMA - minMA) / minMA;
        const isConverging = spread < 0.025; // 均線差距在 2.5% 以內代表糾合

        const close = data[i].close;
        const prevClose = data[i-1].close;
        const volume = data[i].volume;
        const vma5 = volMA5[i-1];

        // 買入條件：未持股、收盤價站上三條均線、5MA 向上交叉 20MA 或維持多頭發散、且成交量確認
        if (!position) {
          const breakout = close > p5 && close > p20 && close > p60;
          const isBullTrend = (prevP5 <= prevP20 && p5 > p20) || (p5 > p20 && p20 > p60 && spread < 0.04);
          const volConfirm = volume > vma5 * 1.1;

          if (breakout && isBullTrend && volConfirm) {
            signals[i] = 'buy';
            position = true;
          }
        } 
        // 賣出條件：已持股，且收盤價跌破 20MA (月線，生命線)
        else {
          if (close < p20) {
            signals[i] = 'sell';
            position = false;
          }
        }
      }
      return signals;
    },
    getSignalReason: (data, i, type) => {
      const ma5 = Indicators.calculateSMA(data, 5)[i].value;
      const ma20 = Indicators.calculateSMA(data, 20)[i].value;
      const ma60 = Indicators.calculateSMA(data, 60)[i].value;
      
      if (ma5 === null || ma20 === null || ma60 === null) {
        return `
          <div class="flex items-center gap-2 mb-3">
            <span class="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center font-bold text-sm shadow-sm">⚠️</span>
            <div>
              <h4 class="text-gray-100 font-bold text-sm">數據天數不足</h4>
              <p class="text-[10px] text-gray-500 font-mono">${data[i].time}</p>
            </div>
          </div>
          <div class="border-l-2 border-rose-500 bg-rose-500/5 p-3 rounded-r-xl text-gray-300 leading-relaxed text-[11px]">
            目前股票上市交易日天數不足（計算均線糾合需至少 60 天交易數據），長線指標暫無數據。
          </div>
        `;
      }
      
      if (type === 'buy') {
        const spread = ((Math.max(ma5, ma20, ma60) - Math.min(ma5, ma20, ma60)) / Math.min(ma5, ma20, ma60) * 100).toFixed(1);
        return `
          <div class="flex items-center gap-2 mb-3">
            <span class="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center font-bold text-base shadow-sm">B</span>
            <div>
              <h4 class="text-gray-100 font-bold text-sm">均線糾合突破買入訊號</h4>
              <p class="text-[10px] text-gray-500 font-mono">${data[i].time}</p>
            </div>
          </div>
          
          <div class="border-l-2 border-red-500 bg-red-500/5 p-3 rounded-r-xl mb-3 text-gray-300 leading-relaxed text-[11px]">
            當天收盤價為 <strong class="text-white text-xs">${data[i].close} 元</strong>，以長紅 K 強勢站上所有均線，暗示低檔整理行情結束。
          </div>

          <div class="grid grid-cols-2 gap-2 mb-3">
            <div class="bg-gray-900/60 border border-white/5 rounded-xl p-2.5 flex flex-col justify-between">
              <span class="text-gray-500 text-[10px] mb-1">均線緊密糾合度</span>
              <span class="text-sm font-bold text-amber-400 font-mono">${spread}%</span>
              <span class="text-[9px] text-gray-400 mt-0.5">多頭能量極度壓縮</span>
            </div>
            <div class="bg-gray-900/60 border border-white/5 rounded-xl p-2.5 flex flex-col justify-between">
              <span class="text-gray-500 text-[10px] mb-1">成交量確認</span>
              <span class="text-sm font-bold text-blue-400 font-mono">${(data[i].volume / 1000).toFixed(0)} 張</span>
              <span class="text-[9px] text-gray-400 mt-0.5">主力爆量進場追價</span>
            </div>
          </div>

          <div class="bg-gray-800/40 border border-white/5 rounded-xl p-3 text-[11px] text-gray-400 space-y-2 mb-3">
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-red-400 mt-1"></span>
              <div>📈 <strong>多頭排列確立</strong>：5MA (${ma5.toFixed(1)}元) > 20MA (${ma20.toFixed(1)}元) > 60MA (${ma60.toFixed(1)}元)，長中短期均線同步翻揚。</div>
            </div>
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-red-400 mt-1"></span>
              <div>💡 <strong>防守指南</strong>：進場後，可將停損點設在 20MA (月線) 或今日突破 K 線的最低點。未破月線前，波段單應續抱。</div>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="flex items-center gap-2 mb-3">
            <span class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-base shadow-sm">S</span>
            <div>
              <h4 class="text-gray-100 font-bold text-sm">跌破月線出場訊號</h4>
              <p class="text-[10px] text-gray-500 font-mono">${data[i].time}</p>
            </div>
          </div>
          
          <div class="border-l-2 border-emerald-500 bg-emerald-500/5 p-3 rounded-r-xl mb-3 text-gray-300 leading-relaxed text-[11px]">
            當天收盤跌破月線（收盤 <strong class="text-white text-xs">${data[i].close} 元</strong> &lt; 20MA <strong class="text-white text-xs">${ma20.toFixed(1)} 元</strong>）。
          </div>

          <div class="bg-gray-800/40 border border-white/5 rounded-xl p-3 text-[11px] text-gray-400 space-y-2 mb-3">
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1"></span>
              <div>⚠️ <strong>生命線失守</strong>：20MA 是多頭中期的重要防線，跌破代表上漲慣性被打破，可能轉向盤整或跌勢。</div>
            </div>
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1"></span>
              <div>🛡️ <strong>資金風控</strong>：果斷離場以規避回檔風險。保住利潤並退出觀望是交易獲利的關鍵。</div>
            </div>
          </div>
        `;
      }
    }
  };

  /**
   * 2. KD低檔黃金交叉 + RSI策略 (KD_RSI)
   */
  const KDRsi = {
    name: "KD低檔交叉 + RSI策略",
    description: "適用於區間震盪股。當 KD 指標在低檔區 (K,D < 30) 發生黃金交叉，且 RSI 指標從超賣區回升 (RSI > 30)，表明股價已严重超跌，買盤力道強於賣盤，短期極易觸發強彈甚至波段起漲。",
    calculateSignals: (data) => {
      const kd = Indicators.calculateKD(data, 9, 3, 3);
      const rsi = Indicators.calculateRSI(data, 14);
      
      const signals = Array(data.length).fill(null);
      let position = false;

      for (let i = 1; i < data.length; i++) {
        const k = kd[i].k;
        const d = kd[i].d;
        const prevK = kd[i-1].k;
        const prevD = kd[i-1].d;
        const rVal = rsi[i].value;
        const prevRVal = rsi[i-1].value;

        if (k === null || d === null || rVal === null || prevK === null || prevD === null) continue;

        // 買入條件：未持股、KD 在 30 以下黃金交叉 (K由下往上穿過 D)、且 RSI > 30 (代表擺脫弱勢)
        if (!position) {
          const kdGoldCross = prevK <= prevD && k > d;
          const lowZone = k < 32 && d < 32;
          const rsiStrength = rVal > 30 && prevRVal <= 35; // 從底部回升

          if (kdGoldCross && lowZone && rsiStrength) {
            signals[i] = 'buy';
            position = true;
          }
        } 
        // 賣出條件：已持股，KD 在高檔 80 以上死亡交叉，或 RSI 超買 (RSI > 75)
        else {
          const kdDeathCross = prevK >= prevD && k < d;
          const highZone = k > 75 || d > 75;
          const rsiOverbought = rVal > 75;

          if ((kdDeathCross && highZone) || rsiOverbought) {
            signals[i] = 'sell';
            position = false;
          }
        }
      }
      return signals;
    },
    getSignalReason: (data, i, type) => {
      const kd = Indicators.calculateKD(data, 9, 3, 3)[i];
      const rsi = Indicators.calculateRSI(data, 14)[i].value;
      
      if (!kd || kd.k === null || kd.d === null || rsi === null) {
        return `
          <div class="flex items-center gap-2 mb-3">
            <span class="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center font-bold text-sm shadow-sm">⚠️</span>
            <div>
              <h4 class="text-gray-100 font-bold text-sm">數據天數不足</h4>
              <p class="text-[10px] text-gray-500 font-mono">${data[i].time}</p>
            </div>
          </div>
          <div class="border-l-2 border-rose-500 bg-rose-500/5 p-3 rounded-r-xl text-gray-300 leading-relaxed text-[11px]">
            目前股票上市交易日天數不足（計算 KD/RSI 需至少 14 天交易數據），指標暫無數據。
          </div>
        `;
      }
      
      if (type === 'buy') {
        return `
          <div class="flex items-center gap-2 mb-3">
            <span class="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center font-bold text-base shadow-sm">B</span>
            <div>
              <h4 class="text-gray-100 font-bold text-sm">KD 低檔交叉買入訊號</h4>
              <p class="text-[10px] text-gray-500 font-mono">${data[i].time}</p>
            </div>
          </div>
          
          <div class="border-l-2 border-red-500 bg-red-500/5 p-3 rounded-r-xl mb-3 text-gray-300 leading-relaxed text-[11px]">
            當天股價為 <strong class="text-white text-xs">${data[i].close} 元</strong>，技術指標從超跌嚴重區向上發出轉折強彈訊號。
          </div>

          <div class="grid grid-cols-2 gap-2 mb-3">
            <div class="bg-gray-900/60 border border-white/5 rounded-xl p-2.5 flex flex-col justify-between">
              <span class="text-gray-500 text-[10px] mb-1">KD 黃金交叉</span>
              <span class="text-sm font-bold text-amber-400 font-mono">K: ${kd.k.toFixed(1)} / D: ${kd.d.toFixed(1)}</span>
              <span class="text-[9px] text-gray-400 mt-0.5">低檔區 (均小於 32)</span>
            </div>
            <div class="bg-gray-900/60 border border-white/5 rounded-xl p-2.5 flex flex-col justify-between">
              <span class="text-gray-500 text-[10px] mb-1">RSI 強弱力道</span>
              <span class="text-sm font-bold text-blue-400 font-mono">${rsi.toFixed(1)}</span>
              <span class="text-[9px] text-gray-400 mt-0.5">擺脫低於 30 的超賣弱勢</span>
            </div>
          </div>

          <div class="bg-gray-800/40 border border-white/5 rounded-xl p-3 text-[11px] text-gray-400 space-y-2 mb-3">
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-red-400 mt-1"></span>
              <div>🟢 <strong>超跌買盤介入</strong>：KD 與 RSI 同時從超賣極限區爬升，代表空頭賣壓宣洩完畢，多頭開始發力。</div>
            </div>
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-red-400 mt-1"></span>
              <div>💡 <strong>防守指南</strong>：此為偏好區間低買高賣的逆勢短線交易，防守線可設於近期波段最低價，目標前波箱型上軌。</div>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="flex items-center gap-2 mb-3">
            <span class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-base shadow-sm">S</span>
            <div>
              <h4 class="text-gray-100 font-bold text-sm">指標高檔超買出場訊號</h4>
              <p class="text-[10px] text-gray-500 font-mono">${data[i].time}</p>
            </div>
          </div>
          
          <div class="border-l-2 border-emerald-500 bg-emerald-500/5 p-3 rounded-r-xl mb-3 text-gray-300 leading-relaxed text-[11px]">
            當天收盤為 <strong class="text-white text-xs">${data[i].close} 元</strong>，指標來到過熱區發出死亡交叉警報。
          </div>

          <div class="grid grid-cols-2 gap-2 mb-3">
            <div class="bg-gray-900/60 border border-white/5 rounded-xl p-2.5 flex flex-col justify-between">
              <span class="text-gray-500 text-[10px] mb-1">KD 高檔死亡交叉</span>
              <span class="text-sm font-bold text-emerald-400 font-mono">K: ${kd.k.toFixed(1)} / D: ${kd.d.toFixed(1)}</span>
              <span class="text-[9px] text-gray-400 mt-0.5">高檔過熱區 (大於 75)</span>
            </div>
            <div class="bg-gray-900/60 border border-white/5 rounded-xl p-2.5 flex flex-col justify-between">
              <span class="text-gray-500 text-[10px] mb-1">RSI 強度</span>
              <span class="text-sm font-bold text-rose-400 font-mono">${rsi.toFixed(1)}</span>
              <span class="text-[9px] text-gray-400 mt-0.5">警惕隨時回檔修正</span>
            </div>
          </div>

          <div class="bg-gray-800/40 border border-white/5 rounded-xl p-3 text-[11px] text-gray-400 space-y-2 mb-3">
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1"></span>
              <div>🔴 <strong>多頭動能減退</strong>：KD 高位死叉表明上漲力道已鈍化，配合 RSI 超越 75 警戒，高機率迎來回檔。</div>
            </div>
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1"></span>
              <div>🛡️ <strong>落袋為安</strong>：在箱型市場中，不貪戀最後一段利潤，分批出場退場是維護複利績效的最佳交易策略。</div>
            </div>
          </div>
        `;
      }
    }
  };

  /**
   * 3. 布林通道擠壓突破策略 (BOLLINGER_SQUEEZE)
   */
  const BollingerSqueeze = {
    name: "布林通道突破策略",
    description: "當布林通道帶寬收窄（擠壓）到歷史低位時，代表股價即將選擇方向爆發。如果收盤價實體突破上軌，且成交量比均量顯著放大，就是強力的買入訊號，通常會啟動一波猛烈的暴漲趨勢。",
    calculateSignals: (data) => {
      const bb = Indicators.calculateBollingerBands(data, 20, 2);
      const signals = Array(data.length).fill(null);
      let position = false;

      // 計算 10日成交量均量
      const volMA10 = [];
      let volSum = 0;
      for (let i = 0; i < data.length; i++) {
        volSum += data[i].volume;
        if (i >= 10) volSum -= data[i - 10].volume;
        volMA10.push(i >= 9 ? volSum / 10 : null);
      }

      // 計算帶寬的移動平均，用以判斷「擠壓」
      const bwList = bb.map(b => b.bandwidth);
      
      for (let i = 25; i < data.length; i++) {
        const b = bb[i];
        const prevB = bb[i-1];
        if (!b.upper || !prevB.upper) continue;

        // 計算過去 30 天的平均帶寬
        let bwSum = 0;
        for (let j = i - 30; j < i; j++) {
          bwSum += bwList[j] || 0.15;
        }
        const avgBw = bwSum / 30;

        // 帶寬擠壓條件：當前帶寬小於過去 30 天平均帶寬的 85%
        const isSqueezed = b.bandwidth < avgBw * 0.85;

        const close = data[i].close;
        const open = data[i].open;
        const volume = data[i].volume;
        const vma10 = volMA10[i-1];

        // 買入條件：未持股、過去發生過擠壓、今日實體紅K強勢突破上軌、成交量大於10日均量的1.25倍
        if (!position) {
          const isRedCandle = close > open;
          const breakoutUpper = close > b.upper && data[i-1].close <= prevB.upper;
          const volumeOk = volume > vma10 * 1.25;

          // 為了增強可用性，放寬一點點：不需要當天必須處於極限 squeeze，但過去 5 天內必須有帶寬收窄的特徵
          let pastSqueeze = false;
          for (let k = i - 5; k <= i; k++) {
            let tempBwSum = 0;
            for (let m = k - 30; m < k; m++) {
              tempBwSum += bwList[m] || 0.15;
            }
            if (bb[k].bandwidth < (tempBwSum / 30) * 0.9) {
              pastSqueeze = true;
              break;
            }
          }

          if (breakoutUpper && isRedCandle && volumeOk && pastSqueeze) {
            signals[i] = 'buy';
            position = true;
          }
        } 
        // 賣出條件：已持股，且跌破布林中軌 (20MA) 
        else {
          if (close < b.middle) {
            signals[i] = 'sell';
            position = false;
          }
        }
      }
      return signals;
    },
    getSignalReason: (data, i, type) => {
      const b = Indicators.calculateBollingerBands(data, 20, 2)[i];
      if (!b || b.bandwidth === null || b.upper === null || b.middle === null) {
        return `
          <div class="flex items-center gap-2 mb-3">
            <span class="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center font-bold text-sm shadow-sm">⚠️</span>
            <div>
              <h4 class="text-gray-100 font-bold text-sm">數據天數不足</h4>
              <p class="text-[10px] text-gray-500 font-mono">${data[i].time}</p>
            </div>
          </div>
          <div class="border-l-2 border-rose-500 bg-rose-500/5 p-3 rounded-r-xl text-gray-300 leading-relaxed text-[11px]">
            目前股票上市交易日天數不足（計算布林通道需至少 20 天交易數據），布林指標暫無數據。
          </div>
        `;
      }
      const bandwidthPct = (b.bandwidth * 100).toFixed(1);
      
      if (type === 'buy') {
        return `
          <div class="flex items-center gap-2 mb-3">
            <span class="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center font-bold text-base shadow-sm">B</span>
            <div>
              <h4 class="text-gray-100 font-bold text-sm">布林通道突破買入訊號</h4>
              <p class="text-[10px] text-gray-500 font-mono">${data[i].time}</p>
            </div>
          </div>
          
          <div class="border-l-2 border-red-500 bg-red-500/5 p-3 rounded-r-xl mb-3 text-gray-300 leading-relaxed text-[11px]">
            當天股價以實體紅 K 強勢突破布林上軌（收盤 <strong class="text-white text-xs">${data[i].close} 元</strong> &gt; 上軌 <strong class="text-white text-xs">${b.upper.toFixed(1)} 元</strong>）。
          </div>

          <div class="grid grid-cols-2 gap-2 mb-3">
            <div class="bg-gray-900/60 border border-white/5 rounded-xl p-2.5 flex flex-col justify-between">
              <span class="text-gray-500 text-[10px] mb-1">通道寬度 (Bandwidth)</span>
              <span class="text-sm font-bold text-amber-400 font-mono">${bandwidthPct}%</span>
              <span class="text-[9px] text-gray-400 mt-0.5">經歷長時間擠壓能量壓縮</span>
            </div>
            <div class="bg-gray-900/60 border border-white/5 rounded-xl p-2.5 flex flex-col justify-between">
              <span class="text-gray-500 text-[10px] mb-1">量能確認</span>
              <span class="text-sm font-bold text-blue-400 font-mono">${(data[i].volume / 1000).toFixed(0)} 張</span>
              <span class="text-[9px] text-gray-400 mt-0.5">買盤表態，非虛假突破</span>
            </div>
          </div>

          <div class="bg-gray-800/40 border border-white/5 rounded-xl p-3 text-[11px] text-gray-400 space-y-2 mb-3">
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-red-400 mt-1"></span>
              <div>🚀 <strong>帶量走軌飆股型態</strong>：布林帶寬收窄後爆發，是台股極強波段噴出的特徵。</div>
            </div>
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-red-400 mt-1"></span>
              <div>💡 <strong>防守指南</strong>：只要布林通道維持開口朝上，股價會貼著上軌前進。移動防守線可設在 20MA（中軌），跌破中軌再分批出場。</div>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="flex items-center gap-2 mb-3">
            <span class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-base shadow-sm">S</span>
            <div>
              <h4 class="text-gray-100 font-bold text-sm">跌破布林中軌出場訊號</h4>
              <p class="text-[10px] text-gray-500 font-mono">${data[i].time}</p>
            </div>
          </div>
          
          <div class="border-l-2 border-emerald-500 bg-emerald-500/5 p-3 rounded-r-xl mb-3 text-gray-300 leading-relaxed text-[11px]">
            當天收盤價跌破布林中軌（收盤 <strong class="text-white text-xs">${data[i].close} 元</strong> &lt; 中軌 20MA <strong class="text-white text-xs">${b.middle.toFixed(1)} 元</strong>）。
          </div>

          <div class="bg-gray-800/40 border border-white/5 rounded-xl p-3 text-[11px] text-gray-400 space-y-2 mb-3">
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1"></span>
              <div>⚠️ <strong>多頭動能中止</strong>：股價由上軌區一路跌破中軌，表示多頭推升的氣勢已經結束，市場進入震盪或空頭修正。</div>
            </div>
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1"></span>
              <div>🛡️ <strong>出場防禦</strong>：嚴格遵守紀律平倉，鎖定先前主升段突破的獲利，避免利潤吞噬或擴大虧損。</div>
            </div>
          </div>
        `;
      }
    }
  };

  /**
   * 4. MACD柱狀體翻紅與背離策略 (MACD_MOMENTUM)
   */
  const MACDMomentum = {
    name: "MACD柱狀體翻紅策略",
    description: "MACD 是指標之王，用於追蹤中期動能。當 MACD 柱狀體 (OSC) 由負值翻向正值（即由綠翻紅），或者快線(DIF)與慢線(MACD)在零軸下方低檔黃金交叉，都代表股價跌勢竭盡，多頭攻擊動能重新點火，為高勝率的波段買點。",
    calculateSignals: (data) => {
      const macd = Indicators.calculateMACD(data, 12, 26, 9);
      const signals = Array(data.length).fill(null);
      let position = false;

      for (let i = 1; i < data.length; i++) {
        const m = macd[i];
        const prevM = macd[i-1];
        
        if (m.dif === null || m.dem === null || prevM.dif === null || prevM.dem === null) continue;

        // 買入條件：未持股、柱狀體翻紅 (osc > 0 且前一日 <= 0)，且 DIF, DEM 的數值不處於高檔過熱區
        if (!position) {
          const oscTurnRed = m.osc > 0 && prevM.osc <= 0;
          // 快慢線黃金交叉，如果在零軸下尤佳
          const difGoldCross = prevM.dif <= prevM.dem && m.dif > m.dem;
          
          if (oscTurnRed || (difGoldCross && m.dif < 5)) {
            signals[i] = 'buy';
            position = true;
          }
        } 
        // 賣出條件：已持股，柱狀體翻綠 (osc < 0 且前一日 >= 0) 或快線跌破慢線 (死亡交叉)
        else {
          const oscTurnGreen = m.osc < 0 && prevM.osc >= 0;
          const difDeathCross = prevM.dif >= prevM.dem && m.dif < m.dem;

          if (oscTurnGreen || difDeathCross) {
            signals[i] = 'sell';
            position = false;
          }
        }
      }
      return signals;
    },
    getSignalReason: (data, i, type) => {
      const m = Indicators.calculateMACD(data, 12, 26, 9)[i];
      if (!m || m.dif === null || m.dem === null || m.osc === null) {
        return `
          <div class="flex items-center gap-2 mb-3">
            <span class="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center font-bold text-sm shadow-sm">⚠️</span>
            <div>
              <h4 class="text-gray-100 font-bold text-sm">數據天數不足</h4>
              <p class="text-[10px] text-gray-500 font-mono">${data[i].time}</p>
            </div>
          </div>
          <div class="border-l-2 border-rose-500 bg-rose-500/5 p-3 rounded-r-xl text-gray-300 leading-relaxed text-[11px]">
            目前股票上市交易日天數不足（計算 MACD 需至少 34 天交易數據），MACD 指標暫無數據。
          </div>
        `;
      }
      
      if (type === 'buy') {
        return `
          <div class="flex items-center gap-2 mb-3">
            <span class="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center font-bold text-base shadow-sm">B</span>
            <div>
              <h4 class="text-gray-100 font-bold text-sm">MACD 動能翻紅買入訊號</h4>
              <p class="text-[10px] text-gray-500 font-mono">${data[i].time}</p>
            </div>
          </div>
          
          <div class="border-l-2 border-red-500 bg-red-500/5 p-3 rounded-r-xl mb-3 text-gray-300 leading-relaxed text-[11px]">
            當天收盤價為 <strong class="text-white text-xs">${data[i].close} 元</strong>，MACD 快慢線交叉或柱狀體翻正，多頭動能增強。
          </div>

          <div class="grid grid-cols-2 gap-2 mb-3">
            <div class="bg-gray-900/60 border border-white/5 rounded-xl p-2.5 flex flex-col justify-between">
              <span class="text-gray-500 text-[10px] mb-1">柱狀體動能 (OSC)</span>
              <span class="text-sm font-bold text-amber-400 font-mono">${m.osc.toFixed(2)}</span>
              <span class="text-[9px] text-gray-400 mt-0.5">由負翻正 (綠翻紅)</span>
            </div>
            <div class="bg-gray-900/60 border border-white/5 rounded-xl p-2.5 flex flex-col justify-between">
              <span class="text-gray-500 text-[10px] mb-1">快慢乖離 (DIF)</span>
              <span class="text-sm font-bold text-blue-400 font-mono">${m.dif.toFixed(2)}</span>
              <span class="text-[9px] text-gray-400 mt-0.5">慢線 (DEM): ${m.dem.toFixed(2)}</span>
            </div>
          </div>

          <div class="bg-gray-800/40 border border-white/5 rounded-xl p-3 text-[11px] text-gray-400 space-y-2 mb-3">
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-red-400 mt-1"></span>
              <div>📈 <strong>多頭動能重啟</strong>：OSC 翻正說明買方力道全面壓制賣方，此時適合作為健康的多頭波段買點。</div>
            </div>
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-red-400 mt-1"></span>
              <div>💡 <strong>防守指南</strong>：MACD 是中長線趨勢指標。只要柱狀體維持紅色向上成長，持股即可抱牢，直至柱狀體再度由正翻負。</div>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="flex items-center gap-2 mb-3">
            <span class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-base shadow-sm">S</span>
            <div>
              <h4 class="text-gray-100 font-bold text-sm">MACD 動能熄火出場訊號</h4>
              <p class="text-[10px] text-gray-500 font-mono">${data[i].time}</p>
            </div>
          </div>
          
          <div class="border-l-2 border-emerald-500 bg-emerald-500/5 p-3 rounded-r-xl mb-3 text-gray-300 leading-relaxed text-[11px]">
            當天收盤價為 <strong class="text-white text-xs">${data[i].close} 元</strong>，快線跌破慢線死叉或柱狀體翻綠，中期趨勢轉弱。
          </div>

          <div class="grid grid-cols-2 gap-2 mb-3">
            <div class="bg-gray-900/60 border border-white/5 rounded-xl p-2.5 flex flex-col justify-between">
              <span class="text-gray-500 text-[10px] mb-1">柱狀體動能 (OSC)</span>
              <span class="text-sm font-bold text-emerald-400 font-mono">${m.osc.toFixed(2)}</span>
              <span class="text-[9px] text-gray-400 mt-0.5">由正翻負 (紅翻綠)</span>
            </div>
            <div class="bg-gray-900/60 border border-white/5 rounded-xl p-2.5 flex flex-col justify-between">
              <span class="text-gray-500 text-[10px] mb-1">快慢乖離 (DIF)</span>
              <span class="text-sm font-bold text-rose-400 font-mono">${m.dif.toFixed(2)}</span>
              <span class="text-[9px] text-gray-400 mt-0.5">慢線 (DEM): ${m.dem.toFixed(2)}</span>
            </div>
          </div>

          <div class="bg-gray-800/40 border border-white/5 rounded-xl p-3 text-[11px] text-gray-400 space-y-2 mb-3">
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1"></span>
              <div>🟢 <strong>買盤力道衰退</strong>：MACD 柱狀體翻負或死叉代表原本強勁的多頭走勢面臨失速，高機率出現深幅回檔。</div>
            </div>
            <div class="flex items-start gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1"></span>
              <div>🛡️ <strong>紀律鎖利</strong>：中長線指標翻空時一定要順勢出場，守住利潤，避開空頭初跌段。</div>
            </div>
          </div>
        `;
      }
    }
  };

  // 策略字典
  const strategies = {
    'MA_BREAKOUT': MABreakout,
    'KD_RSI': KDRsi,
    'BOLLINGER_SQUEEZE': BollingerSqueeze,
    'MACD_MOMENTUM': MACDMomentum
  };

  return {
    strategies,
    getStrategy: (id) => strategies[id]
  };
})();

// 在瀏覽器環境下掛載至 window，Node 環境下匯出
if (typeof window !== 'undefined') {
  window.Strategies = Strategies;
} else if (typeof module !== 'undefined') {
  module.exports = Strategies;
}
