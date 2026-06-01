// ==UserScript==
// @name         DoubleChat
// @match        https://chatgpt.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  let isSending = false;
  let aiSaveTimer = null; 

  // Firebase接続情報
  const FB_CONFIG = {
    apiKey: "AIzaSyBKMqx3PtJnniu7IdtwaAEkFttkcikGrjQ",
    projectId: "doublechattabs"
  };

  // =========================
  // UI作成
  // =========================
  function createUI() {
    if (document.getElementById("dc-root")) return;

    const root = document.createElement("div");
    root.id = "dc-root";

    root.innerHTML = `
      <div id="dc-header">
        DoubleChat v11.9
        <span id="dc-min">−</span>
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
      #dc-root {
        position: fixed;
        top: 70px;
        right: 10px;
        width: 320px;
        z-index: 9999;
        background: rgba(255,255,255,0.9);
        border: 1px solid rgba(0,0,0,0.2);
        border-radius: 10px;
        font-family: Arial;
        color: #111;
      }
      #dc-header {
        padding: 10px;
        display: flex;
        justify-content: space-between;
        cursor: move;
        font-weight: bold;
        user-select: none;
      }
      #dc-min { cursor: pointer; padding: 0 10px; }
      #dc-body { padding: 10px; }
      #dc-log {
        display: flex;
        flex-direction: column;
        height: 120px;
        overflow-y: auto;
        background: rgba(255,255,255,0.5);
        border-radius: 6px;
        padding: 6px;
        margin-bottom: 6px;
        font-size: 12px;
      }
      #dc-input { width: 100%; height: 60px; margin-bottom: 6px; }
      #dc-send { width: 100%; padding: 6px; }
    `;
    document.head.appendChild(style);

    document.getElementById("dc-send").onclick = send;

    const minBtn = document.getElementById("dc-min");
    const body = document.getElementById("dc-body");
    
    const toggleMin = (e) => {
      e.preventDefault(); 
      e.stopPropagation(); 
      if (body.style.display === "none") {
        body.style.display = "block";
        minBtn.textContent = "−";
      } else {
        body.style.display = "none";
        minBtn.textContent = "＋";
      }
    };

    minBtn.addEventListener("touchstart", toggleMin, { passive: false });
    minBtn.addEventListener("click", toggleMin);

    enableDrag();
  }

  // =========================
  // 画面ログ表示
  // =========================
  function appendLog(text) {
    const log = document.getElementById("dc-log");
    if (!log) return;

    const line = document.createElement("div");
    line.textContent = text;

    if (text.startsWith("YOU:")) {
      line.style.color = "#0a84ff";
      saveLog("user", text.replace("YOU: ", "")); 
    } else if (text.startsWith("AI:")) {
      line.style.color = "#2ecc71";
    }

    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  // ===================================
  // 🌟 モンキー特権通信（CSPを完全バイパス）
  // ===================================
  function saveLog(role, content) {
    const log = document.getElementById("dc-log");
    const url = `https://firestore.googleapis.com/v1/projects/${FB_CONFIG.projectId}/databases/(default)/documents/chat_logs?key=${FB_CONFIG.apiKey}`;
    
    const bodyData = {
      fields: {
        role: { stringValue: role },
        content: { stringValue: content },
        timestamp: { timestampValue: new Date().toISOString() }
      }
    };

    // GM_xmlhttpRequest を使ってブラウザの制限を突破
    GM_xmlhttpRequest({
      method: "POST",
      url: url,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify(bodyData),
      onload: function(res) {
        if (res.status >= 200 && res.status < 300) {
          console.log(`Firebase同期成功 [${role}]`);
        } else {
          showError("HTTPエラー: " + res.status);
        }
      },
      onerror: function(err) {
        showError("通信失敗");
      }
    });

    function showError(msg) {
      if (log) {
        const line = document.createElement("div");
        line.textContent = "⚠️ Firebase送信失敗: " + msg;
        line.style.color = "#ff4d4d";
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
      }
    }
  }

  // =========================
  // 送信処理
  // =========================
  async function send() {
    if (isSending) return;
    isSending = true;

    const inputEl = document.getElementById("dc-input");
    const text = inputEl.value.trim();

    if (!text) {
      isSending = false;
      return;
    }

    appendLog("YOU: " + text);
    inputEl.value = "";

    try {
      const target =
        document.getElementById("prompt-textarea") ||
        document.querySelector('main textarea') ||
        document.querySelector('[contenteditable="true"]');

      if (!target) return;

      target.focus();
      await new Promise(r => setTimeout(r, 100));

      document.execCommand("selectAll");
      document.execCommand("delete");
      document.execCommand("insertText", false, text);

      target.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));

      const btn =
        document.querySelector('main button[data-testid*="send-button"]') ||
        document.querySelector('button[data-testid="send-button"]') ||
        document.querySelector('button[type="submit"]');

      if (btn) btn.click();

    } finally {
      setTimeout(() => { isSending = false; }, 1200);
    }
  }

  // =========================
  // AI返答の常時監視
  // =========================
  let aiObserveTimer = null;

  function observeAI() {
    const observer = new MutationObserver(() => {
      if (aiObserveTimer) return;

      aiObserveTimer = setTimeout(() => {
        aiObserveTimer = null;

        const messages = document.querySelectorAll('[data-message-author-role="assistant"]');
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
          log.appendChild(line);
        }
        
        if (isAtBottom) {
          log.scrollTop = log.scrollHeight;
        }

        clearTimeout(aiSaveTimer);
        aiSaveTimer = setTimeout(() => {
          saveLog("ai", text);
        }, 1500);

      }, 150);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // =========================
  // ドラッグ移動
  // =========================
  function enableDrag() {
    const box = document.getElementById("dc-root");
    const header = document.getElementById("dc-header");

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener("mousedown", (e) => {
      if (e.target.id === "dc-min") return; 
      dragging = true;
      offsetX = e.clientX - box.offsetLeft;
      offsetY = e.clientY - box.offsetTop;
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      box.style.left = (e.clientX - offsetX) + "px";
      box.style.top = (e.clientY - offsetY) + "px";
      box.style.right = "auto";
    });

    document.addEventListener("mouseup", () => dragging = false);

    header.addEventListener("touchstart", (e) => {
      if (e.target.id === "dc-min") return; 
      dragging = true;
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

    document.addEventListener("touchend", () => dragging = false);
  }

  // 起動処理
  setTimeout(() => {
    createUI();
    observeAI();
    
    const log = document.getElementById("dc-log");
    if (log) log.insertAdjacentHTML('beforeend', '<div style="color:#2ecc71">🔵 Firebase(REST) モード準備完了</div>');
  }, 1000);

})();
  // =========================
  function appendLog(text) {
    const log = document.getElementById("dc-log");
    if (!log) return;

    const line = document.createElement("div");
    line.textContent = text;

    if (text.startsWith("YOU:")) {
      line.style.color = "#0a84ff";
      saveLog("user", text.replace("YOU: ", "")); 
    } else if (text.startsWith("AI:")) {
      line.style.color = "#2ecc71";
    }

    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  // ===================================
  // 🌟 ライブラリ不要：直接データを送信する機能
  // ===================================
  function saveLog(role, content) {
    const log = document.getElementById("dc-log");
    
    // FirebaseのAPI窓口のURL
    const url = `https://firestore.googleapis.com/v1/projects/${FB_CONFIG.projectId}/databases/(default)/documents/chat_logs?key=${FB_CONFIG.apiKey}`;
    
    // Firestoreが受け取れるデータ形式に変形
    const bodyData = {
      fields: {
        role: { stringValue: role },
        content: { stringValue: content },
        timestamp: { timestampValue: new Date().toISOString() }
      }
    };

    // 直接送信
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyData)
    })
    .then(res => {
      if (!res.ok) throw new Error("HTTPエラー: " + res.status);
      console.log(`Firebase同期成功 [${role}]`);
    })
    .catch(err => {
      console.error("Firebase送信失敗:", err);
      if (log) {
        const line = document.createElement("div");
        line.textContent = "⚠️ Firebase送信失敗: " + err.message;
        line.style.color = "#ff4d4d";
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
      }
    });
  }

  // =========================
  // 送信処理
  // =========================
  async function send() {
    if (isSending) return;
    isSending = true;

    const inputEl = document.getElementById("dc-input");
    const text = inputEl.value.trim();

    if (!text) {
      isSending = false;
      return;
    }

    appendLog("YOU: " + text);
    inputEl.value = "";

    try {
      const target =
        document.getElementById("prompt-textarea") ||
        document.querySelector('main textarea') ||
        document.querySelector('[contenteditable="true"]');

      if (!target) return;

      target.focus();
      await new Promise(r => setTimeout(r, 100));

      document.execCommand("selectAll");
      document.execCommand("delete");
      document.execCommand("insertText", false, text);

      target.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));

      const btn =
        document.querySelector('main button[data-testid*="send-button"]') ||
        document.querySelector('button[data-testid="send-button"]') ||
        document.querySelector('button[type="submit"]');

      if (btn) btn.click();

    } finally {
      setTimeout(() => { isSending = false; }, 1200);
    }
  }

  // =========================
  // AI返答の常時監視
  // =========================
  let aiObserveTimer = null;

  function observeAI() {
    const observer = new MutationObserver(() => {
      if (aiObserveTimer) return;

      aiObserveTimer = setTimeout(() => {
        aiObserveTimer = null;

        const messages = document.querySelectorAll('[data-message-author-role="assistant"]');
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
          log.appendChild(line);
        }
        
        if (isAtBottom) {
          log.scrollTop = log.scrollHeight;
        }

        clearTimeout(aiSaveTimer);
        aiSaveTimer = setTimeout(() => {
          saveLog("ai", text);
        }, 1500);

      }, 150);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // =========================
  // ドラッグ移動
  // =========================
  function enableDrag() {
    const box = document.getElementById("dc-root");
    const header = document.getElementById("dc-header");

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener("mousedown", (e) => {
      if (e.target.id === "dc-min") return; 
      dragging = true;
      offsetX = e.clientX - box.offsetLeft;
      offsetY = e.clientY - box.offsetTop;
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      box.style.left = (e.clientX - offsetX) + "px";
      box.style.top = (e.clientY - offsetY) + "px";
      box.style.right = "auto";
    });

    document.addEventListener("mouseup", () => dragging = false);

    header.addEventListener("touchstart", (e) => {
      if (e.target.id === "dc-min") return; 
      dragging = true;
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

    document.addEventListener("touchend", () => dragging = false);
  }

  // 起動処理
  setTimeout(() => {
    createUI();
    observeAI();
    
    const log = document.getElementById("dc-log");
    if (log) log.insertAdjacentHTML('beforeend', '<div style="color:#2ecc71">🔵 Firebase(REST) モード準備完了</div>');
  }, 1000);

})();

