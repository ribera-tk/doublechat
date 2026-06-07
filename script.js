// ==UserScript==
// @name         DoubleChat Full OC v1.0
// @match        https://chatgpt.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const DC_VERSION = "FULL-1.0";

  let uiState = "full"; // full / mini / hidden
  let currentMode = "normal";

  const MODES = {
    normal: "通常",
    present: "プレゼン",
    debate: "討論"
  };

  function createUI() {
    if (document.getElementById("dc-root")) return;

    const root = document.createElement("div");
    root.id = "dc-root";

    root.innerHTML = `
      <div id="dc-header">
        DoubleChat v${DC_VERSION}
        <div id="dc-controls">
          <span id="dc-mode">通常</span>
          <span id="dc-toggle">⇔</span>
          <span id="dc-hide">－</span>
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
      #dc-root {
        position: fixed;
        z-index: 9999;
        background: #fff;
        color: #111;
        font-family: Arial;
        display: flex;
        flex-direction: column;
        border: 1px solid #ccc;
        transition: all 0.2s ease;
      }

      #dc-header {
        padding: 10px;
        display: flex;
        justify-content: space-between;
        font-weight: bold;
        background: #f5f5f5;
      }

      #dc-controls {
        display: flex;
        gap: 10px;
      }

      #dc-controls span {
        cursor: pointer;
      }

      #dc-mode {
        background: #0a84ff;
        color: #fff;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
      }

      #dc-body {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      #dc-log {
        flex: 1;
        overflow-y: auto;
        padding: 6px;
        border-bottom: 1px solid #ddd;
      }

      #dc-input {
        height: 100px;
        flex-shrink: 0;
      }

      #dc-send {
        flex-shrink: 0;
        padding: 10px;
      }

      /* フル */
      .full {
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
      }

      /* 小窓 */
      .mini {
        top: 70px;
        right: 10px;
        width: 320px;
        height: 400px;
      }

      /* 非表示 */
      .hidden {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    bindEvents();
    applyState();
    log("🟢 起動 " + DC_VERSION);
  }

  function applyState() {
    const root = document.getElementById("dc-root");

    root.classList.remove("full", "mini", "hidden");

    if (uiState === "full") root.classList.add("full");
    if (uiState === "mini") root.classList.add("mini");
    if (uiState === "hidden") root.classList.add("hidden");
  }

  function bindEvents() {

    // 送信（仮）
    document.getElementById("dc-send").onclick = () => {
      const input = document.getElementById("dc-input");
      if (!input.value.trim()) return;
      log("YOU: " + input.value);
      log("AI: ダミー応答");
      input.value = "";
    };

    // モード
    document.getElementById("dc-mode").onclick = () => {
      if (currentMode === "normal") currentMode = "present";
      else if (currentMode === "present") currentMode = "debate";
      else currentMode = "normal";

      document.getElementById("dc-mode").textContent = MODES[currentMode];
      log("🟢 モード: " + MODES[currentMode]);
    };

    // フル ⇔ 小窓
    document.getElementById("dc-toggle").onclick = () => {
      uiState = (uiState === "full") ? "mini" : "full";
      applyState();
    };

    // 最小化
    document.getElementById("dc-hide").onclick = () => {
      uiState = "hidden";
      applyState();

      // 画面左下に復帰ボタン
      createRestoreButton();
    };
  }

  function createRestoreButton() {
    if (document.getElementById("dc-restore")) return;

    const btn = document.createElement("div");
    btn.id = "dc-restore";
    btn.textContent = "DC";
    btn.style.position = "fixed";
    btn.style.bottom = "20px";
    btn.style.left = "20px";
    btn.style.background = "#0a84ff";
    btn.style.color = "#fff";
    btn.style.padding = "10px";
    btn.style.borderRadius = "50%";
    btn.style.cursor = "pointer";
    btn.style.zIndex = 9999;

    btn.onclick = () => {
      uiState = "full";
      applyState();
      btn.remove();
    };

    document.body.appendChild(btn);
  }

  function log(text) {
    const log = document.getElementById("dc-log");
    const line = document.createElement("div");
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  setTimeout(createUI, 1000);

})();
