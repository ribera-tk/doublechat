(function () {
  'use strict';

  if (window.DoubleChatUI) return;

  const DC_VERSION = 'UI-4.1';
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  let isFull = false;
  let currentMode = 'normal';
  let lastPos = { left: '', top: '' };

  const MODES = {
    normal: '\u901a\u5e38',
    present: '\u30d7\u30ec\u30bc\u30f3',
    debate: '\u8a0e\u8ad6'
  };

  window.DoubleChatUI = {
    init: function () {
      createUI();
    },
    appendLog: function (sender, text) {
      return log(sender, text);
    },
    applyEarPosition: function (sender, bubble, text) {
      return applyEarPosition(sender, bubble, text);
    },
    playOutputSound: function (sender, text) {
      return playOutputSound(sender, text);
    },
    pulseEar: function (sender, bubble) {
      return pulseEar(sender, bubble);
    },
    updateTokenCounter: function (detail) {
      return updateTokenCounter(detail);
    },
    setLock: function (isLocked) {
      const input = document.getElementById('dc-input');
      const sendBtn = document.getElementById('dc-send');
      if (input && sendBtn) {
        input.disabled = isLocked;
        sendBtn.disabled = isLocked;
        input.placeholder = isLocked ? 'AI\u304c\u601d\u8003\u4e2d...' : '\u5165\u529b...';
        if (!isLocked) input.focus();
      }
    }
  };

  function getSoundProfile(type, sender) {
    const key = sender || (type === 'send' ? 'you' : type === 'reply_gemini' ? 'gemini' : 'gpt');

    if (key === 'you') {
      return { sender: 'you', wave: 'square', notes: [1320, 1760], gain: 0.055, step: 34, duration: 0.045 };
    }

    if (key === 'gemini') {
      return { sender: 'gemini', wave: 'triangle', notes: [1046.5, 1318.51, 1567.98], gain: 0.05, step: 38, duration: 0.05 };
    }

    return { sender: 'gpt', wave: 'sine', notes: [880, 1174.66], gain: 0.06, step: 42, duration: 0.05 };
  }

  function playTone(sender, index) {
    try {
      const profile = getSoundProfile('', sender);
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = profile.wave;
      osc.frequency.setValueAtTime(profile.notes[index % profile.notes.length], now);
      gain.gain.setValueAtTime(profile.gain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + profile.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + profile.duration);
    } catch (e) {}
  }

  function playSound(type, sender) {
    const profile = getSoundProfile(type, sender);
    profile.notes.forEach((_, index) => {
      window.setTimeout(() => playTone(profile.sender, index), index * profile.step);
    });
  }

  function findLatestBubble(sender) {
    const wrappers = document.querySelectorAll('.dc-msg-wrapper.' + sender);
    const wrapper = wrappers[wrappers.length - 1];
    return wrapper?.querySelector('.dc-msg-bubble') || null;
  }

  function pulseEar(sender, bubble) {
    const target = bubble || findLatestBubble(sender);
    if (!target) return;

    target.classList.remove('dc-ear-pulse');
    void target.offsetWidth;
    target.classList.add('dc-ear-pulse');

    window.setTimeout(() => {
      target.classList.remove('dc-ear-pulse');
    }, 140);
  }

  function playOutputSound(sender, text, bubble) {
    const profile = getSoundProfile('', sender);
    const count = Math.min(String(text || '').length, 36);

    for (let i = 0; i < count; i++) {
      window.setTimeout(() => {
        playTone(profile.sender, i);
        pulseEar(profile.sender, bubble);
      }, i * profile.step);
    }
  }

  function getEarRatio(length) {
    if (length <= 2) return 0;
    if (length === 3) return 0.16;
    if (length <= 6) return 0.26;
    if (length <= 12) return 0.36;
    return 0.40;
  }

  function applyEarPosition(sender, bubble, text) {
    if (!bubble) return;

    requestAnimationFrame(() => {
      const width = bubble.offsetWidth;
      if (!width) return;

      const ratio = getEarRatio(String(text || '').length);
      let leftPx = width / 2;

      if (sender === 'you') {
        leftPx += width * ratio;
      } else if (sender === 'gpt' || sender === 'gemini') {
        leftPx -= width * ratio;
      }

      leftPx = Math.max(16, Math.min(width - 16, leftPx));
      bubble.style.setProperty('--dc-ear-left-px', `${leftPx}px`);
    });
  }

  function createTokenCounter() {
    const input = document.getElementById('dc-input');
    const sendBtn = document.getElementById('dc-send');
    if (!input || document.getElementById('dc-token-counter')) return;

    const counter = document.createElement('div');
    counter.id = 'dc-token-counter';
    input.parentNode.insertBefore(counter, sendBtn || input.nextSibling);

    input.addEventListener('input', () => updateTokenCounter());
    input.addEventListener('change', () => updateTokenCounter());
    updateTokenCounter();
  }

  function updateTokenCounter(detail) {
    const input = document.getElementById('dc-input');
    const counter = document.getElementById('dc-token-counter');
    if (!counter) return;

    const value = detail?.text ?? input?.value ?? '';
    const chars = detail?.chars ?? value.length;
    const lines = detail?.lines ?? (value ? value.split(/\r\n|\r|\n/).length : 1);
    counter.textContent = `${chars} chars / ${lines} line${lines === 1 ? '' : 's'}`;
  }

  function createUI() {
    if (document.getElementById('dc-root')) return;

    const root = document.createElement('div');
    root.id = 'dc-root';
    root.classList.add(isMobile ? 'dc-is-mobile' : 'dc-is-pc');

    root.innerHTML = `
      <div id="dc-header">
        <div id="dc-title-area">
          DoubleChat v${DC_VERSION}
          <span id="dc-mode">${MODES.normal}</span>
        </div>
        <div id="dc-controls">
          <span id="dc-full">\u26f6</span>
          <span id="dc-min">\u2212</span>
        </div>
      </div>
      <div id="dc-body">
        <div id="dc-log"></div>
        <textarea id="dc-input" placeholder="\u5165\u529b..." rows="1"></textarea>
        <button id="dc-send">\u27a4</button>
      </div>
    `;

    document.body.appendChild(root);

    const style = document.createElement('style');
    style.innerHTML = `
      #dc-root, #dc-root * { box-sizing: border-box !important; }
      #dc-root { position: fixed; top: 70px; right: 10px; width: 320px; z-index: 9999; background: rgba(255,255,255,0.95); border: 1px solid rgba(0,0,0,0.2); border-radius: 10px; font-family: Arial, sans-serif; color: #111; transition: left 0.2s ease, top 0.2s ease, width 0.2s ease, height 0.2s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
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

      .dc-msg-bubble { position: relative; padding: 8px 14px; border-radius: 16px !important; line-height: 1.4; word-break: break-all; box-shadow: 0 1px 2px rgba(0,0,0,0.1); z-index: 1; margin-top: 12px; min-width: 52px; --dc-ear-left-px: 50%; }
      .dc-msg-bubble::before { content: ""; position: absolute; top: -7px; left: var(--dc-ear-left-px); transform: translateX(-50%); width: 32px; height: 8px; z-index: -1; clip-path: polygon(0% 100%, 20% 0%, 40% 100%, 60% 100%, 80% 0%, 100% 100%); }
      .dc-msg-bubble::after { content: ""; position: absolute; bottom: 2px; width: 8px; height: 12px; z-index: -1; }
      .dc-msg-bubble.dc-ear-pulse::before { animation: dc-ear-pulse 140ms ease-out both; }
      @keyframes dc-ear-pulse { 0% { transform: translateX(-50%) translateY(0) scaleY(1); } 42% { transform: translateX(-50%) translateY(-3px) scaleY(1.28); } 100% { transform: translateX(-50%) translateY(0) scaleY(1); } }

      .dc-msg-you { background: #a9e3a3; color: #111; }
      .dc-msg-wrapper.you .dc-msg-bubble::before { background: #a9e3a3; }
      .dc-msg-wrapper.you .dc-msg-bubble::after { right: -5px; left: auto; background: #a9e3a3; border-radius: 5px 0 0 5px; transform: rotate(35deg); }

      .dc-msg-gpt { background: #10a37f; color: #fff; }
      .dc-msg-wrapper.gpt .dc-msg-bubble::before { background: #10a37f; }
      .dc-msg-wrapper.gpt .dc-msg-bubble::after { left: -5px; right: auto; background: #10a37f; border-radius: 0 5px 5px 0; transform: rotate(-35deg); }

      .dc-msg-gemini { background: #1a73e8; color: #fff; }
      .dc-msg-wrapper.gemini .dc-msg-bubble::before { background: #1a73e8; }
      .dc-msg-wrapper.gemini .dc-msg-bubble::after { left: -5px; right: auto; background: #1a73e8; border-radius: 0 5px 5px 0; transform: rotate(-35deg); }

      .dc-is-pc #dc-input { width: 100% !important; height: 38px; min-height: 38px; max-height: 150px; padding: 9px 50px 9px 10px !important; resize: none; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; overflow-y: auto; line-height: 1.4; }
      .dc-is-pc #dc-send { position: absolute !important; right: 16px; bottom: 15px; width: 36px; height: 28px; background: #0a84ff; color: white; border: none; border-radius: 4px; cursor: pointer; z-index: 99; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: background 0.1s; }
      .dc-is-mobile #dc-input { width: 100% !important; height: 38px; min-height: 38px; max-height: 120px; padding: 9px 10px !important; resize: none; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; overflow-y: auto; line-height: 1.4; }
      .dc-is-mobile #dc-send { display: none !important; }
      #dc-token-counter { align-self: flex-end; margin: 0 4px 6px 0; color: #666; font-size: 10px; line-height: 1; user-select: none; }

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
    createTokenCounter();
  }

  function bindEvents() {
    const root = document.getElementById('dc-root');
    const body = document.getElementById('dc-body');
    const fullBtn = document.getElementById('dc-full');
    const input = document.getElementById('dc-input');
    const sendBtn = document.getElementById('dc-send');

    function adjustInputHeight() {
      input.style.height = 'auto';
      input.style.height = (input.scrollHeight + 2) + 'px';
    }

    input.addEventListener('input', () => {
      adjustInputHeight();
      updateTokenCounter();
    });

    function executeSend() {
      const text = input.value.trim();
      if (!text || input.disabled) return;

      document.dispatchEvent(new CustomEvent('dc-request-send', {
        detail: { text: text }
      }));

      input.value = '';
      adjustInputHeight();
      updateTokenCounter();
    }

    sendBtn.onclick = () => { executeSend(); };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (!isMobile || !isFull) {
          e.preventDefault();
          executeSend();
        }
      }
    });

    document.getElementById('dc-mode').onclick = (e) => {
      e.stopPropagation();
      if (currentMode === 'normal') currentMode = 'present';
      else if (currentMode === 'present') currentMode = 'debate';
      else currentMode = 'normal';
      document.getElementById('dc-mode').textContent = MODES[currentMode];
    };

    document.getElementById('dc-min').onclick = () => {
      if (isFull) {
        isFull = false;
        root.classList.remove('dc-fullscreen');
        fullBtn.textContent = '\u26f6';
        root.style.left = lastPos.left;
        root.style.top = lastPos.top;
      }
      body.style.display = body.style.display === 'none' ? 'flex' : 'none';
    };

    fullBtn.onclick = () => {
      if (body.style.display === 'none') body.style.display = 'flex';
      isFull = !isFull;
      root.classList.toggle('dc-fullscreen');
      if (isFull) {
        fullBtn.textContent = '\u21f1';
        lastPos.left = root.style.left;
        lastPos.top = root.style.top;
        root.style.left = '0px';
        root.style.top = '0px';
      } else {
        fullBtn.textContent = '\u26f6';
        root.style.left = lastPos.left;
        root.style.top = lastPos.top;
      }
      adjustInputHeight();
    };
  }

  function setupCoreListeners() {
    document.addEventListener('dc-append-log', (e) => {
      if (!e.detail?.sender || !e.detail?.text) return;
      log(e.detail.sender, e.detail.text);
    });

    document.addEventListener('dc-play-sound', (e) => {
      playSound(e.detail?.type, e.detail?.sender);
    });

    document.addEventListener('dc-token-count', (e) => {
      updateTokenCounter(e.detail);
    });
  }

  function log(sender, text) {
    const logArea = document.getElementById('dc-log');
    if (!logArea) return null;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const wrapper = document.createElement('div');
    wrapper.className = `dc-msg-wrapper ${sender}`;

    if (sender !== 'you') {
      const avatar = document.createElement('div');
      avatar.className = `dc-avatar dc-avatar-${sender}`;
      avatar.textContent = sender === 'gpt' ? 'C' : 'G';
      wrapper.appendChild(avatar);
    }

    const msgBox = document.createElement('div');
    msgBox.className = 'dc-msg-box';

    const nameLabel = document.createElement('div');
    nameLabel.className = 'dc-msg-name';
    nameLabel.textContent = sender === 'you' ? 'YOU' : sender === 'gpt' ? 'ChatGPT' : 'Gemini';

    const row = document.createElement('div');
    row.className = 'dc-msg-row';

    const bubble = document.createElement('div');
    bubble.className = `dc-msg-bubble dc-msg-${sender}`;
    bubble.textContent = text;

    const timeLabel = document.createElement('div');
    timeLabel.className = 'dc-msg-time';
    timeLabel.textContent = timeStr;

    row.appendChild(bubble);
    row.appendChild(timeLabel);
    msgBox.appendChild(nameLabel);
    msgBox.appendChild(row);
    wrapper.appendChild(msgBox);

    logArea.appendChild(wrapper);
    logArea.scrollTop = logArea.scrollHeight;

    applyEarPosition(sender, bubble, text);
    playOutputSound(sender, text, bubble);

    return bubble;
  }

  function enableDrag() {
    const box = document.getElementById('dc-root');
    const header = document.getElementById('dc-header');
    let dragging = false, offsetX = 0, offsetY = 0;

    const startDrag = (clientX, clientY, target) => {
      if (isFull || target.closest('#dc-controls') || target.closest('#dc-mode')) return false;
      dragging = true;
      box.style.transition = 'none';
      const currentLeft = box.offsetLeft, currentTop = box.offsetTop;
      box.style.left = currentLeft + 'px';
      box.style.top = currentTop + 'px';
      box.style.right = 'auto';
      offsetX = clientX - currentLeft;
      offsetY = clientY - currentTop;
      return true;
    };

    const moveDrag = (clientX, clientY) => {
      if (dragging) {
        box.style.left = (clientX - offsetX) + 'px';
        box.style.top = (clientY - offsetY) + 'px';
      }
    };

    const endDrag = () => {
      if (dragging) {
        dragging = false;
        box.style.transition = 'left 0.2s ease, top 0.2s ease, width 0.2s ease, height 0.2s ease';
      }
    };

    header.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY, e.target));
    document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup', endDrag);

    header.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      if (startDrag(t.clientX, t.clientY, e.target)) {
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      if (dragging) {
        const t = e.touches[0];
        moveDrag(t.clientX, t.clientY);
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    document.addEventListener('touchend', endDrag);
  }

  setupCoreListeners();
})();
