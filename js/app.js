/**
 * 台灣股市獲利策略分析與教學平台 - 主控程式 (App Orchestrator)
 * 整合數據來源、技術指標、交易策略、回測引擎與 UI 渲染。
 * 實現 CSV 解析匯入、自訂參數響應，以及互動式模擬交易艙。
 */

const App = (() => {
  // 全局狀態
  let currentTicker = '2330'; // 預設台積電
  let currentStrategyId = 'MA_BREAKOUT'; // 預設均線策略
  let kData = []; // 完整歷史 K 線數據
  let activeSignals = []; // 當前策略產生的訊號
  
  // 模擬交易狀態
  let isSimMode = false;
  let simCurrentIndex = 60; // 從第 60 天開始模擬，以確保有足夠的 K 線計算指標 (60MA)
  let simCash = 1000000;
  let simShares = 0;
  let simBuyPrice = 0;
  let simBuyCost = 0;
  let simUserTrades = [];
  let simTimer = null;
  let simPlaySpeedMs = 600; // 每 600 毫秒播放一天

  const getEl = (id) => document.getElementById(id);

  /**
   * 初始化入口
   */
  function init() {
    // 1. 初始化圖表與 tab
    UI.initMainChart();
    UI.initEquityChart();
    UI.initTabs();

    // 2. 註冊 K 線標記點擊教學之 callback
    window.onChartClicked = handleChartClick;

    // 3. 綁定按鈕與控制項事件
    bindEvents();

    // 4. 初始化股票搜尋自動完成選單
    initAutocomplete();

    // 5. 首次加載與分析
    loadStockAndRun(currentTicker);
  }

  /**
   * 加載股票數據並執行完整分析
   */
  async function loadStockAndRun(ticker, isRealTime = false) {
    currentTicker = ticker.trim().toUpperCase();
    stopSimulationTimer();

    if (isRealTime) {
      UI.showChartLoading(`正在從 Yahoo Finance 載入 ${ticker} 即時行情...`);
      try {
        const realData = await StockDataGenerator.fetchRealData(ticker);
        kData = realData;
        window.currentKData = kData;

        // 動態生成或更新臨時的股票 Meta
        StockDataGenerator.stockMeta[ticker] = {
          name: `台股 ${ticker}`,
          ticker: ticker,
          description: `自 Yahoo Finance 即時串接的真實台股數據。包含最近 2 年的所有交易日K線以及今日盤中最新成交價格。`,
          tags: ['真實數據', '即時行情'],
          defaultStrategy: currentStrategyId
        };
        
        UI.hideChartLoading();
      } catch (err) {
        UI.hideChartLoading();
        alert(`真實數據載入失敗：${err.message}\n已降級至台積電模擬數據。`);
        loadStockAndRun('2330', false);
        return;
      }
    } else {
      // 取得預設歷史數據
      kData = StockDataGenerator.getHistoryData(ticker);
      window.currentKData = kData;
    }
    
    // 切換股票時，若該股票有指定預設策略，則切換至該策略
    const meta = StockDataGenerator.stockMeta[ticker];
    if (meta && meta.defaultStrategy && !isRealTime) {
      currentStrategyId = meta.defaultStrategy;
    }

    // 渲染左側列表的 Active 樣式
    UI.renderStockList(StockDataGenerator.stockMeta, currentTicker, (t) => {
      const isReal = StockDataGenerator.stockMeta[t]?.tags?.includes('真實數據');
      loadStockAndRun(t, isReal);
    });
    UI.renderStrategyList(Strategies.strategies, currentStrategyId, selectStrategy);

    // 更新圖表標頭
    getEl('chart-title-ticker').innerText = ticker;
    getEl('chart-title-name').innerText = meta ? meta.name : '台股個股';

    // 當歷史數據天數不足 60 天時，顯示警告徽章
    const alertBadge = getEl('chart-alert-badge');
    if (alertBadge) {
      if (kData.length < 60) {
        alertBadge.classList.remove('hidden');
      } else {
        alertBadge.classList.add('hidden');
      }
    }

    if (isSimMode) {
      resetSimulation();
    } else {
      runAnalysis();
    }
  }

  /**
   * 切換交易策略
   */
  function selectStrategy(strategyId) {
    currentStrategyId = strategyId;
    UI.renderStrategyList(Strategies.strategies, currentStrategyId, selectStrategy);
    
    if (isSimMode) {
      resetSimulation();
    } else {
      runAnalysis();
    }
  }

  /**
   * 核心分析與回測工作流
   */
  function runAnalysis() {
    if (kData.length === 0) return;

    // 1. 計算該策略所需的指標並畫在圖表上
    UI.renderKData(kData);
    renderStrategyOverlays(kData, currentStrategyId);

    // 2. 計算買賣訊號
    const strategy = Strategies.getStrategy(currentStrategyId);
    activeSignals = strategy.calculateSignals(kData);

    // 3. 標註買賣點到 K線圖
    UI.renderSignals(activeSignals, kData);

    // 4. 執行回測
    const options = getBacktestOptions();
    const result = Backtester.runBacktest(kData, activeSignals, options);

    // 5. 更新回測統計與圖表
    UI.updatePerformanceDOM(result.summary);
    UI.renderEquityCurve(result.equityCurve);
    UI.renderTradeLog(result.trades);

    // 重設教學區
    UI.resetEduPanel();
  }

  /**
   * 根據策略在 K 線圖上添加輔助線段 overlays
   */
  function renderStrategyOverlays(data, strategyId) {
    if (strategyId === 'MA_BREAKOUT') {
      const ma5 = Indicators.calculateSMA(data, 5);
      const ma20 = Indicators.calculateSMA(data, 20);
      const ma60 = Indicators.calculateSMA(data, 60);
      UI.renderIndicatorLines({ ma5, ma20, ma60 }, 'MA_BREAKOUT');
    } 
    else if (strategyId === 'BOLLINGER_SQUEEZE') {
      const bb = Indicators.calculateBollingerBands(data, 20, 2);
      UI.renderIndicatorLines({
        upper: bb.map(x => ({ time: x.time, value: x.upper })),
        middle: bb.map(x => ({ time: x.time, value: x.middle })),
        lower: bb.map(x => ({ time: x.time, value: x.lower }))
      }, 'BOLLINGER_SQUEEZE');
    }
  }

  /**
   * 獲取目前 DOM 控制項設定的回測參數
   */
  function getBacktestOptions() {
    const capital = parseInt(getEl('param-capital').value);
    const discountVal = parseInt(getEl('param-discount').value);
    
    // 折扣換算 (如 6折 代表 0.6)
    const discount = discountVal / 10;
    
    // 元大台灣 50 是 ETF，證交稅率是 0.1%，個股是 0.3%
    const taxRate = currentTicker === '0050' ? 0.001 : 0.003;

    return {
      initialCapital: capital,
      discount,
      taxRate
    };
  }

  /**
   * 處理圖表點擊事件，動態加載教學
   */
  function handleChartClick(time) {
    if (kData.length === 0) return;

    // 找出點擊的那一天 index
    const index = kData.findIndex(d => d.time === time);
    if (index === -1) return;

    let signalType = null;
    if (isSimMode) {
      // 模擬模式下：檢查手動交易或當天策略訊號
      // 優先顯示該天的策略診斷
      const strategy = Strategies.getStrategy(currentStrategyId);
      const signals = strategy.calculateSignals(kData.slice(0, simCurrentIndex + 1));
      signalType = signals[index];
    } else {
      signalType = activeSignals[index];
    }

    if (signalType) {
      const strategy = Strategies.getStrategy(currentStrategyId);
      const htmlContent = strategy.getSignalReason(kData, index, signalType);
      UI.showEduSignal(htmlContent);
    }
  }

  /**
   * 顯示台股交易科普知識到教學室
   */
  window.showKnowledge = function(topic) {
    let html = '';
    if (topic === 'tax') {
      html = `
        <h4 class="text-blue-400 font-semibold mb-2 flex items-center gap-1">
          <i data-lucide="book-open" class="w-4 h-4"></i>
          台股獨特交易成本解析
        </h4>
        <p class="text-gray-300 text-sm leading-relaxed mb-3">
          在台灣股市中，每一次的買進與賣出都必須支付相應的成本，這會直接影響您的策略淨回報：
        </p>
        <div class="bg-gray-800/60 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-2 mb-3">
          <div>💵 <strong>券商手續費 (0.1425%)</strong>：買進與賣出時皆須支付。一般電子下單享有折讓折扣（如 6折、2.8折，甚至無低消限制）。本平台回測參數可自由調整折扣率。</div>
          <div>🏛️ <strong>證券交易稅 (0.3% 或 0.1%)</strong>：<strong>僅在「賣出時」由政府課徵</strong>。個股稅率為 0.3%，而 ETF (如 0050) 則享有優惠稅率 0.1%。</div>
        </div>
        <p class="text-amber-400/90 text-xs italic">💡 <strong>實戰技巧</strong>：由於交易稅較高 (0.3%)，短線頻繁交易（如當沖）容易被交易成本吞噬利潤（俗稱給券商和政府打工）。因此，利用中長線波段策略（如均線糾合突破），拉大單次獲利率，才能實現真正獲利。</p>
      `;
    } 
    else if (topic === 'margin') {
      html = `
        <h4 class="text-blue-400 font-semibold mb-2 flex items-center gap-1">
          <i data-lucide="users" class="w-4 h-4"></i>
          三大法人籌碼面指標
        </h4>
        <p class="text-gray-300 text-sm leading-relaxed mb-3">
          台股是典型受「籌碼面」主導的市場，其中「三大法人」的資金動向是股價推升的超級燃料：
        </p>
        <div class="bg-gray-800/60 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-2 mb-3">
          <div>🚢 <strong>外資 (Foreign Investors)</strong>：資金量最大，偏好台積電等大型權值股，操作週期偏長。</div>
          <div>⭐ <strong>投信 (Investment Trust)</strong>：國內基金公司，又稱「本土主力」。偏好中小型潛力成長股，季底常有「作帳行情」。若外資與投信同步買超，俗稱「土洋合作」，股價易有噴出行情。</div>
          <div>🏹 <strong>自營商 (Dealers)</strong>：券商自營部，以短線避險、賺取價差為主，操作靈活但週期極短。</div>
        </div>
        <p class="text-amber-400/90 text-xs italic">💡 <strong>策略錦囊</strong>：在進行「布林通道突破」或「均線突破」策略時，如果當天同時伴隨「外資與投信爆量買超」，突破的真機率會大幅提升，這也是台股老手常用的濾網指標。</p>
      `;
    } 
    else if (topic === 'limit') {
      html = `
        <h4 class="text-blue-400 font-semibold mb-2 flex items-center gap-1">
          <i data-lucide="shield-alert" class="w-4 h-4"></i>
          台股 10% 漲跌停限制
        </h4>
        <p class="text-gray-300 text-sm leading-relaxed mb-3">
          台灣股市為了穩定市場情緒，設有每日漲跌幅限制在前一日收盤價的 <strong>±10%</strong> 之間。
        </p>
        <div class="bg-gray-800/60 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-2 mb-3">
          <div>🔴 <strong>漲停鎖死</strong>：當買盤極度強勁，股價頂到 +10% 漲停板，賣盤枯竭。此時想買買不到，通常預示隔天高機率會跳空高開。</div>
          <div>🟢 <strong>跌停鎖死</strong>：當賣壓鋪天蓋地，股價打到 -10% 跌停板。此時想賣賣不掉（無流動性），這會對「停損策略」造成挑戰，可能產生超額滑價損失。</div>
        </div>
        <p class="text-amber-400/90 text-xs italic">💡 <strong>風控提示</strong>：在設定策略停損時（如布林通道中軌或 10% 停損點），必須注意流動性風險。一旦遭遇個股突發利空鎖死跌停，策略無法在當天成交出場，必須在隔天開盤跳空跌停盤中才能出場，因此嚴控部位大小極為重要。</p>
      `;
    }

    UI.showEduSignal(html);
    // 重建 Lucide 圖示
    lucide.createIcons();
  };

  /**
   * 綁定所有控制項的事件
   */
  function bindEvents() {
    // 1. 參數滑桿變更
    getEl('param-capital').oninput = function() {
      getEl('val-capital').innerText = parseInt(this.value).toLocaleString();
      if (!isSimMode) runAnalysis();
    };
    getEl('param-discount').oninput = function() {
      const discount = parseInt(this.value);
      getEl('val-discount').innerText = `${discount} 折 (${(0.001425 * (discount/10) * 100).toFixed(4)}%)`;
      if (!isSimMode) runAnalysis();
    };

    // 2. 配色模式切換
    getEl('btn-color-mode').onclick = () => {
      UI.updateColorMode(!UI.isTaiwanColorMode);
      if (isSimMode) {
        updateSimulationUI();
      } else {
        runAnalysis();
      }
    };

    // 3. 模擬交易開關
    getEl('btn-toggle-sim').onclick = () => {
      isSimMode = !isSimMode;
      const simBadge = getEl('sim-status-badge');
      const simPanel = getEl('sim-control-panel');
      const btnSpan = getEl('btn-toggle-sim').querySelector('span');
      const btnIcon = getEl('btn-toggle-sim').querySelector('i');

      if (isSimMode) {
        simBadge.classList.remove('hidden');
        simPanel.classList.remove('hidden');
        btnSpan.innerText = "關閉模擬盤 (回測分析)";
        getEl('btn-toggle-sim').classList.add('border-amber-500/50', 'text-amber-400');
        
        // 切換到模擬模式
        resetSimulation();
      } else {
        stopSimulationTimer();
        simBadge.classList.add('hidden');
        simPanel.classList.add('hidden');
        btnSpan.innerText = "開啟模擬盤 (手動訓練)";
        getEl('btn-toggle-sim').classList.remove('border-amber-500/50', 'text-amber-400');
        
        // 切換回常規回測分析
        runAnalysis();
      }
    };

    // 4. 模擬操作按鈕
    getEl('btn-sim-buy').onclick = handleSimBuy;
    getEl('btn-sim-sell').onclick = handleSimSell;
    getEl('btn-sim-play-pause').onclick = toggleSimPlayback;
    getEl('btn-sim-step').onclick = () => advanceSimulationDay(true);
    getEl('btn-sim-reset').onclick = resetSimulation;

    // 5. CSV 檔案匯入
    getEl('csv-file-input').onchange = handleCSVUpload;

    // 6. 即時數據查詢
    getEl('btn-fetch-realtime').onclick = () => {
      const tickerInput = getEl('realtime-ticker-input').value.trim();
      if (!tickerInput) {
        alert("請輸入台股代號（例如: 2603 或 2002）！");
        return;
      }
      loadStockAndRun(tickerInput, true);
    };

    getEl('realtime-ticker-input').onkeydown = (e) => {
      if (e.key === 'Enter') {
        getEl('btn-fetch-realtime').click();
      }
    };
  }

  // ==========================================
  // 熱門台股搜尋字典與自動完成邏輯
  // ==========================================
  
  const TAIWAN_STOCKS = [
    { ticker: '2330', name: '台積電' },
    { ticker: '2317', name: '鴻海' },
    { ticker: '2454', name: '聯發科' },
    { ticker: '0050', name: '元大台灣50' },
    { ticker: '0056', name: '元大高股息' },
    { ticker: '00878', name: '國泰永續高股息' },
    { ticker: '00919', name: '群益台灣精選高息' },
    { ticker: '00929', name: '復華台灣科技優息' },
    { ticker: '006208', name: '富邦台50' },
    { ticker: '00713', name: '元大台灣高息低波' },
    { ticker: '00940', name: '元大台灣價值高息' },
    { ticker: '00939', name: '統一台灣高息動能' },
    { ticker: '00403A', name: '統一台灣升級50 (主動式ETF)' },
    { ticker: '2303', name: '聯電' },
    { ticker: '2603', name: '長榮' },
    { ticker: '2609', name: '陽明' },
    { ticker: '2615', name: '萬海' },
    { ticker: '2002', name: '中鋼' },
    { ticker: '2308', name: '台達電' },
    { ticker: '2382', name: '廣達' },
    { ticker: '3231', name: '緯創' },
    { ticker: '2357', name: '華碩' },
    { ticker: '2324', name: '仁寶' },
    { ticker: '2353', name: '宏碁' },
    { ticker: '3711', name: '日月光投控' },
    { ticker: '3008', name: '大立光' },
    { ticker: '2301', name: '光寶科' },
    { ticker: '2356', name: '英業達' },
    { ticker: '2352', name: '佳世達' },
    { ticker: '3037', name: '欣興' },
    { ticker: '3035', name: '智原' },
    { ticker: '3443', name: '創意' },
    { ticker: '3661', name: '世芯-KY' },
    { ticker: '2379', name: '瑞昱' },
    { ticker: '3034', name: '聯詠' },
    { ticker: '2308', name: '台達電' },
    { ticker: '2308', name: '台達電' },
    { ticker: '1503', name: '士電' },
    { ticker: '1504', name: '東元' },
    { ticker: '1513', name: '中興電' },
    { ticker: '1514', name: '亞力' },
    { ticker: '1519', name: '華城' },
    { ticker: '2618', name: '長榮航' },
    { ticker: '2610', name: '華航' },
    { ticker: '2881', name: '富邦金' },
    { ticker: '2882', name: '國泰金' },
    { ticker: '2891', name: '中信金' },
    { ticker: '2886', name: '兆豐金' },
    { ticker: '2884', name: '玉山金' },
    { ticker: '2892', name: '第一金' },
    { ticker: '5880', name: '合庫金' },
    { ticker: '2890', name: '永豐金' },
    { ticker: '2880', name: '華南金' },
    { ticker: '2885', name: '元大金' },
    { ticker: '2883', name: '開發金' },
    { ticker: '2887', name: '台新金' },
    { ticker: '2888', name: '新光金' },
    { ticker: '2801', name: '彰銀' },
    { ticker: '5876', name: '上海商銀' },
    { ticker: '2812', name: '台中銀' },
    { ticker: '1101', name: '台泥' },
    { ticker: '1102', name: '亞泥' },
    { ticker: '1301', name: '台塑' },
    { ticker: '1303', name: '南亞' },
    { ticker: '1326', name: '台化' },
    { ticker: '6505', name: '台塑化' },
    { ticker: '2006', name: '東鋼' },
    { ticker: '2014', name: '中鴻' },
    { ticker: '2105', name: '正新' },
    { ticker: '9904', name: '寶成' },
    { ticker: '9921', name: '巨大' },
    { ticker: '2912', name: '統一超' },
    { ticker: '1216', name: '統一' },
    { ticker: '2412', name: '中華電' },
    { ticker: '3045', name: '台灣大' },
    { ticker: '4904', name: '遠傳' }
  ];

  function initAutocomplete() {
    const input = getEl('realtime-ticker-input');
    const list = getEl('realtime-autocomplete-list');

    input.addEventListener('input', function() {
      const val = this.value.trim().toLowerCase();
      list.innerHTML = '';

      if (!val) {
        list.classList.add('hidden');
        return;
      }

      // 模糊比對股票代碼與中文名稱
      const matches = TAIWAN_STOCKS.filter(stock => 
        stock.ticker.includes(val) || 
        stock.name.toLowerCase().includes(val)
      );

      // 新增：如果輸入符合台股/ETF代碼格式 (4 到 6 碼英文字母或數字組合，如 00403A, 2330)，提供快捷項目
      const isValidTicker = /^[0-9a-zA-Z]{4,6}$/.test(val);
      if (isValidTicker) {
        const customItem = document.createElement('div');
        customItem.className = 'px-3 py-2.5 bg-blue-600/10 hover:bg-blue-600/35 hover:text-white cursor-pointer transition text-blue-400 font-semibold flex justify-between items-center border-b border-white/10';
        customItem.innerHTML = `
          <span>🔍 載入自訂台股 [${val}]</span>
          <span class="text-[9px] bg-blue-500/25 px-1.5 py-0.5 rounded text-white font-normal">直接載入</span>
        `;
        customItem.addEventListener('click', function() {
          input.value = val;
          list.classList.add('hidden');
          getEl('btn-fetch-realtime').click();
        });
        list.appendChild(customItem);
      }

      matches.forEach(stock => {
        const item = document.createElement('div');
        item.className = 'px-3 py-2.5 hover:bg-blue-600/20 hover:text-white cursor-pointer transition text-gray-300 font-medium flex justify-between items-center';
        
        item.innerHTML = `
          <span class="font-mono text-white font-bold">${stock.ticker}</span>
          <span class="opacity-80">${stock.name}</span>
        `;

        item.addEventListener('click', function() {
          input.value = stock.ticker;
          list.classList.add('hidden');
          getEl('btn-fetch-realtime').click(); // 點擊直接觸發行情查詢
        });

        list.appendChild(item);
      });

      if (list.childNodes.length === 0) {
        list.classList.add('hidden');
      } else {
        list.classList.remove('hidden');
      }
    });

    // 點擊外部隱藏下拉選單
    document.addEventListener('click', function(e) {
      if (e.target !== input && e.target !== list) {
        list.classList.add('hidden');
      }
    });

    list.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }

  // ==========================================
  // 模擬交易 (Simulator) 模組實作
  // ==========================================

  function resetSimulation() {
    stopSimulationTimer();
    
    const options = getBacktestOptions();
    simCash = options.initialCapital;
    simShares = 0;
    simBuyPrice = 0;
    simBuyCost = 0;
    simUserTrades = [];
    
    // 設定初始日期 index (前 60 天用來計算 60MA 指標)
    simCurrentIndex = 60;
    if (kData.length <= simCurrentIndex) {
      simCurrentIndex = Math.floor(kData.length / 2);
    }

    getEl('btn-sim-play-pause').querySelector('span').innerText = "播放";
    getEl('btn-sim-play-pause').querySelector('i').setAttribute('data-lucide', 'play');
    lucide.createIcons();

    updateSimulationUI();
  }

  function toggleSimPlayback() {
    const icon = this.querySelector('i');
    const span = this.querySelector('span');

    if (simTimer) {
      stopSimulationTimer();
      span.innerText = "播放";
      icon.setAttribute('data-lucide', 'play');
    } else {
      span.innerText = "暫停";
      icon.setAttribute('data-lucide', 'pause');
      simTimer = setInterval(() => {
        advanceSimulationDay();
      }, simPlaySpeedMs);
    }
    lucide.createIcons();
  }

  function stopSimulationTimer() {
    if (simTimer) {
      clearInterval(simTimer);
      simTimer = null;
    }
  }

  /**
   * 前進一天
   */
  function advanceSimulationDay(isManual = false) {
    if (simCurrentIndex >= kData.length - 1) {
      stopSimulationTimer();
      getEl('btn-sim-play-pause').querySelector('span').innerText = "播放";
      getEl('btn-sim-play-pause').querySelector('i').setAttribute('data-lucide', 'play');
      lucide.createIcons();
      alert("模擬回放已結束！請查看最終操作戰績。");
      return;
    }

    simCurrentIndex++;
    updateSimulationUI(isManual);
  }

  /**
   * 更新模擬模式下的 UI 與圖表
   */
  function updateSimulationUI(isManual = false) {
    if (kData.length === 0) return;

    const visibleK = kData.slice(0, simCurrentIndex + 1);
    const today = kData[simCurrentIndex];

    // 1. 繪製到今天為止的 K 線與技術指標線
    UI.renderKData(visibleK);
    renderStrategyOverlays(visibleK, currentStrategyId);

    // 2. 自動策略買賣標記同步顯示到當前天
    const strategy = Strategies.getStrategy(currentStrategyId);
    const autoSignals = strategy.calculateSignals(visibleK);
    UI.renderSignals(autoSignals, visibleK);

    // 3. 更新模擬艙文字
    getEl('sim-current-date').innerText = today.time;
    getEl('sim-current-price').innerText = `${today.close.toFixed(1)} 元`;
    getEl('sim-cash').innerText = Math.round(simCash).toLocaleString();
    getEl('sim-hold-shares').innerText = simShares.toLocaleString();

    // 4. 計算並更新績效
    const currentShareVal = simShares * today.close;
    const totalAsset = simCash + currentShareVal;
    const initialCapital = getBacktestOptions().initialCapital;
    const userProfit = totalAsset - initialCapital;
    const userReturn = (userProfit / initialCapital) * 100;

    const profitEl = getEl('sim-perf-profit');
    const returnEl = getEl('sim-perf-return');

    profitEl.innerText = `${userProfit >= 0 ? '+' : ''}${Math.round(userProfit).toLocaleString()} 元`;
    returnEl.innerText = `${userReturn >= 0 ? '+' : ''}${userReturn.toFixed(1)}%`;
    
    if (userProfit >= 0) {
      profitEl.className = "font-bold text-red-500";
      returnEl.className = "font-bold text-red-500";
    } else {
      profitEl.className = "font-bold text-emerald-500";
      returnEl.className = "font-bold text-emerald-500";
    }

    // 5. 計算自動策略同期的累積報酬率
    const autoResult = Backtester.runBacktest(visibleK, autoSignals, getBacktestOptions());
    const autoRet = autoResult.summary.totalReturn;
    const autoRetEl = getEl('sim-auto-perf');
    autoRetEl.innerText = `${autoRet >= 0 ? '+' : ''}${autoRet.toFixed(1)}%`;
    if (autoRet >= 0) {
      autoRetEl.className = "font-bold text-red-500";
    } else {
      autoRetEl.className = "font-bold text-emerald-500";
    }

    // 6. 更新回測面板為同期績效
    UI.updatePerformanceDOM(autoResult.summary);
    UI.renderEquityCurve(autoResult.equityCurve);
    UI.renderTradeLog(autoResult.trades);

    // 如果是手動下一步，可將圖表置中
    if (isManual && UI.mainChart()) {
      UI.mainChart().timeScale().fitContent();
    }
  }

  /**
   * 手動買入一張
   */
  function handleSimBuy() {
    if (!isSimMode) return;
    const today = kData[simCurrentIndex];
    const options = getBacktestOptions();
    
    // 台股買入成本：價金 + 手續費(打折)
    const sharePrice = today.close;
    const principal = 1000 * sharePrice;
    
    // 計算手續費 (0.1425% 折扣)
    let fee = Math.round(principal * 0.001425 * options.discount);
    if (fee < 20) fee = 20;

    const totalCost = principal + fee;

    if (simCash < totalCost) {
      alert("餘額不足，無法買入一張 (1,000股)！");
      return;
    }

    simCash -= totalCost;
    // 計算成本均價
    const totalShares = simShares + 1000;
    const totalCostBasis = (simShares * simBuyPrice + simBuyCost) + principal + fee;
    
    simShares = totalShares;
    simBuyPrice = totalCostBasis / totalShares;
    simBuyCost = fee;

    updateSimulationUI();
    
    // 渲染手動買入教學與反饋
    const htmlContent = `
      <h4 class="text-red-400 font-semibold mb-2 flex items-center gap-1">
        <i data-lucide="shopping-cart" class="w-4 h-4"></i>
        手動下單：買入成功 (1 張)
      </h4>
      <p class="text-gray-300 text-sm leading-relaxed mb-3">
        您在 <strong>${today.time}</strong> 以收盤價 <strong>${today.close.toFixed(1)} 元</strong> 買入 1,000 股。
      </p>
      <div class="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-1 mb-3">
        <div>💰 <strong>交易價金</strong>：${principal.toLocaleString()} 元</div>
        <div>💸 <strong>券商手續費</strong>：${fee} 元</div>
        <div>📐 <strong>剩餘現金</strong>：${Math.round(simCash).toLocaleString()} 元</div>
      </div>
      <p class="text-amber-400/90 text-xs italic">💡 <strong>交易反思</strong>：在您下單的這一刻，您可以比對下方策略是否也同步給予買入訊號？若是，代表您與自動化交易策略的共識度極高！</p>
    `;
    UI.showEduSignal(htmlContent);
    lucide.createIcons();
  }

  /**
   * 手動賣出全部
   */
  function handleSimSell() {
    if (!isSimMode) return;
    if (simShares === 0) {
      alert("您目前未持有任何部位！");
      return;
    }

    const today = kData[simCurrentIndex];
    const options = getBacktestOptions();

    const principal = simShares * today.close;
    
    // 手續費
    let fee = Math.round(principal * 0.001425 * options.discount);
    if (fee < 20) fee = 20;

    // 證交稅 (0.3% 或 0.1%)
    const tax = Math.round(principal * options.taxRate);

    const netProceeds = principal - fee - tax;
    const profit = netProceeds - (simShares * simBuyPrice + simBuyCost);
    const returnPct = (profit / (simShares * simBuyPrice + simBuyCost)) * 100;

    simCash += netProceeds;

    updateSimulationUI();

    // 渲染手動賣出教學與反饋
    const htmlContent = `
      <h4 class="text-emerald-400 font-semibold mb-2 flex items-center gap-1">
        <i data-lucide="check-circle" class="w-4 h-4"></i>
        手動下單：賣出平倉成功
      </h4>
      <p class="text-gray-300 text-sm leading-relaxed mb-3">
        您在 <strong>${today.time}</strong> 以收盤價 <strong>${today.close.toFixed(1)} 元</strong> 賣出全部持股 (${simShares.toLocaleString()} 股)。
      </p>
      <div class="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-1 mb-3">
        <div>💵 <strong>賣出價金</strong>：${principal.toLocaleString()} 元</div>
        <div>💸 <strong>券商手續費</strong>：${fee} 元</div>
        <div>🏛️ <strong>政府證交稅</strong>：${tax} 元</div>
        <div class="border-t border-gray-700/50 pt-1 mt-1 text-white">
          📈 <strong>交易損益</strong>：<span class="${profit >= 0 ? 'text-red-400' : 'text-emerald-400'} font-bold">${profit >= 0 ? '+' : ''}${Math.round(profit).toLocaleString()} 元 (${profit >= 0 ? '+' : ''}${returnPct.toFixed(1)}%)</span>
        </div>
      </div>
      <p class="text-amber-400/90 text-xs italic">💡 <strong>交易反思</strong>：在您出場的這一刻，您可以檢視：自動化策略是早已賣出避開跌勢，還是還在抱股？這是一場人腦與程式碼的對決，多加練習可以讓您在面臨市場波動時保持理智的紀律！</p>
    `;
    
    simShares = 0;
    simBuyPrice = 0;
    simBuyCost = 0;
    
    UI.showEduSignal(htmlContent);
    lucide.createIcons();
  }

  // ==========================================
  // CSV 匯入與解析模組
  // ==========================================

  function handleCSVUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
      const text = evt.target.result;
      const parsedData = parseCSV(text);
      if (parsedData.length < 30) {
        alert("CSV 資料筆數過少 (至少需要 30 天以上的資料) 或格式不正確。請上傳包含 Date, Open, High, Low, Close, Volume 的標準日K線 CSV。");
        return;
      }

      // 將解析出的資料載入並覆蓋 kData
      kData = parsedData;
      window.currentKData = kData;

      // 建立臨時個股 Metadata
      const tempStockMeta = {
        '9999': {
          name: '自訂上傳股',
          ticker: '9999',
          description: '使用者匯入的 CSV K線資料。您可以在左側選擇策略對此自訂股票進行回測與分析。',
          tags: ['自訂', '外部數據'],
          defaultStrategy: currentStrategyId
        }
      };

      // 融合原有的股票清單
      const fullMeta = { ...StockDataGenerator.stockMeta, ...tempStockMeta };
      currentTicker = '9999';

      UI.renderStockList(fullMeta, currentTicker, loadStockAndRun);
      
      if (isSimMode) {
        resetSimulation();
      } else {
        runAnalysis();
      }

      alert(`成功載入自訂股票數據，共計 ${kData.length} 筆交易日！`);
    };
    reader.readAsText(file);
  }

  /**
   * 解析 CSV 字串
   * 支援常見的 Yahoo Finance CSV 格式：
   * Date,Open,High,Low,Close,Adj Close,Volume
   */
  function parseCSV(text) {
    const lines = text.split('\n');
    if (lines.length < 2) return [];

    // 取得 Header
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    
    const dateIdx = headers.indexOf('date');
    const openIdx = headers.indexOf('open');
    const highIdx = headers.indexOf('high');
    const lowIdx = headers.indexOf('low');
    const closeIdx = headers.indexOf('close');
    const volIdx = headers.indexOf('volume');

    if (dateIdx === -1 || openIdx === -1 || closeIdx === -1) {
      return [];
    }

    const result = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(',');
      if (cols.length < headers.length) continue;

      const dateStr = cols[dateIdx].trim();
      const open = parseFloat(cols[openIdx]);
      const high = highIdx !== -1 ? parseFloat(cols[highIdx]) : open;
      const low = lowIdx !== -1 ? parseFloat(cols[lowIdx]) : open;
      const close = parseFloat(cols[closeIdx]);
      const volume = volIdx !== -1 ? parseInt(cols[volIdx]) : 1000;

      // 驗證數值
      if (isNaN(open) || isNaN(close) || isNaN(volume)) continue;
      
      // 確保日期格式
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        // 如果是 YYYY/MM/DD 轉換為 YYYY-MM-DD
        const formattedDate = dateStr.replace(/\//g, '-');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(formattedDate)) continue;
        result.push({ time: formattedDate, open, high, low, close, volume });
      } else {
        result.push({ time: dateStr, open, high, low, close, volume });
      }
    }

    // 按照時間從小到大排序
    return result.sort((a, b) => new Date(a.time) - new Date(b.time));
  }

  return {
    init,
    runAnalysis,
    loadStockAndRun
  };
})();

// 當 DOM 加載完成後初始化
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  lucide.createIcons();
});
