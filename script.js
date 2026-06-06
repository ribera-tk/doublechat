// ==UserScript==
// @name         DoubleChat v14.2.2
// @match        https://chatgpt.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  const DC_VERSION = "14.2.2";

  let isSending = false;
  let aiSaveTimer = null;
  let aiObserveTimer = null;

  let conversationLog = []; 
  let queue = [];
  let isProcessing = false;
  let lastHash = "";
  let currentUserQuery = ""; 

  const GAS_URL = "https://script.google.com/macros/s/AKfycbz5KpGu5WMGrpsuHcfNFX5ygcnL0yfsOIBEEETvTZ8cBzZ842GG-HIEvx9XEwCM4j56ew/exec";

  function getHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString();
  }

  async function enqueue(task) {
    queue.push(task);
    if (!isProcessing) await processQueue();
  }

  async function processQueue() {
    isProcessing = true;
    while (queue.length > 0) {
      const task = queue.shift();
      try { await task(); } catch (e) { console.error(e); }
    }
    isProcessing = false;
  }

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
      #dc-root { position: fixed; top: 70px; right: 10px; width: 320px; z-index: 9999; background: rgba(255,255,255,0.95); border: 1px solid rgba(0,0,0,0.2); border-radius: 10px; font-family: Arial; color: #111; }
      #dc-header { padding: 10px; display: flex; justify-content: space-between; cursor: move; font-weight: bold; border-bottom: 1px solid #ccc; }
      #dc-body { padding: 10px; display: flex; flex-direction: column; }
      #dc-log { height: 120px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px; padding: 6px; margin-bottom: 6px; font-size: 12px; }
      #dc-input { height: 60px; margin-bottom: 6px; }
      #dc-send { padding: 8px; cursor: pointer; }
    `;
    document.head.appendChild(style);

    document.getElementById("dc-send").onclick = send;
    enableDrag();
  }

  function appendLog(text) {
    const log = document.getElementById("dc-log");
    if (!log) return;

    const line = document.createElement("div");
    line.textContent = text;

    if (text.startsWith("YOU:")) {
      line.style.color = "#0a84ff";
      saveLog("YOU", text.replace("YOU: ", ""));
    }

    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  // ★ バージョン付きログ送信
  function saveLog(role, content) {
    conversationLog.push({ role, content });

    if (!GAS_URL || typeof GM_xmlhttpRequest === "undefined") return;

    GM_xmlhttpRequest({
      method: "GET",
      url:
        GAS_URL +
        "?role=" + encodeURIComponent(role) +
        "&content=" + encodeURIComponent(content) +
        "&ver=" + DC_VERSION +
        "&_=" + Date.now()
    });
  }

  function callGemini(text, gptText, callback) {
    const prompt = `
【指示】${text}
【チャッピーの回答】${gptText}
補足を簡潔に
`.trim();

    GM_xmlhttpRequest({
      method: "POST",
      url: GAS_URL,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ text: prompt }),
      onload: function(res) {
        try {
          const data = JSON.parse(res.responseText);
          const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "応答なし";
          callback(reply);
        } catch {
          callback("Geminiエラー");
        }
      }
    });
  }

  async function send() {
    if (isSending) return;
    isSending = true;

    const inputEl = document.getElementById("dc-input");
    const text = inputEl.value.trim();
    if (!text) return;

    appendLog("YOU: " + text);
    currentUserQuery = text;
    inputEl.value = "";

    const ta = document.querySelector("main textarea");
    if (ta) {
      ta.value = text;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("button[data-testid='send-button']")?.click();
    }

    setTimeout(() => isSending = false, 1000);
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
        if (!text) return;

        clearTimeout(aiSaveTimer);
        aiSaveTimer = setTimeout(() => {
          const hash = getHash(text);
          if (hash === lastHash) return;
          lastHash = hash;

          saveLog("チャッピー", text);

          if (currentUserQuery) {
            const q = currentUserQuery;
            currentUserQuery = "";

            callGemini(q, text, (reply) => {
              appendLog("Gemini: " + reply);
              saveLog("ジェミー", reply);
            });
          }

        }, 1200);
      }, 150);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function enableDrag() {
    const box = document.getElementById("dc-root");
    const header = document.getElementById("dc-header");

    let dragging = false, x = 0, y = 0;

    header.addEventListener("mousedown", e => {
      dragging = true;
      x = e.clientX - box.offsetLeft;
      y = e.clientY - box.offsetTop;
    });

    document.addEventListener("mousemove", e => {
      if (!dragging) return;
      box.style.left = (e.clientX - x) + "px";
      box.style.top = (e.clientY - y) + "px";
    });

    document.addEventListener("mouseup", () => dragging = false);
  }

  function bootstrap() {
    createUI();
    observeAI();

    appendLog("🟢 起動 v" + DC_VERSION);
  }

  setTimeout(bootstrap, 1500);

})();
