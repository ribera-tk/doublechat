(function () {
  'use strict';

  if (window.DoubleChatUI) return;

  const DC_VERSION = "UI-3.4 (Neko & Booster)";
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  let isFull = false;
  let currentMode = "normal";
  let lastPos = { left: "", top: "" };
  
  // ボリュームブースター用変数
  let audioCtx = null;
  let gainNode = null;
  let audioSource = null;

  const MODES = {
    normal: "通常",
    present: "プレゼン",
    debate: "討論"
  };

  // 外部から操作するためのUI API
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

  // 音声を再生する関数（初期の電子音 or リアル猫の鳴き声シミュレート）
  function playSound(type) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      // ランダムで「初期のポン音」か「リアル猫」を分岐
      const isCat = Math.random() < 0.5;

      if (!isCat) {
        // --- 初期の電子音（ポン） ---
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        // ボリュームブースターのGainがあればそちらに、なければdestinationに接続
        if (gainNode) gain.connect(gainNode); else gain.connect(audioCtx.destination);

        osc.type = "sine";
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
      } else {
        // --- リアル猫の鳴き声（Web Audioシンセサイズ） ---
        const now = audioCtx.currentTime;
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc1.connect(gain);
        osc2.connect(gain);
        if (gainNode) gain.connect(gainNode); else gain.connect(audioCtx.destination);

        // ランダムで鳴き声のパターン（ピッチ）を変える
        const catPattern = Math.floor(Math.random() * 4); 
        let baseFreq = 600; // 通常の「ニャー」
        let duration = 0.4;

        if (catPattern === 1) { baseFreq = 750; duration = 0.25; } // 高めの「ミャッ」
        else if (catPattern === 2) { baseFreq = 450; duration = 0.5; } // 低めの「ナァー」
        else if (catPattern === 3) { baseFreq = 650; duration = 0.35; } // 途中で震える

        osc1.type = "triangle";
        osc2.type = "sawtooth"; // リアルな鳴き声の「かすれ感」を出すためにノコギリ波をブレンド

        osc1.frequency.setValueAtTime(baseFreq, now);
        osc1.frequency.linearRampToValueAtTime(baseFreq * 1.2, now + duration * 0.2);
        osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, now + duration);

        osc2.frequency.setValueAtTime(baseFreq * 1.01, now);
        osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.79, now + duration);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + duration);
        osc2.stop(now + duration);
      }
    } catch (e) {
      console.warn("Sound play failed:", e);
    }
  }

  // ボリュームブースターの初期化
  function initVolumeBooster() {
    try {
      const mediaElements = document.querySelectorAll("audio, video");
      if (mediaElements.length === 0) return;

      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (!gainNode) {
        gainNode = audioCtx.createGain();
        gainNode.connect(audioCtx.destination);
      }

      mediaElements.forEach(element => {
        // 既に接続済みでなければ接続
        try {
          const source = audioCtx.createMediaElementSource(element);
          source.connect(gainNode);
        } catch(e) {}
      });
    } catch(e) {
      console.warn("Volume Booster init failed:", e);
    }
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
        <div id="dc-booster-panel">
          <label for="dc-booster-range">🔊 Booster:</label>
          <input type="range" id="dc-booster-range" min="1" max="3" step="0.1" value="1">
          <span id="dc-booster-val">100%</span>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    const style = document.createElement("style");
    style.innerHTML = `
      #dc-root, #dc-root * { box-sizing: border-box !important; }
      #dc-root { position: fixed; top: 70px; right: 10px; width: 320px; z-index: 9999; background: rgba(255,255,255,0.95); border: 1px solid rgba(0,0,0,0.2); border-radius: 10px; font-family: Arial, sans-serif; color: #111; transition: left 0.2s ease, top 0.2s ease, width 0.2s ease, height 0.2s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
      
      /* 猫耳デザイン：左右の間隔を2mm(約8px)狭めて中央寄りに補正 */
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
      
      /* 短文でも崩れない猫耳・猫尻尾（下はね）の吹き出し */
      .dc-msg-bubble { position: relative; padding: 8px 14px; border-radius: 12px !important; line-height: 1.4; word-break: break-all; box-shadow: 0 1px 2px rgba(0,0,0,0.1); z-index: 1; margin-top: 4px; min-width: 40px; }
      
      /* 吹き出しの猫尻尾（下はね形状へクリップパスを変更） */
      .dc-msg-bubble::after { content: ""; position: absolute; bottom: -2px; width: 10px; height: 10px; z-index: -1; }
      .dc-msg-wrapper.you .dc-msg-bubble::after { right: 6px; background: #a9e3a3; clip-path: polygon(0 0, 100% 0, 100% 100%, 30% 60%); }
      .dc-msg-wrapper.gpt .dc-msg-bubble::after { left: 6px; background: #10a37f; clip-path: polygon(0 0, 100% 0, 70% 60%, 0 100%); }
      .dc-msg-wrapper.gemini .dc-msg-bubble::after { left: 6px; background: #1a73e8; clip-path: polygon(0 0, 100% 0, 70% 60%, 0 100%); }
      
      .dc-msg-you { background: #a9e3a3; color: #111; }
      .dc-msg-gpt { background: #10a37f; color: #fff; }
      .dc-msg-gemini { background: #1a73e8; color: #fff; }
      
      .dc-is-pc #dc-input { width: 100% !important; height: 38px; min-height: 38px; max-height: 150px; padding: 9px 50px 9px 10px !important; resize: none; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; overflow-y: auto; line-height: 1.4; }
      .dc-is-pc #dc-send { position: absolute !important; right: 16px; bottom: 38px; width: 36px; height: 28px; background: #0a84ff; color: white; border: none; border-radius: 4px; cursor: pointer; z-index: 99; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: background 0.1s; }
      .dc-is-mobile #dc-input { width: 100% !important; height: 38px; min-height: 38px; max-height: 120px; padding: 9px 10px !important; resize: none; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; overflow-y: auto; line-height: 1.4; }
      .dc-is-mobile #dc-send { display: none !important; }
      
      /* ブースターUIのスタイル */
      #dc-booster-panel { display: flex; align-items: center; gap: 6px; font-size: 11px; margin-top: 4px; color: #55px; border-top: 1px solid #eee; padding-top: 4px; }
      #dc-booster-range { flex-grow: 1; height: 12px; cursor: pointer; }
      #dc-booster-val { font-weight: bold; width: 35px; text-align: right; }

      .dc-fullscreen { width: 100vw !important; height: 100dvh !important; top: 0 !important; left: 0 !important; border-radius: 0 !important; overflow: hidden !important; }
      .dc-fullscreen #dc-body { height: calc(100dvh - 45px) !important; }
      .dc-fullscreen #dc-log { flex-grow: 1; height: auto !important; font-size: 14px; }
      .dc-fullscreen #dc-input { max-height: 260px !important; font-size: 14px; }
      .dc-is-mobile.dc-fullscreen #dc-input { padding-right: 55px !important; }
      .dc-is-mobile.dc-fullscreen #dc-send { display: flex !important; position: absolute !important; right: 15px; bottom: calc(env(safe-area-inset-bottom, 0px) + 24px) !important; width: 48px; height: 85px; background: #0a84ff; color: white; border: none; cursor: pointer; z-index: 99; clip-path: polygon(50% 0%, 100% 18%, 100% 100%, 0% 100%, 0% 18%); align-items: flex-start; justify-content: center; padding-top: 24px; font-size: 18px; font-weight: bold; transition: background 0.1s; }
      .dc-is-pc.dc-fullscreen #dc-send { bottom: 38px !important; }
      
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
    
    // ブースター関連UI要素
    const boosterRange = document.getElementById("dc-booster-range");
    const boosterVal = document.getElementById("dc-booster-val");

    function adjustInputHeight() {
      input.style.height = "auto";
      input.style.height = (input.scrollHeight + 2) + "px";
    }

    input.addEventListener("input", adjustInputHeight);

    // 送信イベント発火 (Core側へ通知)
    function executeSend() {
      const text = input.value.trim();
      if (!text || input.disabled) return;
      
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

    // ボリュームブースタースライダーイベント
    boosterRange.addEventListener("input", (e) => {
      const vol = parseFloat(e.target.value);
      boosterVal.textContent = Math.round(vol * 100) + "%";
      
      if (!audioCtx) initVolumeBooster();
      if (gainNode) {
        gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
      }
    });
    
    // ページ上の要素変更時に随時音声エレメントをブースターにフックする
    document.addEventListener("play", () => {
      if (!audioCtx) initVolumeBooster();
    }, true);

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

    // 音声再生イベントのキャッチ
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
      if (isFull || target.closest("#dc-controls") || target.closest("#dc-mode") || target.closest("#dc-booster-panel")) return false; 
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
})();
