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

  // 🌟 GASウェブアプリURL
  const GAS_URL = "https://script.google.com/macros/s/AKfycbw5b5_ouW3kbcKZzTakK-EfY_L-OENUYKtLn1l0jdf_PJEvZYTcfeyPJ7rXy8Gp9i-7fA/exec";
  
  // 🔑 Gemini APIキー（復活させたぜ！）
  const apiKey = "AIzaSyArR0LRL8pP0zRBiVULEvhxVkHzooj_34Q";

  function createUI() {
    if (document.getElementById("dc-root")) return;

    const root = document.createElement("div");
    root.id = "dc-root";
    root.innerHTML = `
      <div id="dc-header">
        DoubleChat v13.4
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
      
      /* 🌟 最大化時のスタイル */
      .dc-maximized { width: 90vw !important; height: 85vh !important; top: 5vh !important; left: 5vw !important; right: auto !important; }
      .dc-maximized #dc-body { height: calc(100% - 40px); }
      .dc-maximized #dc-log { flex-grow: 1; height: auto !important; font-size: 14px; }
      .dc-maximized #dc-input { height: 100px; }
    `;
    document.head.appendChild(style);

    document.getElementById("dc-send").onclick = send;

    // 最小化の処理
    const minBtn = document.getElementById("dc-min");
    const body = document.getElementById("dc-body");
    const toggleMin = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (body.style.display === "none") { body.style.display = "flex"; minBtn.textContent = "-"; }
      else { body.style.display = "none"; minBtn.textContent = "+"; }
    };
    minBtn.addEventListener("touchstart", toggleMin, { passive: false });
    minBtn.addEventListener("click", toggleMin);

    // 最大化の処理
    const maxBtn = document.getElementById("dc-max");
    const toggleMax = (e) => {
      e.preventDefault(); e.stopPropagation();
      root.classList.toggle("dc-maximized");
      if (root.classList.contains("dc-maximized")) {
        body.style.display = "flex";
        minBtn.textContent = "-";
      }
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
      saveLog("user", text.replace("YOU: ", ""));
    }
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  function saveLog(role, content) {
    if (!GAS_URL || GAS_URL.includes("ここに") || typeof GM_xmlhttpRequest === "undefined") return;
    
    GM_xmlhttpRequest({
      method: "GET",
      url: GAS_URL + "?role=" + encodeURIComponent(role) + "&content=" + encodeURIComponent(content) + "&_=" + Date.now(),
      onload: function(res) { console.log("Log saved:", res.responseText); }
    });
  }

  // 🌟 v13.4：1.5-flash安定化(v1beta対応版) ＆ GPTログ連携
  function callGemini(text, callback) {
    if (typeof GM_xmlhttpRequest === "undefined") return;

    // 1. チャッピー（GPT）の最新の回答を画面から自動取得
    const gptArticles = document.querySelectorAll('main article');
    let gptLatestResponse = "（まだ回答なし）";
    if (gptArticles.length > 0) {
        const lastArticle = gptArticles[gptArticles.length - 1];
        gptLatestResponse = lastArticle.innerText || "";
    }

    // 2. 指示にチャッピーのログを合流させる
    const customPrompt = `
【指示】
${text}

【チャッピー（GPT）の最新の回答】
${gptLatestResponse}

上記のチャッピーの回答を踏まえた上で、あなたの見解や補足を簡潔に述べてください。
【制約】必ず日本語で。ChatGPTへコピーする手間を減らすため、提案は抑えめにしてください。
`.trim();

    // 3. 1.5-flash ＆ v1beta URL で通信実行
    GM_xmlhttpRequest({
        method: "POST",
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ contents: [{ parts: [{ text: customPrompt }] }] }),
        onload: function(res) {
            try {
                const data = JSON.parse(res.responseText);
                
                // エラーチェック
                if (data.error) {
                    callback("Googleエラー: " + data.error.message);
                    return;
                }
                
                // 正常な返答の取得
                const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "応答データを読み取れませんでした";
                callback(reply);
            } catch(e) {
                callback("パースエラー status:" + res.status);
            }
        }
    });
  }

  async function send() {
    if (isSending) return;
    isSending = true;
    const inputEl = document.getElementById("dc-input");
    const text = inputEl.value.trim();
    if (!text) { isSending = false; return; }
    appendLog("YOU: " + text);
    inputEl.value = "";

    // ChatGPTの送信と同時にGeminiも叩く！
    callGemini(text, (reply) => {
      appendLog("Gemini: " + reply);
      saveLog("ジェミー", reply);
    });

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
        const lastLine = log.lastElementChild;
        if (lastLine && lastLine.textContent.startsWith("AI:") && text.startsWith(lastLine.textContent.replace("AI: ", "").slice(0, 10))) {
          lastLine.textContent = "AI: " + text;
        } else {
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
          saveLog("チャッピー", text);
        }, 1500);
      }, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function enableDrag() {
    const box = document.getElementById("dc-root");
    const header = document.getElementById("dc-header");
    let dragging = false; let offsetX = 0; let offsetY = 0;
    header.addEventListener("mousedown", (e) => { if (e.target.id === "dc-min" || e.target.id === "dc-max") return; dragging = true; offsetX = e.clientX - box.offsetLeft; offsetY = e.clientY - box.offsetTop; });
    document.addEventListener("mousemove", (e) => { if (!dragging) return; box.style.left = (e.clientX - offsetX) + "px"; box.style.top = (e.clientY - offsetY) + "px"; box.style.right = "auto"; });
    document.addEventListener("mouseup", () => dragging = false);
    header.addEventListener("touchstart", (e) => { if (e.target.id === "dc-min" || e.target.id === "dc-max") return; dragging = true; const t = e.touches[0]; offsetX = t.clientX - box.offsetLeft; offsetY = t.clientY - box.offsetTop; });
    document.addEventListener("touchmove", (e) => { if (!dragging) return; e.preventDefault(); const t = e.touches[0]; box.style.left = (t.clientX - offsetX) + "px"; box.style.top = (t.clientY - offsetY) + "px"; box.style.right = "auto"; }, { passive: false });
    document.addEventListener("touchend", () => dragging = false);
  }

  function bootstrap() {
    if (!document.body) { setTimeout(bootstrap, 200); return; }
    createUI(); observeAI();
    const log = document.getElementById("dc-log");
    if (log) log.innerHTML = '<div style="color:#0a84ff">🟢 DoubleChat v13.4 起動完了</div>';
  }
  setTimeout(bootstrap, 1500);
})();
