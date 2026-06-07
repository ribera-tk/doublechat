// ==UserScript==
// @name         DoubleChat Core v1.0
// @match        https://chatgpt.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  const DC_VERSION = "CORE-1.0";
  const LOG_LIMIT = 120;

  let queue = [];
  let isProcessing = false;
  let lastHash = "";
  let currentUserQuery = "";

  const GAS_URL = "https://script.google.com/macros/s/AKfycbz5KpGu5WMGrpsuHcfNFX5ygcnL0yfsOIBEEETvTZ8cBzZ842GG-HIEvx9XEwCM4j56ew/exec";

  // =========================
  // 🧠 キュー制御
  // =========================
  async function enqueue(task) {
    queue.push(task);
    if (!isProcessing) processQueue();
  }

  async function processQueue() {
    isProcessing = true;
    while (queue.length) {
      const task = queue.shift();
      try { await task(); } catch (e) {}
    }
    isProcessing = false;
  }

  // =========================
  // 🎨 UI
  // =========================
  function createUI() {
    if (document.getElementById("dc-root")) return;

    const root = document.createElement("div");
    root.id = "dc-root";
    root.innerHTML = `
      <div id="dc-header">DoubleChat ${DC_VERSION}</div>
      <div id="dc-body">
        <div id="dc-log"></div>
        <textarea id="dc-input"></textarea>
        <button id="dc-send">➤</button>
      </div>
    `;
    document.body.appendChild(root);

    const style = document.createElement("style");
    style.innerHTML = `
      #dc-root { position: fixed; right:10px; top:70px; width:320px; background:#fff; z-index:9999; border:1px solid #ccc; border-radius:10px; }
      #dc-header { padding:8px; font-weight:bold; border-bottom:1px solid #ccc; }
      #dc-log { height:200px; overflow:auto; padding:5px; font-size:12px; }
      #dc-input { width:100%; height:60px; }
      #dc-send { width:100%; }
    `;
    document.head.appendChild(style);

    document.getElementById("dc-send").onclick = send;
  }

  // =========================
  // 📝 ログ制御
  // =========================
  function enforceLogLimit(logArea) {
    while (logArea.children.length > LOG_LIMIT) {
      logArea.removeChild(logArea.children[0]);
    }
  }

  function log(sender, text) {
    const logArea = document.getElementById("dc-log");
    if (!logArea) return;

    const line = document.createElement("div");
    line.textContent = `[${sender}] ${text}`;

    logArea.appendChild(line);
    enforceLogLimit(logArea);

    logArea.scrollTop = logArea.scrollHeight;
  }

  // =========================
  // 📤 送信（GPT）
  // =========================
  async function send() {
    const input = document.getElementById("dc-input");
    const text = input.value.trim();
    if (!text) return;

    log("YOU", text);
    currentUserQuery = text;
    input.value = "";

    const target = document.querySelector("main textarea");
    if (!target) return;

    target.value = text;
    target.dispatchEvent(new Event("input", { bubbles: true }));

    await new Promise(r => setTimeout(r, 100));

    const btn = document.querySelector("button[data-testid='send-button']");
    if (btn) btn.click();
  }

  // =========================
  // 🤖 Gemini
  // =========================
  function callGemini(text, gptText, callback) {
    GM_xmlhttpRequest({
      method: "POST",
      url: GAS_URL,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        text: `指示:${text}\nGPT:${gptText}\n補足のみ簡潔に`
      }),
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

  // =========================
  // 👀 GPT監視（コア）
  // =========================
  function observeAI() {
    const observer = new MutationObserver(() => {

      const isGenerating = document.querySelector("button[data-testid*='stop-button']");
      if (isGenerating) return;

      const messages = document.querySelectorAll("[data-message-author-role='assistant']");
      if (!messages.length) return;

      const last = messages[messages.length - 1];
      const text = last.textContent?.trim();
      if (!text || text.length < 10) return;

      const hash = text;
      if (hash === lastHash) return;
      lastHash = hash;

      log("GPT", text);

      if (currentUserQuery) {
        const query = currentUserQuery;
        currentUserQuery = "";

        enqueue(() => new Promise(resolve => {
          callGemini(query, text, (reply) => {
            log("Gemini", reply);
            resolve();
          });
        }));
      }

    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // =========================
  // 🚀 起動
  // =========================
  function init() {
    createUI();
    observeAI();
    log("SYS", "起動完了");
  }

  setTimeout(init, 1500);

})();
