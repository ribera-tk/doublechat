// ==UserScript==
// @name         DoubleChat v14.2
// @match        https://chatgpt.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  // =========================
  // ■ 設定
  // =========================
  const DC_VERSION = "v14.2";
  const GAS_URL = "https://script.google.com/macros/s/AKfycbz5KpGu5WMGrpsuHcfNFX5ygcnL0yfsOIBEEETvTZ8cBzZ842GG-HIEvx9XEwCM4j56ew/exec";

  // =========================
  // ■ 端末判定（ハイブリッド）
  // =========================
  function getDeviceMode() {
    const ua = navigator.userAgent;
    const isMobileUA = /Android|iPhone|iPad/i.test(ua);
    const isTouch = 'ontouchstart' in window;
    const smallScreen = window.innerWidth < 768;

    if (isMobileUA || (isTouch && smallScreen)) return "mobile";
    return "desktop";
  }

  const DEVICE_MODE = getDeviceMode();
  const DEBUG = DEVICE_MODE === "desktop";

  function debugLog(label, data) {
    if (!DEBUG) return;
    console.log(`[DC DEBUG] ${label}`, data);
  }

  // =========================
  // ■ マギログ
  // =========================
  const conversationLog = [];

  function addLog(role, content, type = "message") {
    const log = {
      id: "msg-" + Date.now(),
      turn: conversationLog.length + 1,
      role,
      type,
      content,
      timestamp: Date.now()
    };
    conversationLog.push(log);
    debugLog("ADD_LOG", log);
    return log;
  }

  function buildContext() {
    return conversationLog
      .slice(-6)
      .map(l => `[${l.role}] ${l.content}`)
      .join("\n");
  }

  function saveLog(role, content) {
    addLog(role, content);

    GM_xmlhttpRequest({
      method: "GET",
      url: GAS_URL + "?role=" + encodeURIComponent(role) + "&content=" + encodeURIComponent(content)
    });
  }

  // =========================
  // ■ UI生成
  // =========================
  function createUI() {
    if (document.getElementById("dc-root")) return;

    const root = document.createElement("div");
    root.id = "dc-root";

    root.innerHTML = `
      <div id="dc-header">
        DoubleChat ${DC_VERSION} (${DEVICE_MODE})
      </div>
      <div id="dc-body">
        <div id="dc-log"></div>
        <textarea id="dc-input" placeholder="入力..."></textarea>
        <button id="dc-send">送信</button>
        ${DEBUG ? '<div id="dc-debug"></div>' : ''}
      </div>
    `;

    document.body.appendChild(root);

    // ================= CSS
    const style = document.createElement("style");
    style.innerHTML = `
      #dc-root {
        position: fixed;
        top: 70px;
        right: 10px;
        width: 320px;
        background: rgba(255,255,255,0.95);
        z-index: 9999;
        border-radius: 10px;
        font-family: Arial;
      }

      #dc-header {
        padding: 10px;
        font-weight: bold;
        border-bottom: 1px solid #ccc;
      }

      #dc-body {
        padding: 10px;
        display: flex;
        flex-direction: column;
        height: 300px;
      }

      #dc-log {
        flex-grow: 1;
        overflow-y: auto;
        font-size: 12px;
        border: 1px solid #ddd;
        margin-bottom: 6px;
      }

      #dc-input {
        height: 60px;
      }

      #dc-debug {
        font-size: 10px;
        color: #999;
        margin-top: 5px;
      }

      /* モバイル最適化 */
      .dc-mobile {
        width: 100vw !important;
        height: 100dvh !important;
        top: 0 !important;
        left: 0 !important;
        right: auto !important;
        border-radius: 0 !important;
      }
    `;
    document.head.appendChild(style);

    // モード適用
    if (DEVICE_MODE === "mobile") {
      root.classList.add("dc-mobile");
    } else {
      enableDrag(root);
    }

    document.getElementById("dc-send").onclick = send;

    // 起動ログ
    appendLog(`🟢 DoubleChat ${DC_VERSION} 起動 (${DEVICE_MODE})`);
    saveLog("system", `起動 ${DC_VERSION} ${DEVICE_MODE}`);
  }

  function appendLog(text) {
    const log = document.getElementById("dc-log");
    const line = document.createElement("div");
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  function debugUI(data) {
    if (!DEBUG) return;
    const el = document.getElementById("dc-debug");
    if (el) el.textContent = JSON.stringify(data, null, 1);
  }

  // =========================
  // ■ Gemini
  // =========================
  function callGemini(text, callback) {

    const context = buildContext();

    debugLog("GEMINI_CONTEXT", context);

    const prompt = `
【会話ログ】
${context}

【指示】
${text}

チャッピーの回答を補足して
`;

    GM_xmlhttpRequest({
      method: "POST",
      url: GAS_URL,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ text: prompt }),
      onload: res => {
        const data = JSON.parse(res.responseText);
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "応答なし";
        callback(reply);
      }
    });
  }

  // =========================
  // ■ 送信
  // =========================
  async function send() {
    const input = document.getElementById("dc-input");
    const text = input.value.trim();
    if (!text) return;

    appendLog("YOU: " + text);
    addLog("user", text);
    input.value = "";

    callGemini(text, (reply) => {
      appendLog("Gemini: " + reply);
      saveLog("ジェミー", reply);
    });

    const ta = document.querySelector("main textarea");
    ta.value = text;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("button[data-testid='send-button']")?.click();
  }

  // =========================
  // ■ AI監視（安定検知）
  // =========================
  let lastText = "";
  let stableCount = 0;

  function observeAI() {
    const observer = new MutationObserver(() => {

      const msgs = document.querySelectorAll("[data-message-author-role='assistant']");
      if (!msgs.length) return;

      const text = msgs[msgs.length - 1].textContent.trim();
      if (!text) return;

      appendLog("AI: " + text);

      if (text === lastText) {
        stableCount++;
      } else {
        stableCount = 0;
        lastText = text;
      }

      debugUI({ stableCount, length: text.length });

      if (stableCount > 5) {
        saveLog("チャッピー", text);
      }

    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // =========================
  // ■ 軽量ドラッグ（PCのみ）
  // =========================
  function enableDrag(box) {
    const header = document.getElementById("dc-header");

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    let posX = 0, posY = 0;
    let targetX = 0, targetY = 0;

    header.addEventListener("mousedown", (e) => {
      dragging = true;
      offsetX = e.clientX - targetX;
      offsetY = e.clientY - targetY;
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      targetX = e.clientX - offsetX;
      targetY = e.clientY - offsetY;
    });

    document.addEventListener("mouseup", () => dragging = false);

    function loop() {
      posX += (targetX - posX) * 0.3;
      posY += (targetY - posY) * 0.3;
      box.style.transform = `translate(${posX}px, ${posY}px)`;
      requestAnimationFrame(loop);
    }
    loop();
  }

  // =========================
  // ■ 起動
  // =========================
  function init() {
    createUI();
    observeAI();
  }

  setTimeout(init, 1500);

})();
