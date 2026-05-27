/**
 * UI 圖表渲染與事件管理模組
 * 負責 TradingView Lightweight Charts 的初始化、數據加載、買賣訊號標記、
 * 自適應調整大小、Tab 切換，以及股票/策略列表的動態 HTML 生成。
 */

const UI = (() => {
  let mainChart = null;
  let equityChart = null;
  let candlestickSeries = null;
  let equitySeries = null;
  
  // 保存所有指標的線段 instance，便於切換時清除
  let activeIndicatorLines = [];

  // 當前配色設定 (預設台股：紅漲綠跌)
  let isTaiwanColorMode = true; 
  let upColor = '#ef4444';
  let downColor = '#10b981';

  // 取得 DOM 元素
  const getEl = (id) => document.getElementById(id);

  /**
   * 初始化圖表配色
   */
  function updateColorMode(isTW) {
    isTaiwanColorMode = isTW;
    if (isTaiwanColorMode) {
      upColor = '#ef4444'; // 紅漲
      downColor = '#10b981'; // 綠跌
      getEl('btn-color-mode').classList.remove('us-color-mode');
      getEl('color-mode-text').innerText = "台股配色 (紅漲綠跌)";
    } else {
      upColor = '#10b981'; // 綠漲
      downColor = '#ef4444'; // 紅跌
      getEl('btn-color-mode').classList.add('us-color-mode');
      getEl('color-mode-text').innerText = "美股配色 (綠漲紅跌)";
    }
  }

  /**
   * 建立 TradingView K 線主圖表
   */
  function initMainChart() {
    const container = getEl('chart-container');
    container.innerHTML = ''; // 清空先前內容
    getEl('chart-loading').style.display = 'none';

    mainChart = LightweightCharts.createChart(container, {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#9ca3af',
        fontSize: 11,
        fontFamily: 'Outfit, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: 'rgba(59, 130, 246, 0.25)', labelBackgroundColor: '#1e293b' },
        horzLine: { color: 'rgba(59, 130, 246, 0.25)', labelBackgroundColor: '#1e293b' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.07)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.07)',
        rightOffset: 10,
        barSpacing: 6,
      },
    });

    candlestickSeries = mainChart.addCandlestickSeries({
      upColor: upColor,
      downColor: downColor,
      borderUpColor: upColor,
      borderDownColor: downColor,
      wickUpColor: upColor,
      wickDownColor: downColor,
    });

    // 監聽圖表點擊事件以供教學診斷使用
    mainChart.subscribeClick((param) => {
      if (!param || !param.time) return;
      if (typeof window.onChartClicked === 'function') {
        window.onChartClicked(param.time);
      }
    });

    // 監聽尺寸自適應
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !mainChart) return;
      const { width, height } = entries[0].contentRect;
      mainChart.resize(width, height);
    });
    resizeObserver.observe(getEl('main-chart-parent'));
  }

  /**
   * 建立資產淨值折線圖
   */
  function initEquityChart() {
    const container = getEl('equity-chart-container');
    container.innerHTML = '';

    equityChart = LightweightCharts.createChart(container, {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#6b7280',
        fontSize: 10,
        fontFamily: 'Outfit, sans-serif',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: 'rgba(255, 255, 255, 0.02)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(59, 130, 246, 0.15)' },
        horzLine: { color: 'rgba(59, 130, 246, 0.15)' },
      },
      rightPriceScale: {
        borderColor: 'transparent',
      },
      timeScale: {
        borderColor: 'transparent',
      },
    });

    // 漸層折線
    equitySeries = equityChart.addAreaSeries({
      topColor: 'rgba(59, 130, 246, 0.4)',
      bottomColor: 'rgba(59, 130, 246, 0.0)',
      lineColor: '#3b82f6',
      lineWidth: 2,
    });

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !equityChart) return;
      const { width, height } = entries[0].contentRect;
      equityChart.resize(width, height);
    });
    resizeObserver.observe(container);
  }

  /**
   * 將 K線數據繪製到圖表上，並移除舊的輔助指標線段
   */
  function renderKData(kData) {
    if (!candlestickSeries) return;
    
    // 更新 K線樣式（可能因為配色切換）
    candlestickSeries.applyOptions({
      upColor: upColor,
      downColor: downColor,
      borderUpColor: upColor,
      borderDownColor: downColor,
      wickUpColor: upColor,
      wickDownColor: downColor,
    });

    candlestickSeries.setData(kData);

    // 清除現存的輔助指標線條
    activeIndicatorLines.forEach(line => mainChart.removeSeries(line));
    activeIndicatorLines = [];
  }

  /**
   * 在 K 線圖上繪製輔助線（如 MA 均線或布林通道軌道），便於教學對照
   */
  function renderIndicatorLines(indicatorData, type) {
    if (!mainChart) return;

    if (type === 'MA_BREAKOUT') {
      // 繪製 5MA, 20MA, 60MA
      const ma5Line = mainChart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: '5MA' });
      const ma20Line = mainChart.addLineSeries({ color: '#ec4899', lineWidth: 1.5, title: '20MA' });
      const ma60Line = mainChart.addLineSeries({ color: '#3b82f6', lineWidth: 1, title: '60MA' });

      ma5Line.setData(indicatorData.ma5);
      ma20Line.setData(indicatorData.ma20);
      ma60Line.setData(indicatorData.ma60);

      activeIndicatorLines.push(ma5Line, ma20Line, ma60Line);
    } 
    else if (type === 'BOLLINGER_SQUEEZE') {
      // 繪製布林上中下軌
      const upperLine = mainChart.addLineSeries({ color: 'rgba(139, 92, 246, 0.6)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, title: '布林上軌' });
      const middleLine = mainChart.addLineSeries({ color: 'rgba(236, 72, 153, 0.4)', lineWidth: 1, title: '中軌' });
      const lowerLine = mainChart.addLineSeries({ color: 'rgba(139, 92, 246, 0.6)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, title: '布林下軌' });

      upperLine.setData(indicatorData.upper);
      middleLine.setData(indicatorData.middle);
      lowerLine.setData(indicatorData.lower);

      activeIndicatorLines.push(upperLine, middleLine, lowerLine);
    }
  }

  /**
   * 標註進出場訊號在 K線圖上
   */
  function renderSignals(signals, kData) {
    if (!candlestickSeries) return;

    const markers = [];
    for (let i = 0; i < signals.length; i++) {
      const sig = signals[i];
      if (!sig) continue;

      if (sig === 'buy') {
        markers.push({
          time: kData[i].time,
          position: 'belowBar',
          color: upColor,
          shape: 'arrowUp',
          text: 'B 進場',
          size: 1.2
        });
      } else if (sig === 'sell') {
        markers.push({
          time: kData[i].time,
          position: 'aboveBar',
          color: downColor,
          shape: 'arrowDown',
          text: 'S 出場',
          size: 1.2
        });
      }
    }

    candlestickSeries.setMarkers(markers);
  }

  /**
   * 繪製資產淨值曲線
   */
  function renderEquityCurve(curveData) {
    if (!equitySeries) return;
    equitySeries.setData(curveData);
    equityChart.timeScale().fitContent();
  }

  /**
   * 更新回測績效數字與大卡片
   */
  function updatePerformanceDOM(summary) {
    const totalRetEl = getEl('perf-total-return');
    const bhRetEl = getEl('perf-bh-comparison');
    
    // 總報酬率
    totalRetEl.innerText = `${summary.totalReturn >= 0 ? '+' : ''}${summary.totalReturn.toFixed(1)}%`;
    if (summary.totalReturn >= 0) {
      totalRetEl.className = "text-2xl font-bold tracking-tight glow-text-up";
    } else {
      totalRetEl.className = "text-2xl font-bold tracking-tight glow-text-down";
    }

    // 買入持有對照
    bhRetEl.innerText = `買入持有: ${summary.buyAndHoldReturn >= 0 ? '+' : ''}${summary.buyAndHoldReturn.toFixed(1)}%`;

    // 勝率與交易次數
    getEl('perf-win-rate').innerText = `${summary.winRate.toFixed(0)}%`;
    getEl('perf-trade-count').innerText = `總交易: ${summary.totalTrades} 次 (贏:${summary.winTradesCount} / 輸:${summary.lossTradesCount})`;

    // 最大回撤與獲利因子
    const mddEl = getEl('perf-mdd');
    mddEl.innerText = `${summary.maxDrawdown.toFixed(1)}%`;
    // MDD 通常越小越好，如果是 0% 或小於 10% 為極佳
    if (summary.maxDrawdown < 15) {
      mddEl.className = "text-2xl font-bold tracking-tight text-emerald-400";
    } else if (summary.maxDrawdown < 25) {
      mddEl.className = "text-2xl font-bold tracking-tight text-amber-500";
    } else {
      mddEl.className = "text-2xl font-bold tracking-tight text-red-500";
    }

    getEl('perf-profit-factor').innerText = `獲利因子: ${summary.profitFactor}`;
  }

  /**
   * 填充交易明細表格
   */
  function renderTradeLog(trades) {
    const container = getEl('trade-log-rows');
    container.innerHTML = '';

    if (trades.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="7" class="py-6 text-center text-gray-500">此測試期間策略未觸發任何完整交易。</td>
        </tr>
      `;
      return;
    }

    trades.forEach((t, idx) => {
      const profitClass = t.netProfit >= 0 ? 'text-red-400 font-medium' : 'text-emerald-400 font-medium';
      const indicator = t.netProfit >= 0 ? '+' : '';
      const sharesLabel = `${(t.shares / 1000).toFixed(0)} 張`;
      
      const row = document.createElement('tr');
      row.className = "hover:bg-white/5 transition-colors duration-150 cursor-pointer";
      // 點擊交易紀錄定位到圖表買入時間點
      row.onclick = () => {
        if (mainChart) {
          mainChart.timeScale().scrollToPosition(0, false);
          // 滾動到買入時間點
          const index = window.currentKData.findIndex(d => d.time === t.buyTime);
          if (index !== -1) {
            mainChart.timeScale().setVisibleRange({
              from: window.currentKData[Math.max(0, index - 20)].time,
              to: window.currentKData[Math.min(window.currentKData.length - 1, index + 30)].time
            });
            // 觸發教學
            window.onChartClicked(t.buyTime);
          }
        }
      };

      row.innerHTML = `
        <td class="py-2 px-3 text-gray-300 font-mono">${t.buyTime}</td>
        <td class="py-2 px-3 text-gray-400 font-mono">${t.buyPrice.toFixed(1)}</td>
        <td class="py-2 px-3 text-gray-300 font-mono">${t.sellTime || '未平倉'}</td>
        <td class="py-2 px-3 text-gray-400 font-mono">${t.sellPrice.toFixed(1)}</td>
        <td class="py-2 px-3 text-right text-gray-400 font-mono">${sharesLabel}</td>
        <td class="py-2 px-3 text-right font-mono ${profitClass}">${indicator}${Math.round(t.netProfit).toLocaleString()}</td>
        <td class="py-2 px-3 text-right font-mono ${profitClass}">${indicator}${t.returnPct.toFixed(1)}%</td>
      `;
      container.appendChild(row);
    });
  }

  /**
   * 渲染股票按鈕列表
   */
  function renderStockList(metaList, activeTicker, onSelect) {
    const container = getEl('stock-list');
    container.innerHTML = '';

    Object.values(metaList).forEach(stock => {
      const activeClass = stock.ticker === activeTicker 
        ? 'border-blue-500 bg-blue-950/20 text-white shadow-lg shadow-blue-500/10' 
        : 'border-white/5 bg-gray-900/25 hover:border-gray-700 hover:text-white text-gray-400';
      
      const btn = document.createElement('button');
      btn.className = `p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${activeClass}`;
      btn.onclick = () => onSelect(stock.ticker);
      btn.innerHTML = `
        <span class="text-[10px] opacity-60 font-mono font-bold">${stock.ticker}</span>
        <span class="text-sm font-bold">${stock.name}</span>
      `;
      container.appendChild(btn);
    });

    // 更新資訊卡片
    const currentMeta = metaList[activeTicker];
    if (currentMeta) {
      getEl('stock-info-name').innerText = `${currentMeta.name} (${currentMeta.ticker})`;
      getEl('stock-info-desc').innerText = currentMeta.description;
    }
  }

  /**
   * 渲染策略按鈕列表
   */
  function renderStrategyList(strategies, activeId, onSelect) {
    const container = getEl('strategy-list');
    container.innerHTML = '';

    Object.entries(strategies).forEach(([id, strat]) => {
      const isActive = id === activeId;
      const activeClass = isActive 
        ? 'border-amber-500/50 bg-amber-950/15 text-white' 
        : 'border-white/5 bg-gray-900/25 hover:border-gray-700 hover:text-white text-gray-400';
      
      const badgeColor = isActive ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-gray-800 text-gray-500 border-transparent';

      const card = document.createElement('div');
      card.className = `p-4 rounded-xl border flex flex-col gap-2 transition-all cursor-pointer ${activeClass}`;
      card.onclick = () => onSelect(id);
      
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-sm font-bold">${strat.name}</span>
          <span class="text-[9px] px-2 py-0.5 rounded border ${badgeColor}">策略</span>
        </div>
        <p class="text-[11px] leading-relaxed text-gray-400 line-clamp-2">${strat.description}</p>
      `;
      
      container.appendChild(card);
    });
  }

  /**
   * 更新教學診斷面板內容
   */
  function showEduSignal(htmlContent) {
    getEl('edu-default-state').classList.add('hidden');
    const contentEl = getEl('edu-dynamic-content');
    contentEl.classList.remove('hidden');
    contentEl.innerHTML = htmlContent;
  }

  /**
   * 重設教學診斷面板為預設狀態
   */
  function resetEduPanel() {
    getEl('edu-default-state').classList.remove('hidden');
    getEl('edu-dynamic-content').classList.add('hidden');
  }

  /**
   * Tab 切換邏輯
   */
  function initTabs() {
    const tabEquity = getEl('tab-btn-equity');
    const tabTrades = getEl('tab-btn-trades');
    const contentEquity = getEl('tab-content-equity');
    const contentTrades = getEl('tab-content-trades');

    tabEquity.onclick = () => {
      tabEquity.className = "pb-2 px-4 tab-active transition";
      tabTrades.className = "pb-2 px-4 text-gray-400 hover:text-gray-200 transition";
      contentEquity.classList.remove('hidden');
      contentTrades.classList.add('hidden');
      // 重新整理圖表尺寸
      if (equityChart) {
        equityChart.resize(contentEquity.clientWidth, contentEquity.clientHeight);
      }
    };

    tabTrades.onclick = () => {
      tabTrades.className = "pb-2 px-4 tab-active transition";
      tabEquity.className = "pb-2 px-4 text-gray-400 hover:text-gray-200 transition";
      contentTrades.classList.remove('hidden');
      contentEquity.classList.add('hidden');
    };
  }

  /**
   * 顯示圖表加載遮罩與文字
   */
  function showChartLoading(text) {
    const loadingEl = getEl('chart-loading');
    if (loadingEl) {
      loadingEl.querySelector('span').innerText = text;
      loadingEl.style.display = 'flex';
    }
  }

  /**
   * 隱藏圖表加載遮罩
   */
  function hideChartLoading() {
    const loadingEl = getEl('chart-loading');
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
  }

  return {
    initMainChart,
    initEquityChart,
    renderKData,
    renderIndicatorLines,
    renderSignals,
    renderEquityCurve,
    updatePerformanceDOM,
    renderTradeLog,
    renderStockList,
    renderStrategyList,
    showEduSignal,
    resetEduPanel,
    initTabs,
    updateColorMode,
    showChartLoading,
    hideChartLoading,
    upColor: () => upColor,
    downColor: () => downColor,
    mainChart: () => mainChart
  };
})();

// 綁定到 window 供 app.js 呼叫
window.UI = UI;
