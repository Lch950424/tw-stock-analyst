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
      
      if (type === 'buy') {
        const spread = ((Math.max(ma5, ma20, ma60) - Math.min(ma5, ma20, ma60)) / Math.min(ma5, ma20, ma60) * 100).toFixed(1);
        return `
          <h4 class="text-red-400 font-semibold mb-2 flex items-center gap-1">
            <span class="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            策略觸發：均線糾合突破買入訊號
          </h4>
          <p class="text-gray-300 text-sm leading-relaxed mb-3">
            當天收盤價為 <strong>${data[i].close} 元</strong>，成功站上所有短中長期均線（5MA: ${ma5.toFixed(1)}元, 20MA: ${ma20.toFixed(1)}元, 60MA: ${ma60.toFixed(1)}元）。
          </p>
          <div class="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-1 mb-3">
            <div>📈 <strong>多頭排列</strong>：5MA > 20MA > 60MA，代表短中長期趨勢同步轉強。</div>
            <div>⚡ <strong>均線緊密糾合</strong>：當時三條均線的乖離率僅 <strong>${spread}%</strong>，代表主力已在低檔收購籌碼，能量極度壓縮。</div>
            <div>📊 <strong>量能確認</strong>：成交量 <strong>${(data[i].volume / 1000).toFixed(0)} 張</strong>，較前幾天明顯放大，代表有實質性買盤進場追價，並非虛假突破。</div>
          </div>
          <p class="text-amber-400/90 text-xs italic">💡 <strong>操作心法</strong>：進場後，可將防守停損點設在 20MA (月線) 或是當天突破 K 線的最低點。只要沒有跌破月線，就抱牢波段以賺取完整主升段利潤。</p>
        `;
      } else {
        return `
          <h4 class="text-emerald-400 font-semibold mb-2 flex items-center gap-1">
            <span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            策略觸發：破線停損/出場訊號
          </h4>
          <p class="text-gray-300 text-sm leading-relaxed mb-3">
            當天收盤價跌破 20MA 月線（當時月線價格為 <strong>${ma20.toFixed(1)} 元</strong>，收盤為 <strong>${data[i].close} 元</strong>）。
          </p>
          <div class="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-1 mb-3">
            <div>⚠️ <strong>生命線失守</strong>：20MA 被視為多頭短期的護城河。跌破 20MA 代表多頭攻勢暫告結束，可能轉為盤整或空頭趨勢。</div>
            <div>📉 <strong>落袋為安</strong>：此時果斷停損或停利出場，能避開後續更大幅度的修正，保護手頭資金。</div>
          </div>
          <p class="text-amber-400/90 text-xs italic">💡 <strong>交易紀律</strong>：永遠不要和趨勢對抗。當主力護盤的月線被實體黑 K 跌破時，嚴格執行紀律出場，留得青山在，不怕沒柴燒。</p>
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
      
      if (type === 'buy') {
        return `
          <h4 class="text-red-400 font-semibold mb-2 flex items-center gap-1">
            <span class="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            策略觸發：KD 低檔交叉買入訊號
          </h4>
          <p class="text-gray-300 text-sm leading-relaxed mb-3">
            當前股價為 <strong>${data[i].close} 元</strong>，技術指標在超跌區發出明確的轉折上漲訊號。
          </p>
          <div class="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-1 mb-3">
            <div>🟡 <strong>KD黃金交叉</strong>：K值為 <strong>${kd.k.toFixed(1)}</strong>，D值為 <strong>${kd.d.toFixed(1)}</strong>。K 線自低檔向上穿過 D 線，代表短期價格動能扭轉。</div>
            <div>🔵 <strong>RSI 超賣回升</strong>：RSI(14) 為 <strong>${rsi.toFixed(1)}</strong>，擺脫小於 30 的極度超賣區，反映買盤湧入。</div>
          </div>
          <p class="text-amber-400/90 text-xs italic">💡 <strong>操作心法</strong>：此時屬於逆勢或轉折波交易，勝率取決於箱型震盪的邊界。停損點可設在近期波段低點。一旦反彈至箱型上軌，需注意分批獲利了結。</p>
        `;
      } else {
        return `
          <h4 class="text-emerald-400 font-semibold mb-2 flex items-center gap-1">
            <span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            策略觸發：超買獲利了結訊號
          </h4>
          <p class="text-gray-300 text-sm leading-relaxed mb-3">
            指標來到高檔過熱區，發出死亡交叉或超買警戒（當天 K值: <strong>${kd.k.toFixed(1)}</strong>, D值: <strong>${kd.d.toFixed(1)}</strong>, RSI: <strong>${rsi.toFixed(1)}</strong>）。
          </p>
          <div class="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-1 mb-3">
            <div>🔴 <strong>KD 高檔死亡交叉</strong>：K值向下跌破 D值，表示上漲速度減緩，多頭力道耗盡。</div>
            <div>🔥 <strong>RSI 過熱警戒</strong>：RSI 超過 75，市場情緒高度亢奮，回檔修正機率大增。</div>
          </div>
          <p class="text-amber-400/90 text-xs italic">💡 <strong>交易紀律</strong>：不賺最後一銅板。在震盪市中，高檔過熱區果斷出場是保住獲利的關鍵，不要因為追高而把利潤吐回去。</p>
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
      const bandwidthPct = (b.bandwidth * 100).toFixed(1);
      
      if (type === 'buy') {
        return `
          <h4 class="text-red-400 font-semibold mb-2 flex items-center gap-1">
            <span class="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            策略觸發：布林帶寬收窄突破買入訊號
          </h4>
          <p class="text-gray-300 text-sm leading-relaxed mb-3">
            當天股價以強勢紅 K 突破布林上軌（收盤 <strong>${data[i].close} 元</strong> > 上軌 <strong>${b.upper.toFixed(1)} 元</strong>）。
          </p>
          <div class="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-1 mb-3">
            <div>🚀 <strong>帶寬擠壓釋放</strong>：前段通道極度收窄（頻寬僅 <strong>${bandwidthPct}%</strong>），代表市場積累了龐大的波動能量。今日往上突破，能量正式噴發。</div>
            <div>📈 <strong>紅K站穩上軌</strong>：股價貼著上軌強勢推升，是極強多頭走勢的特徵（俗稱「帶量走軌」）。</div>
            <div>📊 <strong>爆量確認</strong>：成交量 <strong>${(data[i].volume / 1000).toFixed(0)} 張</strong>，確認為真突破。</div>
          </div>
          <p class="text-amber-400/90 text-xs italic">💡 <strong>操作心法</strong>：布林帶寬突破往往是「飆股」的起點。如果通道持續張開，股價會沿著上軌往上。防守線可設在 20MA（中軌），跌破中軌再出場即可。</p>
        `;
      } else {
        return `
          <h4 class="text-emerald-400 font-semibold mb-2 flex items-center gap-1">
            <span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            策略觸發：跌破布林中軌出場訊號
          </h4>
          <p class="text-gray-300 text-sm leading-relaxed mb-3">
            當天收盤價跌破布林中軌（收盤 <strong>${data[i].close} 元</strong> < 中軌 20MA <strong>${b.middle.toFixed(1)} 元</strong>）。
          </p>
          <div class="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-1 mb-3">
            <div>⚠️ <strong>多頭動能熄火</strong>：股價由上軌向下跌穿中軌，代表原本沿軌上漲的強勢多頭型態遭到破壞。</div>
            <div>📉 <strong>回檔或轉折防範</strong>：跌破中軌代表股價可能進入空頭或進入大箱型盤整，出場退場觀望，鎖定獲利。</div>
          </div>
          <p class="text-amber-400/90 text-xs italic">💡 <strong>交易紀律</strong>：當股價從強勢軌道跌破中軌，一定要捨得停利或止損，切勿抱著凹單，以免利潤回吐甚至轉為大幅虧損。</p>
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
      
      if (type === 'buy') {
        return `
          <h4 class="text-red-400 font-semibold mb-2 flex items-center gap-1">
            <span class="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            策略觸發：MACD 動能翻紅買入訊號
          </h4>
          <p class="text-gray-300 text-sm leading-relaxed mb-3">
            當日股價收 <strong>${data[i].close} 元</strong>，MACD 指標在低檔或中檔確認動能轉強。
          </p>
          <div class="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-1 mb-3">
            <div>📊 <strong>柱狀體翻紅 (OSC)</strong>：OSC 數值達 <strong>${m.osc.toFixed(2)}</strong>。由負轉正代表多頭買盤力量已經超越空頭賣盤，買氣重新點火。</div>
            <div>📈 <strong>雙線指標</strong>：DIF (快線) 為 <strong>${m.dif.toFixed(2)}</strong>，DEM (慢線) 為 <strong>${m.dem.toFixed(2)}</strong>，兩線於健康區間黃金交叉或呈多頭發散。</div>
          </div>
          <p class="text-amber-400/90 text-xs italic">💡 <strong>操作心法</strong>：MACD 翻紅適合波段操作。如果是在零軸以上的翻紅，屬於強勢多頭的乘勝追擊；在零軸以下的翻紅則偏向打底反彈。只要柱狀體維持紅色，即可持續抱股。</p>
        `;
      } else {
        return `
          <h4 class="text-emerald-400 font-semibold mb-2 flex items-center gap-1">
            <span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            策略觸發：MACD 動能翻綠出場訊號
          </h4>
          <p class="text-gray-300 text-sm leading-relaxed mb-3">
            MACD 指標柱狀體由正翻負，或雙線死亡交叉（當前 DIF: <strong>${m.dif.toFixed(2)}</strong>, DEM: <strong>${m.dem.toFixed(2)}</strong>, OSC: <strong>${m.osc.toFixed(2)}</strong>）。
          </p>
          <div class="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-1 mb-3">
            <div>🟢 <strong>柱狀體翻綠 (OSC < 0)</strong>：代表多頭推升力道已竭，空頭力量開始佔據上風。</div>
            <div>⚠️ <strong>死亡交叉</strong>：DIF 跌破 DEM，屬於中線走弱訊號，股價隨後高機率陷入盤整或下跌通道。</div>
          </div>
          <p class="text-amber-400/90 text-xs italic">💡 <strong>交易紀律</strong>：MACD 動能翻綠常能幫助投資人避開隨後的大跌。寧可少賺，也不要在大動能翻空時抱股，執行紀律出場才能確保長期獲利。</p>
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
