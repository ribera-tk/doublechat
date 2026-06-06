// ==UserScript==
// @name         DoubleChat
// @match        https://chatgpt.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  let isSending = false;
  let aiSaveTimer = null;
  let aiObserveTimer = null;

  // 🌟 【1の修正：手元のメモ帳と管理変数】
  let conversationLog = []; // 📝 内部ログバッファ（手元のメモ帳）
  let queue = [];
  let isProcessing = false;
  let lastHash = "";
  let currentUserQuery = ""; 

  // 📊 GASウェブアプリURL
  const GAS_URL = "https://script.google.com/macros/s/AKfycbz5KpGu5WMGrpsuHcfNFX5ygcnL0yfsOIBEEETvTZ8cBzZ842GG-HIEvx9XEwCM4j56ew/exec";

  // 🔒 重複を完全にブロックするハッシュ関数
  function getHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString();
  }

  // ⛓️ 順番通りにタスクを実行するキューシステム
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

  // 🛠️ UIの作成
  function createUI() {
    if (document.getElementById("dc-root")) return;
    const root = document.createElement("div");
    root.id = "dc-root";
    root.innerHTML = `
      <div id="dc-header">
        DoubleChat v14.1
        <div id="dc-controls">
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
      #dc-controls { display: flex; gap: 15px; }
      #dc-max, #dc-min { cursor: pointer; font-weight: bold; }
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
    const body = document.getElementById("dc-body");
    const toggleMin = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (body.style.display === "none") { body.style.display = "flex"; minBtn.textContent = "-"; }
      else { body.style.display = "none"; minBtn.textContent = "+"; }
    };
    minBtn.addEventListener("touchstart", toggleMin, { passive: false });
    minBtn.addEventListener("click", toggleMin);

    const maxBtn = document.getElementById("dc-max");
    const toggleMax = (e) => {
      e.preventDefault(); e.stopPropagation();
      root.classList.toggle("dc-maximized");
    };
    maxBtn.addEventListener("touchstart", toggleMax, { passive: false });
    maxBtn.addEventListener("click", toggleMax);

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

  // 📝 メモ帳（バッファ）に書き込みつつ、日記帳（GAS）にも送る関数
  function saveLog(role, content) {
    // 1. 手元のメモ帳（バッファ）に保存
    conversationLog.push({ role: role, content: content });

    // 2. 日記帳（GAS）に送信
    if (!GAS_URL || typeof GM_xmlhttpRequest === "undefined") return;
    GM_xmlhttpRequest({
      method: "GET",
      url: GAS_URL + "?role=" + encodeURIComponent(role) + "&content=" + encodeURIComponent(content) + "&_=" + Date.now(),
      onload: function(res) { console.log("Log saved:", res.responseText); }
    });
  }

  // 🤖 ジェミー呼び出し（引数はシンプルに2つに固定）
  function callGemini(text, callback) {
    if (typeof GM_xmlhttpRequest === "undefined") { callback("Gemini: 拡張機能エラー"); return; }
    
    // 🌟 画面（DOM）は見ず、手元のメモ帳から直近のチャッピーの回答を取得
    let chappyLatestResponse = "（まだ回答なし）";
    for (let i = conversationLog.length - 1; i >= 0; i--) {
      if (conversationLog[i].role === "チャッピー") {
        chappyLatestResponse = conversationLog[i].content;
        break;
      }
    }

    const customPrompt = `
【指示】${text}
【チャッピーの回答】${chappyLatestResponse}
上記のチャッピーの回答を踏まえ、補足を簡潔に。日本語で。提案は抑えめに。
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
    const observer = new MutationObserver(() => {
      if (aiObserveTimer) return;
      aiObserveTimer = setTimeout(() => {
        aiObserveTimer = null;
        const messages = document.querySelectorAll("[data-message-author-role='assistant']");
        if (!messages.length) return;
        
        const last = messages[messages.length - 1];
        const text = last.textContent?.trim();
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

        // ⏳ 1.5秒間文字が変化しなければ「確定」
        clearTimeout(aiSaveTimer);
        aiSaveTimer = setTimeout(() => {
          const currentHash = getHash(text);
          if (currentHash === lastHash) return;
          lastHash = currentHash;

          last.removeAttribute("data-dc-observing");

          // 🌟 メモ帳と日記帳に同時に書き込み
          enqueue(async () => {
            saveLog("チャッピー", text);
          });

          if (currentUserQuery) {
            const queryToGemini = currentUserQuery;
            currentUserQuery = ""; 
            
            enqueue(async () => {
              await new Promise((resolve) => {
                // 🌟 引数はシンプルに元の形へ。callGeminiの内部で自動でメモ帳を読みます
                callGemini(queryToGemini, (reply) => {
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
        }, 1500);
      }, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function enableDrag() {
    const box = document.getElementById("dc-root");
    const header = document.getElementById("dc-header");
    let dragging = false; let offsetX = 0; let offsetY = 0;
    header.addEventListener("mousedown", (e) => {
      if (e.target.id === "dc-min" || e.target.id === "dc-max") return;
      dragging = true; offsetX = e.clientX - box.offsetLeft; offsetY = e.clientY - box.offsetTop;
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return; box.style.left = (e.clientX - offsetX) + "px"; box.style.top = (e.clientY - offsetY) + "px"; box.style.right = "auto";
    });
    document.addEventListener("mouseup", () => dragging = false);
    header.addEventListener("touchstart", (e) => {
      if (e.target.id === "dc-min" || e.target.id === "dc-max") return;
      dragging = true; const t = e.touches[0]; offsetX = t.clientX - box.offsetLeft; offsetY = t.clientY - box.offsetTop;
    });
    document.addEventListener("touchmove", (e) => {
      if (!dragging) return; e.preventDefault(); const t = e.touches[0]; box.style.left = (t.clientX - offsetX) + "px"; box.style.top = (t.clientY - offsetY) + "px"; box.style.right = "auto";
    }, { passive: false });
    document.addEventListener("touchend", () => dragging = false);
  }

  function bootstrap() {
    if (!document.body) { setTimeout(bootstrap, 200); return; }
    createUI();
    observeAI();
    const log = document.getElementById("dc-log");
    if (log) log.innerHTML = '<div style="color:#0a84ff">🟢 DoubleChat v14.1 安定版起動</div>';
  }

  setTimeout(bootstrap, 1500);
})();
