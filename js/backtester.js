/**
 * 回測引擎與績效計算模組
 * 模擬真實的台股交易規則（以「張」1,000股為交易單位，計算券商手續費 0.1425% 與證交稅），
 * 計算累積報酬率、勝率、最大回撤 (MDD) 等關鍵績效指標，並生成每日資產淨值曲線。
 */

const Backtester = (() => {

  /**
   * 執行策略回測
   * @param {Array} data K線資料
   * @param {Array} signals 與 K線等長的買賣訊號陣列 ('buy', 'sell', null)
   * @param {Object} options 回測參數
   */
  function runBacktest(data, signals, options = {}) {
    const initialCapital = options.initialCapital || 1000000; // 預設 100 萬台幣
    const commissionRate = options.commissionRate || 0.001425; // 0.1425%
    const discount = options.discount || 0.6; // 手續費 6 折
    const taxRate = options.taxRate || 0.003; // 個股 0.3%，ETF 0.1%
    const minCommission = 20; // 門檻 20 元手續費

    let cash = initialCapital;
    let shares = 0; // 持有股數
    let buyPrice = 0;
    let buyTime = null;
    let buyCost = 0; // 買入時的交易成本

    const trades = []; // 歷史交易明細
    const equityCurve = []; // 每日資產淨值

    for (let i = 0; i < data.length; i++) {
      const today = data[i];
      const signal = signals[i];

      // 1. 處理訊號
      if (signal === 'buy' && shares === 0) {
        // 買入：在出現訊號當天的收盤價買入
        // 計算可買最大張數（以 1,000 股為單位）
        // 考慮手續費：價金 + 手續費 <= 餘額
        const maxLots = Math.floor(cash / (today.close * 1000 * (1 + commissionRate * discount)));
        
        if (maxLots > 0) {
          shares = maxLots * 1000;
          const principal = shares * today.close;
          let fee = principal * commissionRate * discount;
          if (fee < minCommission) fee = minCommission;
          fee = Math.round(fee);

          buyCost = fee;
          buyPrice = today.close;
          buyTime = today.time;
          
          cash -= (principal + fee);
        }
      } 
      else if (signal === 'sell' && shares > 0) {
        // 賣出：在當天收盤價賣出
        const principal = shares * today.close;
        let fee = principal * commissionRate * discount;
        if (fee < minCommission) fee = minCommission;
        fee = Math.round(fee);
        
        let tax = Math.round(principal * taxRate); // 賣出時需繳納證交稅
        
        const netProceeds = principal - fee - tax;
        cash += netProceeds;

        const totalCost = buyCost + fee + tax;
        const profit = netProceeds - (shares * buyPrice + buyCost);
        const returnPct = (profit / (shares * buyPrice + buyCost)) * 100;
        const duration = i - data.findIndex(d => d.time === buyTime);

        trades.push({
          buyTime,
          sellTime: today.time,
          shares,
          buyPrice,
          sellPrice: today.close,
          grossProfit: principal - (shares * buyPrice),
          netProfit: profit,
          returnPct: Math.round(returnPct * 100) / 100,
          costs: totalCost,
          durationDays: duration
        });

        shares = 0;
        buyPrice = 0;
        buyTime = null;
        buyCost = 0;
      }

      // 2. 每日記錄資產淨值 (持股價值 + 現金)
      const currentShareValue = shares * today.close;
      const totalEquity = cash + currentShareValue;
      equityCurve.push({
        time: today.time,
        value: Math.round(totalEquity)
      });
    }

    // 3. 如果在最後一天仍持有部位，進行虛擬平倉以便計算總績效
    let finalShares = shares;
    let finalCash = cash;
    let finalTrades = [...trades];
    if (finalShares > 0) {
      const today = data[data.length - 1];
      const principal = finalShares * today.close;
      let fee = principal * commissionRate * discount;
      if (fee < minCommission) fee = minCommission;
      fee = Math.round(fee);
      let tax = Math.round(principal * taxRate);
      
      const netProceeds = principal - fee - tax;
      const profit = netProceeds - (finalShares * buyPrice + buyCost);
      const returnPct = (profit / (finalShares * buyPrice + buyCost)) * 100;
      const duration = (data.length - 1) - data.findIndex(d => d.time === buyTime);

      finalTrades.push({
        buyTime,
        sellTime: today.time,
        shares: finalShares,
        buyPrice,
        sellPrice: today.close,
        grossProfit: principal - (finalShares * buyPrice),
        netProfit: profit,
        returnPct: Math.round(returnPct * 100) / 100,
        costs: buyCost + fee + tax,
        durationDays: duration,
        isUnrealized: true // 標記為未實現（強制平倉）
      });
      finalCash += netProceeds;
    }

    // 4. 計算統計績效
    const totalReturn = ((finalCash - initialCapital) / initialCapital) * 100;
    
    // 計算買入持有策略 (Buy & Hold) 作為對照組
    // 第一天開盤就全部買入張數，抱到最後一天賣出
    const firstDay = data[0];
    const lastDay = data[data.length - 1];
    const bhLots = Math.floor(initialCapital / (firstDay.close * 1000 * (1 + commissionRate * discount)));
    let bhReturn = 0;
    if (bhLots > 0) {
      const bhShares = bhLots * 1000;
      const bhBuyFee = Math.round(bhShares * firstDay.close * commissionRate * discount);
      const bhBuyTotal = bhShares * firstDay.close + bhBuyFee;
      const bhRemainingCash = initialCapital - bhBuyTotal;
      
      const bhSellValue = bhShares * lastDay.close;
      const bhSellFee = Math.round(bhSellValue * commissionRate * discount);
      const bhSellTax = Math.round(bhSellValue * taxRate);
      
      const bhFinalCapital = bhRemainingCash + (bhSellValue - bhSellFee - bhSellTax);
      bhReturn = ((bhFinalCapital - initialCapital) / initialCapital) * 100;
    } else {
      bhReturn = ((lastDay.close - firstDay.close) / firstDay.close) * 100;
    }

    // 勝率與賺賠比
    const winTrades = finalTrades.filter(t => t.netProfit > 0);
    const lossTrades = finalTrades.filter(t => t.netProfit <= 0);
    const winRate = finalTrades.length > 0 ? (winTrades.length / finalTrades.length) * 100 : 0;

    const avgWin = winTrades.length > 0 ? winTrades.reduce((sum, t) => sum + t.netProfit, 0) / winTrades.length : 0;
    const avgLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, t) => sum + t.netProfit, 0) / lossTrades.length : 0;
    const profitFactor = Math.abs(avgLoss) !== 0 ? (winTrades.reduce((sum, t) => sum + t.netProfit, 0) / Math.abs(lossTrades.reduce((sum, t) => sum + t.netProfit, 0))) : Infinity;

    // 最大回撤 (MDD) 計算
    let maxEquity = -Infinity;
    let maxDrawdown = 0;
    for (let i = 0; i < equityCurve.length; i++) {
      const val = equityCurve[i].value;
      if (val > maxEquity) {
        maxEquity = val;
      }
      const dd = (maxEquity - val) / maxEquity;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }
    }

    return {
      summary: {
        initialCapital,
        finalCapital: Math.round(shares > 0 ? finalCash : cash + (shares * data[data.length-1].close)),
        totalReturn: Math.round(totalReturn * 100) / 100,
        buyAndHoldReturn: Math.round(bhReturn * 100) / 100,
        totalTrades: finalTrades.length,
        winTradesCount: winTrades.length,
        lossTradesCount: lossTrades.length,
        winRate: Math.round(winRate * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 10000) / 100, // 百分比
        profitFactor: isFinite(profitFactor) ? Math.round(profitFactor * 100) / 100 : 'N/A',
        avgWin: Math.round(avgWin),
        avgLoss: Math.round(avgLoss)
      },
      trades: finalTrades,
      equityCurve
    };
  }

  return {
    runBacktest
  };
})();

// 在瀏覽器環境下掛載至 window，Node 環境下匯出
if (typeof window !== 'undefined') {
  window.Backtester = Backtester;
} else if (typeof module !== 'undefined') {
  module.exports = Backtester;
}
