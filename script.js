// ==UserScript==
// @name         DoubleChat
// @match        https://chatgpt.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  // 🌟 バージョン一括管理（ここを変更すればUI、起動ログ、日記帳すべてに反映）
  const DC_VERSION = "14.2.６";

  let isSending = false;
  let aiSaveTimer = null;
  let aiObserveTimer = null;

  let conversationLog = []; 
  let queue = [];
  let isProcessing = false;
  let lastHash = "";
  let currentUserQuery = ""; 

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
  // 🛠️ UI作成（v14.2.6 バグ修正版）
  function createUI() {
    if (document.getElementById("dc-root")) return;
    const root = document.createElement("div");
    root.id = "dc-root";
    root.innerHTML = `
      <div id="dc-header">
        DoubleChat v${DC_VERSION}
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
    const body = document.getElementById("dc-body");

    // 🔄 最小化・再表示のトグル
    const toggleMin = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (body.style.display === "none") { 
        body.style.display = "flex"; 
        minBtn.textContent = "-"; 
      } else { 
        // 🚨【バグ対策】最小化するときに、最大化状態（クラス）を強制解除して安全に着地させる
        root.classList.remove("dc-maximized");
        body.style.display = "none"; 
        minBtn.textContent = "+"; 
      }
    };

    // 🔄 最大化のトグル
    const toggleMax = (e) => {
      e.preventDefault(); e.stopPropagation();
      // もし最小化中（閉じた状態）なら、最大化ボタンは反応させない
      if (body.style.display === "none") return;
      root.classList.toggle("dc-maximized");
    };

    // タッチとクリックの競合を防ぎつつイベント登録
    minBtn.addEventListener("touchstart", toggleMin, { passive: false });
    minBtn.addEventListener("click", toggleMin);
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

  // 📝 手元のメモ帳に保存しつつ、日記（GAS）に送る
  function saveLog(role, content) {
    conversationLog.push({ role, content }); 

    if (!GAS_URL || typeof GM_xmlhttpRequest === "undefined") return;

    // 🌟 日記帳（シート）に書き込まれる内容の先頭に [v14.2.2] を自動付与！
    const logWithVersion = `[v${DC_VERSION}] ${content}`;

    GM_xmlhttpRequest({
      method: "GET",
      url: GAS_URL + "?role=" + encodeURIComponent(role) + "&content=" + encodeURIComponent(logWithVersion) + "&_=" + Date.now(),
      onload: function(res) { console.log("Log saved:", res.responseText); }
    });
  }

  // 🤖 ジェミーの通信
  function callGemini(text, gptText, callback) {
    if (typeof GM_xmlhttpRequest === "undefined") { callback("Gemini: 拡張機能エラー"); return; }
    
    const customPrompt = `
【指示】${text}
【チャッピーの回答】${gptText || "（まだ回答なし）"}
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

      // 🛑 【新方式】チャッピーがまだ出力中（ストップボタンが存在する）なら完全にスキップ
      const isGenerating = document.querySelector("button[data-testid*='stop-button']") || 
                           document.querySelector("main button[aria-label*='Stop']");
      if (isGenerating) {
        clearTimeout(aiSaveTimer); // 出力中は確定タイマーを常にリセット
        return; 
      }

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

        clearTimeout(aiSaveTimer);
        // ⚡ ストップボタンが消えた（＝完全に出力が終了した）ので、わずか300msの猶予で即座にジェミーへパス！
        aiSaveTimer = setTimeout(() => {
          // 念のため、この瞬間にストップボタンが復活していないか最終確認
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
        }, 300); // ⚡ 終了検知が正確なので、ここは300msで安全かつ超爆速になる
      }, 150);
    });
    observer.observe(targetEl, { childList: true, subtree: true });
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
    if (log) log.innerHTML = `<div style="color:#0a84ff">🟢 DoubleChat v${DC_VERSION} 起動完了</div>`;
  }

  setTimeout(bootstrap, 1500);
})();
