// ==UserScript==
// @name         DoubleChat UI
// @namespace    doublechat
// @version      3.7
// @description  Injects the DoubleChat UI into the current page.
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  if (window.DoubleChatUI) return;

  const DC_VERSION = 'UI-3.7';
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
    } catch (e) {
      console.warn(e);
    }
  }

  function playSound(type, sender) {
    const profile = getSoundProfile(type, sender);
    profile.notes.forEach((_, index) => {
      window.setTimeout(() => playTone(profile.sender, index), index * profile.step);
    });
  }
