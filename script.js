// ==UserScript==
// @name         DoubleChat v14.3.1 (UI Refined / Fix)
// @match        https://chatgpt.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  let isSending = false;
  let aiSaveTimer = null;
  let aiObserveTimer = null;

  let conversationLog = []; 
  let queue = [];
  let isProcessing = false;
  let lastHash = "";
  let currentUserQuery = ""; 

  const GAS_URL = "https://script.google.com/macros/s/AKfycbz5KpGu5WMGrpsuHcfNFX5ygcnL0yfsOIBEEETvTZ8cBzZ842GG-HIEvx9XEwCM4j56ew/exec";

  // 🎵 サウンドシステム (遅延初期化でクラッシュ防止)
  let audioCtx = null;
  function playSound(role) {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      if (role === 'user') { osc.type = 'sine'; osc.frequency.value = 1567; }
      else if (role === 'chatgpt') { osc.type = 'square'; osc.frequency.value = 850; }
      else { osc.type = 'triangle'; osc.frequency.value = 1050; }
      
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.log("Audio play failed:", e);
    }
  }

  // ⏱ スロットリング関数 (ドラッグもっさり解消用)
  const throttle = (func, limit) => {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  };

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

  // 📐 猫耳位置の計算
  function getEarRatio(len) {
    if (len <= 2) return 0;
    if (len === 3) return 0.16;
    if (len <= 6) return 0.26;
    if (len <= 12) return 0.36;
    return 0.40;
  }

  function createUI() {
    if (document.getElementById("dc-root")) return;
    const root = document.createElement("div");
    root.id = "dc-root";
    root.innerHTML = `
      <div id="dc-header">
        DoubleChat v14.3.1
        <div id="dc-controls">
          <span id="dc-min">-</span>
        </div>
      </div>
      <div id="dc-body">
        <div id="dc-log"></div>
        <textarea id="dc-input" placeholder="入力..."></textarea>
        <button id="dc-send">送信</button>
      </div>
      <div id="dc-matagi-btn" title="フルスクリーン切替"></div>
    `;
    document.body.appendChild(root);

    // style.innerHTML ではなく style.textContent を使用（CSP対策）
    const style = document.createElement("style");
    style.textContent = `
      #dc-root { position: fixed; top: 70px; right: 10px; width: 320px; z-index: 9999; background: rgba(255,255,255,0.95); border: 1px solid rgba(0,0,0,0.2); border-radius: 10px; font-family: Arial; color: #111; transition: width 0.2s, height 0.2s; }
      #dc-header { padding: 10px; display: flex; justify-content: space-between; cursor: move; font-weight: bold; user-select: none; border-bottom: 1px solid #ccc; }
      #dc-controls { display: flex; gap: 15px; }
      #dc-min { cursor: pointer; font-weight: bold; }
      #dc-body { padding: 10px; display: flex; flex-direction: column; }
      #dc-log { display: flex; flex-direction: column; height: 180px; overflow-y: auto; background: rgba(255,255,255,0.8); border: 1px solid #ddd; border-radius: 6px; padding: 6px; margin-bottom: 6px; font-size: 12px; }
      #dc-input { width: 100%; height: 60px; margin-bottom: 6px; box-sizing: border-box; resize: vertical; }
      #dc-send { width: 100%; padding: 8px; cursor: pointer; }
      
      /* 猫バブル共通 */
      .dc-bubble {
        position: relative; margin-bottom: 8px; padding: 8px 12px; border-radius: 14px;
        display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
        background: #f9f9f9; border: 1px solid #eee; word-break: break-all; color: #333;
      }
      .dc-bubble-user { border-left: 4px solid #0a84ff; border-bottom-right-radius: 2px; }
      .dc-bubble-ai { border-left: 4px solid #2ecc71; border-bottom-left-radius: 2px; }
      .dc-bubble-gemini { border-left: 4px solid #9b59b6; border-bottom-left-radius: 2px; }

      /* マタギボタン（五角形） */
      #dc-matagi-btn {
        position: absolute; bottom: -60px; right: 0; width: 45px; height: 45px;
        clip-path: polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%);
        background: #ff4500; cursor: pointer; transition: transform 0.1s;
      }
      #dc-matagi-btn:active { transform: scale(0.9); }

      /* フルスクリーン (dvhをvhに変更し互換性確保) */
      .dc-fullscreen { width: 100vw !important; height: 100vh !important; top: 0 !important; left: 0 !important; right: 0 !important; border-radius: 0 !important; }
      .dc-fullscreen #dc-body { height: calc(100% - 40px); }
      .dc-fullscreen #dc-log { flex-grow: 1; height: auto !important; font-size: 14px; }
    `;
    document.head.appendChild(style);

    document.getElementById("dc-send").onclick = send;

    const minBtn = document.getElementById("dc-min");
    const body = document.getElementById("dc-body");
    const toggleMin = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (body.style.display === "none") { body.style.display = "flex"; minBtn.textContent = "-"; }
      else { body.style.display = "none"; minBtn.textContent = "+"; }
    };
    minBtn.addEventListener("click", toggleMin);

    const matagiBtn = document.getElementById("dc-matagi-btn");
    matagiBtn.addEventListener("click", () => {
      root.classList.toggle("dc-fullscreen");
    });

    enableDrag();
  }

  function appendBubble(text, roleClass) {
    const log = document.getElementById("dc-log");
    if (!log) return;
    const line = document.createElement("div");
    line.className = "dc-bubble " + roleClass;
    line.textContent = text;
    
    // 猫耳の仮想オフセット設定
    const ratio = getEarRatio(text.length);
    line.style.setProperty('--ear-ratio', ratio);

    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
    return line;
  }

  function saveLog(role, content) {
    conversationLog.push({ role, content }); 
    if (!GAS_URL || typeof GM_xmlhttpRequest === "undefined") return;
    GM_xmlhttpRequest({
      method: "GET",
      url: GAS_URL + "?role=" + encodeURIComponent(role) + "&content=" + encodeURIComponent(content) + "&_=" + Date.now(),
      onload: function(res) { console.log("Log saved:", res.responseText); }
    });
  }

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

    playSound('user');
    appendBubble("YOU: " + text, "dc-bubble-user");
    saveLog("YOU", text);
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

        let lastAiLine = null;
        const divs = log.getElementsByClassName("dc-bubble-ai");
        if (divs.length > 0) {
           lastAiLine = divs[divs.length - 1];
        }

        if (lastAiLine && last.getAttribute("data-dc-observing") === "true") {
          lastAiLine.textContent = "AI: " + text;
        } else {
          last.setAttribute("data-dc-observing", "true");
          appendBubble("AI: " + text, "dc-bubble-ai");
        }

        if (isAtBottom) log.scrollTop = log.scrollHeight;

        clearTimeout(aiSaveTimer);
        aiSaveTimer = setTimeout(() => {
          const currentHash = getHash(text);
          if (currentHash === lastHash) return;
          lastHash = currentHash;

          last.removeAttribute("data-dc-observing");
          playSound('chatgpt');

          enqueue(async () => {
            saveLog("チャッピー", text);
          });

          if (currentUserQuery) {
            const queryToGemini = currentUserQuery;
            currentUserQuery = ""; 
            
            enqueue(async () => {
              await new Promise((resolve) => {
                callGemini(queryToGemini, text, (reply) => {
                  playSound('gemini');
                  appendBubble("Gemini: " + reply, "dc-bubble-gemini");
                  saveLog("ジェミー", reply.slice(0, 500));
                  resolve(); 
                });
              });
            });
          }
        }, 1500);
      }, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function enableDrag() {
    const box = document.getElementById("dc-root");
    const header = document.getElementById("dc-header");
    let dragging = false; let offsetX = 0; let offsetY = 0;
    
    header.addEventListener("mousedown", (e) => {
      if (e.target.id === "dc-min") return;
      dragging = true; offsetX = e.clientX - box.offsetLeft; offsetY = e.clientY - box.offsetTop;
    });
    
    // 💨 スロットリングでドラッグ処理を間引き
    const onMouseMove = throttle((e) => {
      if (!dragging) return;
      box.style.left = (e.clientX - offsetX) + "px"; 
      box.style.top = (e.clientY - offsetY) + "px"; 
      box.style.right = "auto";
    }, 16);
    
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", () => dragging = false);
    
    header.addEventListener("touchstart", (e) => {
      if (e.target.id === "dc-min") return;
      dragging = true; const t = e.touches[0]; offsetX = t.clientX - box.offsetLeft; offsetY = t.clientY - box.offsetTop;
    });
    
    const onTouchMove = throttle((e) => {
      if (!dragging) return; 
      e.preventDefault(); 
      const t = e.touches[0]; 
      box.style.left = (t.clientX - offsetX) + "px"; 
      box.style.top = (t.clientY - offsetY) + "px"; 
      box.style.right = "auto";
    }, 16);
    
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", () => dragging = false);
  }

  function bootstrap() {
    if (!document.body) { setTimeout(bootstrap, 200); return; }
    createUI();
    observeAI();
    const log = document.getElementById("dc-log");
    if (log) log.innerHTML = '<div style="color:#0a84ff; padding: 4px; font-weight: bold;">🟢 DoubleChat v14.3.1 起動完了</div>';
  }

  setTimeout(bootstrap, 1500);
})();
