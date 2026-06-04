```javascript
// ==UserScript==
// @name         DoubleChat v14.2 Clean
// @match        https://chatgpt.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  const DC_VERSION = "v14.2C";
  const GAS_URL = "YOUR_GAS_URL";

  // =========================
  // ■ 端末判定
  // =========================
  function getDeviceMode() {
    const ua = navigator.userAgent;
    const isMobileUA = /Android|iPhone|iPad/i.test(ua);
    const isTouch = 'ontouchstart' in window;
    const smallScreen = window.innerWidth < 768;
    return (isMobileUA || (isTouch && smallScreen)) ? "mobile" : "desktop";
  }

  const DEVICE_MODE = getDeviceMode();
  const DEBUG = DEVICE_MODE === "desktop";

  function debug(label, data) {
    if (!DEBUG) return;
    console.log("[DC]", label, data);
  }

  // =========================
  // ■ ログ
  // =========================
  const conversationLog = [];

  function addLog(role, content) {
    const log = {
      role,
      content,
      time: Date.now()
    };
    conversationLog.push(log);
    return log;
  }

  function buildContext() {
    return conversationLog.slice(-6)
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
  // ■ UI
  // =========================
  function createUI() {
    if (document.getElementById("dc-root")) return;

    const root = document.createElement("div");
    root.id = "dc-root";

    root.innerHTML = `
      <div id="dc-header">DoubleChat ${DC_VERSION} (${DEVICE_MODE})</div>
      <div id="dc-body">
        <div id="dc-log"></div>
        <textarea id="dc-input"></textarea>
        <button id="dc-send">送信</button>
      </div>
    `;

    document.body.appendChild(root);

    const style = document.createElement("style");
    style.innerHTML = `
      #dc-root {
        position: fixed;
        top: 60px;
        right: 10px;
        width: 320px;
        background: #fff;
        z-index: 9999;
        border-radius: 10px;
      }

      .dc-mobile {
        width: 100vw !important;
        height: 100dvh !important;
        top: 0 !important;
        left: 0 !important;
      }

      #dc-body {
        display: flex;
        flex-direction: column;
        height: 300px;
      }

      #dc-log {
        flex-grow: 1;
        overflow-y: auto;
        font-size: 12px;
      }
    `;
    document.head.appendChild(style);

    if (DEVICE_MODE === "mobile") {
      root.classList.add("dc-mobile");
    } else {
      enableDrag(root);
    }

    document.getElementById("dc-send").onclick = send;

    appendLog("🟢 起動 " + DC_VERSION);
  }

  function appendLog(text) {
    const log = document.getElementById("dc-log");
    const line = document.createElement("div");
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  // =========================
  // ■ Gemini
  // =========================
  function callGemini(userText, callback) {

    const prompt = `
${buildContext()}

指示: ${userText}
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
  function send() {
    const input = document.getElementById("dc-input");
    const userText = input.value.trim();
    if (!userText) return;

    appendLog("YOU: " + userText);
    addLog("user", userText);
    input.value = "";

    callGemini(userText, (reply) => {
      appendLog("Gemini: " + reply);
      saveLog("ジェミー", reply);
    });

    const ta = document.querySelector("main textarea");
    ta.value = userText;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("button[data-testid='send-button']")?.click();
  }

  // =========================
  // ■ AI監視（完全安定版）
  // =========================
  function observeAI() {

    const main = document.querySelector("main");
    if (!main) return;

    let lastAiText = "";
    let stableCount = 0;
    let lastAiLine = null;
    let ticking = false;

    function process() {
      ticking = false;

      const msgs = main.querySelectorAll("[data-message-author-role='assistant']");
      if (!msgs.length) return;

      const latestText = msgs[msgs.length - 1].textContent?.trim();
      if (!latestText) return;

      const log = document.getElementById("dc-log");

      if (lastAiLine) {
        lastAiLine.textContent = "AI: " + latestText;
      } else {
        lastAiLine = document.createElement("div");
        lastAiLine.textContent = "AI: " + latestText;
        lastAiLine.style.color = "#2ecc71";
        log.appendChild(lastAiLine);
      }

      log.scrollTop = log.scrollHeight;

      if (latestText === lastAiText) {
        stableCount++;
      } else {
        stableCount = 0;
        lastAiText = latestText;
      }

      if (stableCount > 5) {
        saveLog("チャッピー", latestText);
        lastAiLine = null;
      }
    }

    const observer = new MutationObserver(() => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(process);
    });

    observer.observe(main, { childList: true, subtree: true });
  }

  // =========================
  // ■ ドラッグ
  // =========================
  function enableDrag(box) {
    const header = box.querySelector("#dc-header");

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener("mousedown", (e) => {
      dragging = true;
      offsetX = e.clientX - box.offsetLeft;
      offsetY = e.clientY - box.offsetTop;
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      box.style.left = (e.clientX - offsetX) + "px";
      box.style.top = (e.clientY - offsetY) + "px";
    });

    document.addEventListener("mouseup", () => dragging = false);
  }

  // =========================
  // ■ 起動
  // =========================
  function init() {
    createUI();
    observeAI();
  }

  setTimeout(init, 1200);

})();
```
