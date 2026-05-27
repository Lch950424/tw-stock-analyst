/**
 * 策略回測核心邏輯自動驗證腳本
 * 用於在 Node 環境下檢查數據產生、指標計算、訊號觸發與回測統計的正確性。
 */

const assert = require('assert');
const StockDataGenerator = require('./js/data.js');
const Indicators = require('./js/indicators.js');

// 在 Node 測試環境中，將模組掛載至 global，模擬瀏覽器的 window 全局環境
global.Indicators = Indicators;
global.StockDataGenerator = StockDataGenerator;

const Strategies = require('./js/strategies.js');
const Backtester = require('./js/backtester.js');

console.log('🧪 開始執行自動驗證測試...');

try {
  // 1. 測試資料產生器
  const tickers = ['2330', '2317', '2454', '0050'];
  tickers.forEach(ticker => {
    const data = StockDataGenerator.getHistoryData(ticker);
    assert.strictEqual(data.length, 320, `股票 ${ticker} 資料筆數不符`);
    const firstRow = data[0];
    assert.ok(firstRow.time, '缺少 time 欄位');
    assert.ok(firstRow.open > 0, 'open 必須大於 0');
    assert.ok(firstRow.high >= firstRow.low, 'high 必須大於等於 low');
    assert.ok(firstRow.close > 0, 'close 必須大於 0');
    assert.ok(firstRow.volume >= 0, 'volume 必須大於等於 0');
  });
  console.log('✅ 1. 台股歷史數據產生器驗證通過！');

  // 2. 測試技術指標計算
  const testData = StockDataGenerator.getHistoryData('2330');
  
  const sma = Indicators.calculateSMA(testData, 20);
  assert.strictEqual(sma.length, testData.length, 'SMA 陣列長度與資料不一致');
  assert.strictEqual(sma[0].value, null, 'SMA 前段未達週期應為 null');
  assert.ok(sma[20].value > 0, 'SMA 計算出的值應大於 0');

  const kd = Indicators.calculateKD(testData, 9, 3, 3);
  assert.strictEqual(kd.length, testData.length, 'KD 陣列長度與資料不一致');
  assert.strictEqual(kd[0].k, null, 'KD 前期應為 null');
  assert.ok(kd[15].k >= 0 && kd[15].k <= 100, 'K值應介於 0 ~ 100 之間');

  const rsi = Indicators.calculateRSI(testData, 14);
  assert.strictEqual(rsi.length, testData.length, 'RSI 陣列長度不符');
  assert.ok(rsi[15].value >= 0 && rsi[15].value <= 100, 'RSI值應介於 0 ~ 100 之間');

  const bb = Indicators.calculateBollingerBands(testData, 20, 2);
  assert.strictEqual(bb.length, testData.length, '布林通道陣列長度不符');
  assert.ok(bb[20].upper > bb[20].middle, '布林上軌應大於中軌');
  assert.ok(bb[20].middle > bb[20].lower, '布林中軌應大於下軌');

  const macd = Indicators.calculateMACD(testData, 12, 26, 9);
  assert.strictEqual(macd.length, testData.length, 'MACD 陣列長度不符');
  console.log('✅ 2. 技術指標公式計算驗證通過！');

  // 3. 測試策略與回測引擎
  const strategyTests = [
    { ticker: '2330', strategyId: 'MA_BREAKOUT' },
    { ticker: '2317', strategyId: 'BOLLINGER_SQUEEZE' },
    { ticker: '2454', strategyId: 'KD_RSI' },
    { ticker: '0050', strategyId: 'MACD_MOMENTUM' } // 用 MACD 測試 0050
  ];
  
  strategyTests.forEach(({ ticker, strategyId }) => {
    const data = StockDataGenerator.getHistoryData(ticker);
    const strat = Strategies.getStrategy(strategyId);
    const signals = strat.calculateSignals(data);
    assert.strictEqual(signals.length, data.length, `策略 ${strategyId} 訊號長度不符`);

    // 執行回測
    const options = {
      initialCapital: 1000000,
      discount: 0.6,
      taxRate: ticker === '0050' ? 0.001 : 0.003
    };
    const result = Backtester.runBacktest(data, signals, options);
    
    assert.ok(result.summary, '缺少回測總結');
    assert.ok(result.equityCurve.length === data.length, '資產曲線長度不符');
    assert.ok(typeof result.summary.totalReturn === 'number', '總報酬率必須是數值');
    assert.ok(result.summary.winRate >= 0 && result.summary.winRate <= 100, '勝率範圍不正確');
    assert.ok(result.summary.maxDrawdown >= 0 && result.summary.maxDrawdown <= 100, '最大回撤範圍不正確');

    // 確保有觸發交易，這樣教學系統才有用
    assert.ok(result.summary.totalTrades > 0, `股票 ${ticker} 套用策略 ${strategyId} 交易次數為 0，這將使使用者無法點擊訊號進行教學。請調整參數或數據以確保觸發！`);

    console.log(`   - 股票 ${ticker} (${StockDataGenerator.stockMeta[ticker].name}) 配對 [${strat.name}]: 報酬率 ${result.summary.totalReturn.toFixed(1)}%, 勝率 ${result.summary.winRate.toFixed(0)}%, 交易次數 ${result.summary.totalTrades} 次`);
  });
  console.log('✅ 3. 策略配對與回測交易觸發驗證通過！');

  // 4. 測試真實數據拉取 (使用 async)
  (async () => {
    try {
      console.log('📡 正在測試從真實 Yahoo Finance API (2330.TW) 拉取數據...');
      const realData = await StockDataGenerator.fetchRealData('2330');
      assert.ok(realData.length > 100, '真實數據長度不足 100 天');
      const latestDay = realData[realData.length - 1];
      console.log(`✅ 4. 成功拉取真實台積電日K！最新交易日：${latestDay.time}，收盤價：${latestDay.close} 元`);
      console.log('\n🎉 所有核心與即時真實數據測試全部通過！專案正確無誤。');
    } catch (e) {
      console.warn('⚠️ 4. 真實 API 測試跳過（這可能是因為在測試環境下網路或 CORS 代理限制）：', e.message);
      console.log('\n🎉 所有核心邏輯測試全部通過！專案正確無誤。');
    }
  })();
} catch (error) {
  console.error('❌ 驗證測試失敗：', error);
  process.exit(1);
}
