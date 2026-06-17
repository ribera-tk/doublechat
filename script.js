// ==UserScript==
// @name         DoubleChat
// @match        https://chatgpt.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  // 🌟 バージョン一括管理
  const DC_VERSION = "14.3.0";

  let isSending = false;
  let aiSaveTimer = null;
  let aiObserveTimer = null;

  let conversationLog = []; 
  let queue = [];
  let isProcessing = false;
  let lastHash = "";
  let currentUserQuery = ""; 

  // 🎨 モード管理システム
  let currentMode = "normal"; // "normal", "present", "debate"
  const MODES = {
    normal: {
      label: "通常",
      prompt: "上記のチャッピーの回答を踏まえ、補足を簡潔に。日本語で。提案は抑えめに。"
    },
    present: {
      label: "プレゼン",
      prompt: "チャッピーの回答から「結論」と「要点」のみを抽出し、前提や解説はすべて省いて、数行でズバッと答えのみを出力せよ。日本語で。提案は抑えめに。"
    },
    debate: {
      label: "討論",
      prompt: "チャッピーの回答に対し、あえて異なる視点や客観的な反論・改善点を1点提示し、議論を深めるための鋭い問いかけを行え。日本語で。提案は抑えめに。"
    }
  };

  // 📊 GASウェブアプリURL
  const GAS_URL = "https://script.google.com/macros/s/AKfycbz5KpGu5WMGrpsuHcfNFX5ygcnL0yfsOIBEEETvTZ8cBzZ842GG-HIEvx9XEwCM4j56ew/exec";

  // 🔒 重複ブロック用ハッシュ関数
  function getHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString();
  }

  // ⛓️ キューシステム
  async function enqueue(task) {
    queue.push(task);
    if (!isProcessing) {
      await processQueue();
    }
  }

  async function processQueue() {
    isProcessing = true;
    while (queue.length > 0) {
      const task = queue.shift();
      try {
        await task();
      } catch (e) {
        console.error("Queue task error:", e);
      }
    }
    isProcessing = false;
  }

  // 🛠️ UI作成
  function createUI() {
    if (document.getElementById("dc-root")) return;
    const root = document.createElement("div");
    root.id = "dc-root";
    root.innerHTML = `
      <div id="dc-header">
        DoubleChat v${DC_VERSION}
        <div id="dc-controls">
          <span id="dc-mode">通常</span>
          <span id="dc-max">□</span>
          <span id="dc-min">-</span>
        </div>
      </div>
      <div id="dc-body">
        <div id="dc-log"></div>
        <textarea id="dc-input" placeholder="入力..."></textarea>
        <button id="dc-send">送信</button>
      </div>
    `;
    document.body.appendChild(root);

    const style = document.createElement("style");
    style.innerHTML = `
      #dc-root { position: fixed; top: 70px; right: 10px; width: 320px; z-index: 9999; background: rgba(255,255,255,0.95); border: 1px solid rgba(0,0,0,0.2); border-radius: 10px; font-family: Arial; color: #111; transition: all 0.2s ease; }
      #dc-header { padding: 10px; display: flex; justify-content: space-between; cursor: move; font-weight: bold; user-select: none; border-bottom: 1px solid #ccc; }
      #dc-controls { display: flex; gap: 15px; align-items: center; }
      #dc-mode { cursor: pointer; font-size: 11px; background: #0a84ff; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold; user-select: none; }
      #dc-max, #dc-min { cursor: pointer; font-weight: bold; padding: 0 4px; }
      #dc-body { padding: 10px; display: flex; flex-direction: column; }
      #dc-log { display: flex; flex-direction: column; height: 120px; overflow-y: auto; background: rgba(255,255,255,0.8); border: 1px solid #ddd; border-radius: 6px; padding: 6px; margin-bottom: 6px; font-size: 12px; }
      #dc-input { width: 100%; height: 60px; margin-bottom: 6px; box-sizing: border-box; resize: vertical; }
      #dc-send { width: 100%; padding: 8px; cursor: pointer; }
      .dc-maximized { width: 90vw !important; height: 85vh !important; top: 5vh !important; left: 5vw !important; right: auto !important; }
      .dc-maximized #dc-body { height: calc(100% - 40px); }
      .dc-maximized #dc-log { flex-grow: 1; height: auto !important; font-size: 14px; }
      .dc-maximized #dc-input { height: 100px; }
    `;
    document.head.appendChild(style);

    document.getElementById("dc-send").onclick = send;

    const minBtn = document.getElementById("dc-min");
    const maxBtn = document.getElementById("dc-max");
    const modeBtn = document.getElementById("dc-mode");
    const body = document.getElementById("dc-body");

    // 🔄 ⏰ 最小化・再表示のトグル
    const toggleMin = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (body.style.display === "none") { 
        root.classList.remove("dc-maximized");
        body.style.display = "flex"; 
        minBtn.textContent = "-"; 
      } else { 
        root.classList.remove("dc-maximized");
        body.style.display = "none"; 
        minBtn.textContent = "+"; 
      }
    };

    // 🔄 ⏰ 最大化のトグル
    const toggleMax = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (body.style.display === "none") {
        body.style.display = "flex";
        minBtn.textContent = "-";
        root.classList.add("dc-maximized");
      } else {
        root.classList.toggle("dc-maximized");
      }
    };

    // 🔄 ⏰ 【新機能】プロンプトモード切替（通常 ➔ プレゼン ➔ 討論）
    const toggleMode = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (currentMode === "normal") currentMode = "present";
      else if (currentMode === "present") currentMode = "debate";
      else currentMode = "normal";

      modeBtn.textContent = MODES[currentMode].label;
      
      // 🟢 ログに緑文字で現在のモードを表示
      const log = document.getElementById("dc-log");
      if (log) {
        const line = document.createElement("div");
        line.textContent = `🟢 [${MODES[currentMode].label}モード] に切り替えました`;
        line.style.color = "#2ecc71";
        line.style.fontWeight = "bold";
        line.style.marginBottom = "4px";
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
      }
    };

    minBtn.addEventListener("touchstart", toggleMin, { passive: false });
    minBtn.addEventListener("click", toggleMin);
    maxBtn.addEventListener("touchstart", toggleMax, { passive: false });
    maxBtn.addEventListener("click", toggleMax);
    modeBtn.addEventListener("touchstart", toggleMode, { passive: false });
    modeBtn.addEventListener("click", toggleMode);

    enableDrag();
  }

  function appendLog(text) {
    const log = document.getElementById("dc-log");
    if (!log) return;
    const line = document.createElement("div");
    line.textContent = text;
    line.style.marginBottom = "4px";
    line.style.borderBottom = "1px dashed #eee";
    line.style.paddingBottom = "4px";
    
    if (text.startsWith("YOU:")) {
      line.style.color = "#0a84ff";
      saveLog("YOU", text.replace("YOU: ", ""));
    }
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  function saveLog(role, content) {
    conversationLog.push({ role, content }); 
    if (!GAS_URL || typeof GM_xmlhttpRequest === "undefined") return;

    const logWithVersion = `[v${DC_VERSION}][${MODES[currentMode].label}] ${content}`;
    GM_xmlhttpRequest({
      method: "GET",
      url: GAS_URL + "?role=" + encodeURIComponent(role) + "&content=" + encodeURIComponent(logWithVersion) + "&_=" + Date.now(),
      onload: function(res) { console.log("Log saved:", res.responseText); }
    });
  }

  function callGemini(text, gptText, callback) {
    if (typeof GM_xmlhttpRequest === "undefined") { callback("Gemini: 拡張機能エラー"); return; }
    
    // ⚡ モードに応じて裏のシステムプロンプトを自動選択！
    const activePrompt = MODES[currentMode].prompt;

    const customPrompt = `
【指示】${text}
【チャッピーの回答】${gptText || "（まだ回答なし）"}
${activePrompt}
`.trim();

    GM_xmlhttpRequest({
      method: "POST",
      url: GAS_URL,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ text: customPrompt }),
      onload: function(res) {
        try {
          const data = JSON.parse(res.responseText);
          if (data.error) { callback("Geminiエラー: " + (data.error.message || JSON.stringify(data.error))); return; }
          const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "応答なし";
          callback(reply);
        } catch(e) { callback("Gemini: パース失敗"); }
      },
      onerror: function() { callback("Gemini: 通信エラー"); }
    });
  }

  async function send() {
    if (isSending) return;
    isSending = true;
    const inputEl = document.getElementById("dc-input");
    const text = inputEl.value.trim();
    if (!text) { isSending = false; return; }

    appendLog("YOU: " + text);
    currentUserQuery = text; 
    inputEl.value = "";

    try {
      const target = document.getElementById("prompt-textarea") || document.querySelector("main textarea") || document.querySelector("[contenteditable='true']");
      if (!target) return;
      target.focus();
      await new Promise(r => setTimeout(r, 100));
      document.execCommand("selectAll");
      document.execCommand("delete");
      document.execCommand("insertText", false, text);
      target.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      const btn = document.querySelector("main button[data-testid*='send-button']") || document.querySelector("button[data-testid='send-button']");
      if (btn) btn.click();
    } finally {
      setTimeout(() => { isSending = false; }, 1200);
    }
  }

  function observeAI() {
    const targetEl = document.querySelector("main") || document.body;

    const observer = new MutationObserver((mutations) => {
      let hasChatGPTUpdate = false;
      const dcRoot = document.getElementById("dc-root");
      for (const m of mutations) {
        if (!dcRoot || !dcRoot.contains(m.target)) {
          hasChatGPTUpdate = true;
          break;
        }
      }
      if (!hasChatGPTUpdate) return;

      const isGenerating = document.querySelector("button[data-testid*='stop-button']") || 
                           document.querySelector("main button[aria-label*='Stop']");
      if (isGenerating) {
        clearTimeout(aiSaveTimer); 
        return; 
      }

      if (aiObserveTimer) return;
      aiObserveTimer = setTimeout(() => {
        aiObserveTimer = null;
        const messages = document.querySelectorAll("[data-message-author-role='assistant']");
        if (!messages.length) return;
        
        const last = messages[messages.length - 1];
        
        // ⚡ 【監督案】直近の末尾800文字だけをスライスして軽量化！
        const text = (last.textContent?.trim() || "").slice(-800);
        if (!text || text.length < 10) return;

        const log = document.getElementById("dc-log");
        if (!log) return;
        const isAtBottom = (log.scrollHeight - log.scrollTop - log.clientHeight) < 30;

        let lastAiLine = null;
        const divs = log.getElementsByTagName("div");
        for (let i = divs.length - 1; i >= 0; i--) {
          if (divs[i].textContent.startsWith("AI:")) { lastAiLine = divs[i]; break; }
        }

        if (lastAiLine && last.getAttribute("data-dc-observing") === "true") {
          lastAiLine.textContent = "AI: " + text;
        } else {
          last.setAttribute("data-dc-observing", "true");
          const line = document.createElement("div");
          line.textContent = "AI: " + text;
          line.style.color = "#2ecc71";
          line.style.marginBottom = "4px";
          line.style.borderBottom = "1px dashed #eee";
          line.style.paddingBottom = "4px";
          log.appendChild(line);
        }

        if (isAtBottom) log.scrollTop = log.scrollHeight;

        clearTimeout(aiSaveTimer);
        aiSaveTimer = setTimeout(() => {
          if (document.querySelector("button[data-testid*='stop-button']")) return;

          const currentHash = getHash(text);
          if (currentHash === lastHash) return;
          lastHash = currentHash;

          last.removeAttribute("data-dc-observing");
          saveLog("チャッピー", text);

          if (currentUserQuery) {
            const queryToGemini = currentUserQuery;
            currentUserQuery = ""; 
            
            enqueue(async () => {
              await new Promise((resolve) => {
                callGemini(queryToGemini, text, (reply) => {
                  const dcLog = document.getElementById("dc-log");
                  if (dcLog) {
                    const line = document.createElement("div");
                    line.textContent = "Gemini: " + reply;
                    line.style.marginBottom = "4px";
                    line.style.borderBottom = "1px dashed #eee";
                    line.style.paddingBottom = "4px";
                    dcLog.appendChild(line);
                    dcLog.scrollTop = dcLog.scrollHeight;
                  }
                  saveLog("ジェミー", reply.slice(0, 500));
                  resolve(); 
                });
              });
            });
          }
        }, 300); 
      }, 150);
    });
    observer.observe(targetEl, { childList: true, subtree: true });
  }

  // 🛠️ ドラッグ最適化（v14.3.0 完璧安全策版）
  function enableDrag() {
    const box = document.getElementById("dc-root");
    const header = document.getElementById("dc-header");
    let dragging = false; let offsetX = 0; let offsetY = 0;
    
    header.addEventListener("mousedown", (e) => {
      // ⚡ 【監督案】closest を使ってコントロール領域全体を確実にガード！
      if (e.target.closest("#dc-controls")) return;
      dragging = true; 
      box.style.transition = "none"; 
      offsetX = e.clientX - box.offsetLeft; 
      offsetY = e.clientY - box.offsetTop;
    });
    
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return; 
      box.style.left = (e.clientX - offsetX) + "px"; 
      box.style.top = (e.clientY - offsetY) + "px"; 
      box.style.right = "auto";
    });
    
    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      box.style.transition = "all 0.2s ease"; 
    });
    
    header.addEventListener("touchstart", (e) => {
      // ⚡ 【監督案】タッチ時も同様に closest で鉄壁ガード！
      if (e.target.closest("#dc-controls")) return;
      dragging = true; 
      box.style.transition = "none"; 
      const t = e.touches[0]; 
      offsetX = t.clientX - box.offsetLeft; 
      offsetY = t.clientY - box.offsetTop;
    });
    
    document.addEventListener("touchmove", (e) => {
      if (!dragging) return; 
      e.preventDefault(); 
      const t = e.touches[0]; 
      box.style.left = (t.clientX - offsetX) + "px"; 
      box.style.top = (t.clientY - offsetY) + "px"; 
      box.style.right = "auto";
    }, { passive: false });
    
    document.addEventListener("touchend", () => {
      if (!dragging) return;
      dragging = false;
      box.style.transition = "all 0.2s ease"; 
    });
  }

  function bootstrap() {
    if (!document.body) { setTimeout(bootstrap, 200); return; }
    createUI();
    observeAI();
    const log = document.getElementById("dc-log");
    if (log) log.innerHTML = `<div style="color:#0a84ff">🟢 DoubleChat v${DC_VERSION} 起動完了</div>`;
  }

  setTimeout(bootstrap, 1500);
})();
