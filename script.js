// ==UserScript==
// @name         DoubleChat v14.1
// @match        https://chatgpt.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  const GAS_URL = "YOUR_GAS_URL";

  let isSending = false;

  // =========================
  // ■ マギログ構造
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
  // ■ UI
  // =========================
  function createUI() {
    if (document.getElementById("dc-root")) return;

    const root = document.createElement("div");
    root.id = "dc-root";
    root.innerHTML = `
      <div id="dc-header">DoubleChat v14.1</div>
      <div id="dc-body">
        <div id="dc-log"></div>
        <textarea id="dc-input"></textarea>
        <button id="dc-send">送信</button>
      </div>
    `;
    document.body.appendChild(root);

    document.getElementById("dc-send").onclick = send;

    enableDrag(root);
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
  function callGemini(text, callback) {

    const context = buildContext();

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
    if (isSending) return;
    isSending = true;

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

    setTimeout(() => isSending = false, 1000);
  }

  // =========================
  // ■ AI監視（安定版）
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

      if (stableCount > 5) {
        saveLog("チャッピー", text);
      }

    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // =========================
  // ■ 軽量ドラッグ（改善版）
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
