(function () {
  'use strict';

  let isSending = false;
  let lastAIText = "";

  // =========================
  // UI
  // =========================
  function createUI() {
    if (document.getElementById("dc-root")) return;

    const root = document.createElement("div");
    root.id = "dc-root";

    root.innerHTML = `
      <div id="dc-header">
        DoubleChat2
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
}

#dc-body {
  padding: 10px;
}

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

#dc-input {
  width: 100%;
  height: 60px;
  margin-bottom: 6px;
}

#dc-send {
  width: 100%;
  padding: 6px;
}
`;
    document.head.appendChild(style);

    document.getElementById("dc-send").onclick = send;

    enableDrag();
  }

  // =========================
  // ログ
  // =========================
  function appendLog(text) {
    const log = document.getElementById("dc-log");

    const line = document.createElement("div");
    line.textContent = text;

    if (text.startsWith("YOU:")) {
      line.style.color = "#0a84ff";
    } else {
      line.style.color = "#2ecc71";
    }

    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  // =========================
  // 送信
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
        document.querySelector('[contenteditable="true"]') ||
        document.querySelector('textarea');

      if (!target) return;

      target.focus();

      await new Promise(r => setTimeout(r, 100));

      document.execCommand("selectAll");
      document.execCommand("delete");
      document.execCommand("insertText", false, text);

      target.dispatchEvent(new Event("input", { bubbles: true }));

      await new Promise(r => setTimeout(r, 150));

      const btn =
        document.querySelector('button[data-testid="send-button"]') ||
        document.querySelector('button[type="submit"]');

      if (btn) btn.click();

    } finally {
      setTimeout(() => {
        isSending = false;
      }, 1200);
    }
  }

// =========================
// AIログ（リアルタイム上書き版）
// =========================
let lastAIElement = null;
let lastAILogDiv = null;

// =========================
// AIログ（テキスト判定・絶対増殖しない版）
// =========================
// =========================
// AIログ（軽量・フリーズ対策版）
// =========================
let aiObserveTimer = null;

function observeAI() {
  const observer = new MutationObserver(() => {
    // 🌟 大量のイベントを150msに1回に間引いて、ブラウザの爆発を防ぐ
    if (aiObserveTimer) return;

    aiObserveTimer = setTimeout(() => {
      aiObserveTimer = null;

      const messages = document.querySelectorAll('[data-message-author-role="assistant"]');
      if (!messages.length) return;

      const last = messages[messages.length - 1];
      // 🌟 激重の innerText を完全に廃止し、画面再計算の起きない超軽量な textContent に変更
      const text = last.textContent?.trim();
      if (!text) return;
// 空振り防止
if (text.length < 10) return;
      const log = document.getElementById("dc-log");
      if (!log) return;

      const lastLine = log.lastElementChild;

      // テキストの冒頭が一致していれば、同じ会話の続きとみなして上書き
      if (lastLine && lastLine.textContent.startsWith("AI:") && text.startsWith(lastLine.textContent.replace("AI: ", "").slice(0, 10))) {
        lastLine.textContent = "AI: " + text;
      } else {
        // 新しい会話なら行を追加
        const line = document.createElement("div");
        line.textContent = "AI: " + text;
        line.style.color = "#2ecc71";
        log.appendChild(line);
      }
      
      log.scrollTop = log.scrollHeight;
    }, 150); // ⏳ 150ミリ秒の間隔（体感はリアルタイムのまま）
  });

  observer.observe(document.body, { childList: true, subtree: true });
}



  // =========================
  // ドラッグ（Android対応）
  // =========================
  function enableDrag() {
    const box = document.getElementById("dc-root");
    const header = document.getElementById("dc-header");

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    // PC
    header.addEventListener("mousedown", (e) => {
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

    // 🔥 Android Firefox対応
    header.addEventListener("touchstart", (e) => {
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

  // =========================
  // 起動
  // =========================
  setTimeout(() => {
    createUI();
    observeAI();
}, 2000); // ⏳ 1000から2000に増やして、PCでも確実にDOMを掴めるようにします

})();
