(function () {
  'use strict';

  if (window.DoubleChatUI) return;

  const DC_VERSION = "UI-3.6";
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  let isFull = false;
  let currentMode = "normal";
  let lastPos = { left: "", top: "" };

  const MODES = {
    normal: "通常",
    present: "プレゼン",
    debate: "討論"
  };

  window.DoubleChatUI = {
    init: function() {
      createUI();
    },
    appendLog: function(sender, text) {
      return log(sender, text);
    },
    setLock: function(isLocked) {
      const input = document.getElementById("dc-input");
      const sendBtn = document.getElementById("dc-send");
      if (input && sendBtn) {
        input.disabled = isLocked;
        sendBtn.disabled = isLocked;
        input.placeholder = isLocked ? "AIが思考中..." : "入力...";
        if (!isLocked) input.focus();
      }
    }
  };
window.DoubleChatUI.init(); // ←ここ！！
  // 🔊 新・3人用クリーン電子音（にゃ〜ん排除、初期ポン音の系譜）
  function playSound(type) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'send') {
        // 🧑 YOU: キレのある高めの「ピピッ」
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1567.98, now); // ソ
        osc.frequency.setValueAtTime(2349.32, now + 0.04); // レ
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(); osc.stop(now + 0.1);
      }
      else if (type === 'reply_gpt') {
        // 🤖 ChatGPT: 落ち着いた中音の「ポポン」
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880.00, now); // ラ
        osc.frequency.setValueAtTime(1174.66, now + 0.05); // レ
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(); osc.stop(now + 0.15);
      }
      else if (type === 'reply_gemini') {
        // 💎 Gemini: 未来感のある3連音「ピロラン」
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046.50, now); // ド
        osc.frequency.setValueAtTime(1318.51, now + 0.04); // ミ
        osc.frequency.setValueAtTime(1567.98, now + 0.08); // ソ
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(); osc.stop(now + 0.18);
      }
    } catch (e) { console.warn(e); }
  }

  function createUI() {
    if (document.getElementById("dc-root")) return;

    const root = document.createElement("div");
    root.id = "dc-root";
    root.classList.add(isMobile ? "dc-is-mobile" : "dc-is-pc");

    root.innerHTML = `
      <div id="dc-header">
        <div id="dc-title-area">
          DoubleChat v${DC_VERSION}
          <span id="dc-mode">通常</span>
        </div>
        <div id="dc-controls">
          <span id="dc-full">⬜</span>
          <span id="dc-min">ー</span>
        </div>
      </div>
      <div id="dc-body">
        <div id="dc-log"></div>
        <textarea id="dc-input" placeholder="入力..." rows="1"></textarea>
        <button id="dc-send">➤</button>
      </div>
    `;

    document.body.appendChild(root);

    const style = document.createElement("style");
    style.innerHTML = `
      #dc-root, #dc-root * { box-sizing: border-box !important; }
      #dc-root { position: fixed; top: 70px; right: 10px; width: 320px; z-index: 9999; background: rgba(255,255,255,0.95); border: 1px solid rgba(0,0,0,0.2); border-radius: 10px; font-family: Arial, sans-serif; color: #111; transition: left 0.2s ease, top 0.2s ease, width 0.2s ease, height 0.2s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
      
      /* 本体枠の猫耳：中央寄りに固定 */
      #dc-root::before, #dc-root::after { content: ""; position: absolute; top: -10px; width: 0; height: 0; border-bottom: 12px solid rgba(255,255,255,0.95); z-index: 9998; }
      #dc-root::before { left: 32px; border-left: 8px solid transparent; border-right: 8px solid transparent; }
      #dc-root::after { right: 32px; border-left: 8px solid transparent; border-right: 8px solid transparent; }

      #dc-header { height: 40px; padding: 0 10px; display: flex; justify-content: space-between; align-items: center; cursor: move; font-weight: bold; border-bottom: 1px solid #ccc; user-select: none; }
      #dc-title-area { display: flex; align-items: center; gap: 8px; font-size: 14px; }
      #dc-controls { display: flex; gap: 12px; align-items: center; }
      #dc-controls span { cursor: pointer; padding: 2px 4px; user-select: none; font-weight: bold; font-size: 14px; }
      #dc-mode { cursor: pointer; background: #0a84ff; color: #fff; border-radius: 4px; font-size: 11px; padding: 2px 6px; font-weight: normal; user-select: none; }
      #dc-body { position: relative; padding: 10px; display: flex; flex-direction: column; }
      #dc-log { height: 180px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 6px; padding: 8px; font-size: 12px; background: #f4f5f7; display: flex; flex-direction: column; gap: 16px; }
      
      .dc-msg-wrapper { display: flex; max-width: 85%; }
      .dc-msg-wrapper.you { align-self: flex-end; flex-direction: column; align-items: flex-end; }
      .dc-msg-wrapper.gpt, .dc-msg-wrapper.gemini { align-self: flex-start; flex-direction: row !important; align-items: flex-start; gap: 8px; }
      .dc-avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; color: #fff; flex-shrink: 0; margin-top: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); user-select: none; }
      .dc-avatar-gpt { background: #10a37f; }
      .dc-avatar-gemini { background: #1a73e8; }
      
      .dc-msg-box { display: flex; flex-direction: column; }
      .dc-msg-name { font-size: 9px; color: #666; margin-bottom: 2px; font-weight: bold; }
      .dc-msg-row { display: flex; align-items: flex-end; gap: 5px; }
      .you .dc-msg-row { flex-direction: row-reverse; }
      .dc-msg-time { font-size: 9px; color: #999; user-select: none; white-space: nowrap; margin-bottom: 2px; }
      
      /* 短文（1〜2文字）でも絶対に猫の形が潰れない最小幅の確保 */
      .dc-msg-bubble { position: relative; padding: 8px 14px; border-radius: 16px !important; line-height: 1.4; word-break: break-all; box-shadow: 0 1px 2px rgba(0,0,0,0.1); z-index: 1; margin-top: 12px; min-width: 52px; }
      .dc-msg-bubble::before { content: ""; position: absolute; top: -7px; width: 32px; height: 8px; z-index: -1; clip-path: polygon(0% 100%, 20% 0%, 40% 100%, 60% 100%, 80% 0%, 100% 100%); }
      .dc-msg-bubble::after { content: ""; position: absolute; bottom: 2px; width: 8px; height: 12px; z-index: -1; }
      
      .dc-msg-you { background: #a9e3a3; color: #111; }
      /* 🐱 ユーザー側の耳を左に3mm(約12px)スライド：leftを12pxから0pxに変更して潰れを完全防止 */
      .dc-msg-wrapper.you .dc-msg-bubble::before { left: 0px; background: #a9e3a3; }
      /* 🐱 尻尾のハネ内外（細い太い）を修正：外側に向かってピッと細く跳ねるように角度を反転 */
      .dc-msg-wrapper.you .dc-msg-bubble::after { right: -4px; background: #a9e3a3; border-radius: 5px 0 0 5px; transform: rotate(35deg); }
      
      .dc-msg-gpt { background: #10a37f; color: #fff; }
      .dc-msg-wrapper.gpt .dc-msg-bubble::before { right: 12px; background: #10a37f; }
      /* 🐱 AI側の尻尾も外側に向かって細く跳ねるように角度・曲がり方向を修正 */
      .dc-msg-wrapper.gpt .dc-msg-bubble::after { left: -4px; background: #10a37f; border-radius: 0 5px 5px 0; transform: rotate(-35deg); }
      
      .dc-msg-gemini { background: #1a73e8; color: #fff; }
      .dc-msg-wrapper.gemini .dc-msg-bubble::before { right: 12px; background: #1a73e8; }
      .dc-msg-wrapper.gemini .dc-msg-bubble::after { left: -4px; background: #1a73e8; border-radius: 0 5px 5px 0; transform: rotate(-35deg); }
      
      .dc-is-pc #dc-input { width: 100% !important; height: 38px; min-height: 38px; max-height: 150px; padding: 9px 50px 9px 10px !important; resize: none; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; overflow-y: auto; line-height: 1.4; }
      .dc-is-pc #dc-send { position: absolute !important; right: 16px; bottom: 15px; width: 36px; height: 28px; background: #0a84ff; color: white; border: none; border-radius: 4px; cursor: pointer; z-index: 99; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: background 0.1s; }
      .dc-is-mobile #dc-input { width: 100% !important; height: 38px; min-height: 38px; max-height: 120px; padding: 9px 10px !important; resize: none; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; overflow-y: auto; line-height: 1.4; }
      .dc-is-mobile #dc-send { display: none !important; }
      
      .dc-fullscreen { width: 100vw !important; height: 100dvh !important; top: 0 !important; left: 0 !important; border-radius: 0 !important; overflow: hidden !important; }
      .dc-fullscreen #dc-body { height: calc(100dvh - 45px) !important; }
      .dc-fullscreen #dc-log { flex-grow: 1; height: auto !important; font-size: 14px; }
      .dc-fullscreen #dc-input { max-height: 260px !important; font-size: 14px; }
      .dc-is-mobile.dc-fullscreen #dc-input { padding-right: 55px !important; }
      .dc-is-mobile.dc-fullscreen #dc-send { display: flex !important; position: absolute !important; right: 15px; bottom: calc(env(safe-area-inset-bottom, 0px) + 2px) !important; width: 48px; height: 85px; background: #0a84ff; color: white; border: none; cursor: pointer; z-index: 99; clip-path: polygon(50% 0%, 100% 18%, 100% 100%, 0% 100%, 0% 18%); align-items: flex-start; justify-content: center; padding-top: 24px; font-size: 18px; font-weight: bold; transition: background 0.1s; }
      .dc-is-pc.dc-fullscreen #dc-send { bottom: 15px !important; }
      
      .dc-thinking { opacity: 0.6; font-style: italic; animation: dc-blink 1.4s infinite both; }
      @keyframes dc-blink { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
    `;
    document.head.appendChild(style);

    bindEvents();
    enableDrag();
  }

  function bindEvents() {
    const root = document.getElementById("dc-root");
    const body = document.getElementById("dc-body");
    const fullBtn = document.getElementById("dc-full");
    const input = document.getElementById("dc-input");
    const sendBtn = document.getElementById("dc-send");

    function adjustInputHeight() {
      input.style.height = "auto";
      input.style.height = (input.scrollHeight + 2) + "px";
    }

    input.addEventListener("input", adjustInputHeight);

    function executeSend() {
      const text = input.value.trim();
      if (!text || input.disabled) return;
      
      playSound('send');

      document.dispatchEvent(new CustomEvent('dc-request-send', { 
        detail: { text: text }
      }));
      
      input.value = "";
      adjustInputHeight();
    }

    sendBtn.onclick = () => { executeSend(); };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        if (!isMobile || !isFull) {
          e.preventDefault();
          executeSend();
        }
      }
    });

    document.getElementById("dc-mode").onclick = (e) => {
      e.stopPropagation();
      if (currentMode === "normal") currentMode = "present";
      else if (currentMode === "present") currentMode = "debate";
      else currentMode = "normal";
      document.getElementById("dc-mode").textContent = MODES[currentMode];
    };

    document.getElementById("dc-min").onclick = () => {
      if (isFull) {
        isFull = false; root.classList.remove("dc-fullscreen"); fullBtn.textContent = "⬜"; root.style.left = lastPos.left; root.style.top = lastPos.top;
      }
      body.style.display = body.style.display === "none" ? "flex" : "none";
    };

    fullBtn.onclick = () => {
      if (body.style.display === "none") body.style.display = "flex";
      isFull = !isFull;
      root.classList.toggle("dc-fullscreen");
      if (isFull) {
        fullBtn.textContent = "🗗"; lastPos.left = root.style.left; lastPos.top = root.style.top; root.style.left = "0px"; root.style.top = "0px";
      } else {
        fullBtn.textContent = "⬜"; root.style.left = lastPos.left; root.style.top = lastPos.top;
      }
      adjustInputHeight();
    };
  }

  function setupCoreListeners() {
    console.log("👂 UIリスナー登録");

    document.addEventListener("dc-append-log", (e) => {
      console.log("📥 UI受信:", e.detail);
      if (!e.detail?.sender || !e.detail?.text) return;
      log(e.detail.sender, e.detail.text);
    });

    document.addEventListener("dc-play-sound", (e) => {
      console.log("🎵 音声イベント受信:", e.detail);
      playSound(e.detail?.type);
    });
  }

  function log(sender, text) {
    const logArea = document.getElementById("dc-log");
    if (!logArea) return null;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const wrapper = document.createElement("div");
    wrapper.className = `dc-msg-wrapper ${sender}`;

    if (sender !== "you") {
      const avatar = document.createElement("div"); 
      avatar.className = `dc-avatar dc-avatar-${sender}`; 
      avatar.textContent = sender === "gpt" ? "C" : "G"; 
      wrapper.appendChild(avatar);
    }

    const msgBox = document.createElement("div"); 
    msgBox.className = "dc-msg-box";
    
    const nameLabel = document.createElement("div"); 
    nameLabel.className = "dc-msg-name"; 
    nameLabel.textContent = sender === "you" ? "YOU" : sender === "gpt" ? "ChatGPT" : "Gemini";
    
    const row = document.createElement("div"); 
    row.className = "dc-msg-row";

    const bubble = document.createElement("div");
    bubble.className = `dc-msg-bubble dc-msg-${sender}`;
    bubble.textContent = text;

    const timeLabel = document.createElement("div"); 
    timeLabel.className = "dc-msg-time"; 
    timeLabel.textContent = timeStr;

    row.appendChild(bubble); 
    row.appendChild(timeLabel); 
    msgBox.appendChild(nameLabel); 
    msgBox.appendChild(row); 
    wrapper.appendChild(msgBox);
    
    logArea.appendChild(wrapper);
    logArea.scrollTop = logArea.scrollHeight;

    return bubble;
  }

  function enableDrag() {
    const box = document.getElementById("dc-root"); 
    const header = document.getElementById("dc-header");
    let dragging = false, offsetX = 0, offsetY = 0;
    
    const startDrag = (clientX, clientY, target) => {
      if (isFull || target.closest("#dc-controls") || target.closest("#dc-mode")) return false; 
      dragging = true; box.style.transition = "none";
      const currentLeft = box.offsetLeft, currentTop = box.offsetTop;
      box.style.left = currentLeft + "px"; box.style.top = currentTop + "px"; box.style.right = "auto"; 
      offsetX = clientX - currentLeft; offsetY = clientY - currentTop; 
      return true;
    };
    const moveDrag = (clientX, clientY) => { 
      if (dragging) { box.style.left = (clientX - offsetX) + "px"; box.style.top = (clientY - offsetY) + "px"; } 
    };
    const endDrag = () => { 
      if (dragging) { dragging = false; box.style.transition = "left 0.2s ease, top 0.2s ease, width 0.2s ease, height 0.2s ease"; } 
    };
    
    header.addEventListener("mousedown", (e) => startDrag(e.clientX, e.clientY, e.target)); 
    document.addEventListener("mousemove", (e) => moveDrag(e.clientX, e.clientY)); 
    document.addEventListener("mouseup", endDrag);
    
    header.addEventListener("touchstart", (e) => { const t = e.touches[0]; if (startDrag(t.clientX, t.clientY, e.target)) { if (e.cancelable) e.preventDefault(); } }, { passive: false });
    document.addEventListener("touchmove", (e) => { if (dragging) { const t = e.touches[0]; moveDrag(t.clientX, t.clientY); if (e.cancelable) e.preventDefault(); } }, { passive: false }); 
    document.addEventListener("touchend", endDrag);
  }

  setupCoreListeners();
})();;
