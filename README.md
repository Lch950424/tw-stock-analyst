# 台灣股市獲利策略分析與教學平台 (Taiwan Stock Strategy Hub)

這是一個專門為台股投資新手與交易愛好者設計的**互動式股市分析、回測與模擬交易平台**。
透過本平台，您可以直觀地了解不同技術指標與交易策略在台股歷史上的表現，並透過「點擊即學」的互動式診斷，明白為什麼此處是適合的「進場點」與「出場點」。

💡 **Demo 展示**：本專案採用純前端無編譯架構，上傳至 GitHub 後可一鍵啟用 **GitHub Pages** 靜態網頁服務！

---

## 🌟 核心功能亮點

1. **專業級 TradingView K 線圖表**
   - 採用 TradingView `Lightweight Charts` 庫，提供行雲流水般的縮放與拖曳看盤體驗。
   - 策略的進場（Buy）與出場（Sell）訊號會以直觀的綠/紅三角形標記在圖表上。

2. **四大經典獲利策略**
   - **均線糾合突破策略**：捕捉整理結束、多頭排列初現的飆股起漲點。
   - **KD 低檔交叉 + RSI 策略**：針對震盪股，在超跌安全區尋找反彈買點。
   - **布林通道突破策略**：在通道極度收窄（能量壓縮）後，捕捉帶量破網的爆發性行情。
   - **MACD 動能翻紅策略**：利用指標之王追蹤中期動能，於買氣重新轉強時進場。

3. **台股專屬回測引擎**
   - 支援台灣股市獨有的交易成本計算：
     - **券商手續費**（預設 0.1425%，並可自訂折扣折讓）。
     - **證券交易稅**（個股賣出 0.3%，ETF 賣出 0.1%）。
     - **以「張（1,000股）」為最小交易單位**，保留零錢現金，極度還原真實交易。
   - 即時統計：累積報酬率、勝率、總交易次數、最大回撤 (MDD)、獲利因子，並繪製**資產淨值曲線 (Equity Curve)**。

4. **互動式訊號診斷室 (Signal Tutor)**
   - 點擊 K 線圖上的任何一個買賣標記，右側會立刻生成該次交易的「診斷報告」，用易懂的中文解析當天指標狀態、背後的市場心理學，以及具體的操作防守建議。

5. **模擬交易訓練艙 (Simulator)**
   - 點擊「開啟模擬盤」，K 線圖將隱藏未來走勢（歷史回放模式）。
   - 您可以手動「買入一張」或「賣出全部」，挑戰您的人腦盤感，並與 AI 自動化策略進行績效 PK！

6. **自訂 CSV 數據上傳**
   - 支援匯入您自己在 Yahoo Finance 或是證交所下載的標準 CSV K線檔案（須包含 Date, Open, High, Low, Close, Volume），即可立即套用平台上的所有策略進行分析與回測。

---

## 🚀 如何部署至 GitHub Pages

由於本專案完全由 HTML, CSS, JavaScript 組成，不需進行任何 `npm run build` 打包。您可以直接將其推播 (Push) 到 GitHub 並啟用免費的網頁託管服務：

### 第一步：建立 GitHub Repository
1. 登入您的 GitHub 帳號。
2. 點擊右上角 `New` 建立一個新的 Repository，命名為 `tw-stock-analyst`。
3. 保持為 `Public`，不要勾選初始化 README，直接點擊 `Create repository`。

### 第二步：推送程式碼
在您電腦上的專案目錄下（例如 `tw-stock-analyst/`）打開終端機 (Terminal)，執行以下指令：

```bash
# 初始化 Git 倉庫
git init

# 將所有檔案加入暫存區
git add .

# 提交變更
git commit -m "feat: init Taiwan Stock Strategy Hub"

# 設定分支名稱為 main
git branch -M main

# 關聯到您的 GitHub Repository (請將 <username> 替換成您的 GitHub 帳號)
git remote add origin https://github.com/<username>/tw-stock-analyst.git

# 推送到 GitHub
git push -u origin main
```

### 第三步：開啟 GitHub Pages 服務
1. 打開您的 GitHub Repository 網頁，點擊上方的 **`Settings` (設定)**。
2. 在左側選單中找到 **`Pages`** 點擊進入。
3. 在 **Build and deployment** 下方的 **Source** 選擇 `Deploy from a branch`。
4. 在 **Branch** 選項中，將 `None` 改選為 **`main`**，資料夾保持為 **`/ (root)`**。
5. 點擊 **`Save` (儲存)**。

🎉 **大功告成！** 約等待 1~2 分鐘，GitHub 會自動在頁面最上方顯示您的專屬網址，格式通常為：
`https://<YOUR-GITHUB-USERNAME>.github.io/tw-stock-analyst/`

---

## 📁 檔案結構說明

```
tw-stock-analyst/
├── index.html          # 主頁面結構與控制面板
├── style.css           # 奢華暗色調科技風設計與動畫樣式
├── README.md           # 專案說明書 (本檔案)
└── js/
    ├── data.js         # 內建台股真實歷史日K數據 (2330, 2317, 2454, 0050)
    ├── indicators.js   # 技術指標公式計算器 (MA, KD, RSI, Bollinger Bands, MACD)
    ├── strategies.js   # 四大策略訊號生成與中文教學 Diagnoses 文本
    ├── backtester.js   # 模擬台股交易規則的回測引擎
    ├── ui.js           # TradingView 圖表配置與互動控制
    └── app.js          # 全局事件協調整合與模擬器邏輯
```

---

## ⚖️ 免責聲明
本專案所有回測數據與策略解析僅供**程式設計、量化交易教學與研究參考**，不構成任何形式的投資建議。股市投資具有高度風險，交易者應審慎評估自身資金與風險承受能力，並對個人投資決策負完全責任。
