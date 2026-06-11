(function () {
  'use strict';

  if (window.DoubleChatCore && window.DoubleChatCore._aiCoreVersion) return;

  const CORE_VERSION = 'Core-2.1-gas-secure';
  const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbz5KpGu5WMGrpsuHcfNFX5ygcnL0yfsOIBEEETvTZ8cBzZ842GG-HIEvx9XEwCM4j56ew/exec';
  const EVENT_SEND_LEGACY = 'dc-request-send';
  const EVENT_SEND_SPEC = 'DoubleChat:Send';
  const EVENT_APPEND_LOG = 'dc-append-log';
  const EVENT_PLAY_SOUND = 'dc-play-sound';
  const EVENT_TOKEN_COUNT = 'dc-token-count';
  const DEFAULT_TIMEOUT_MS = 60000;

  function getConfig() {
    const config = window.DoubleChatConfig || {};
    return {
      gasEndpoint: GAS_ENDPOINT,
      timeoutMs: Number(config.timeoutMs || DEFAULT_TIMEOUT_MS)
    };
  }

  function dispatch(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function appendLog(sender, text) {
    dispatch(EVENT_APPEND_LOG, { sender, text });
    queueUIAfterAppend(sender, text);
  }

  function playSound(type, sender) {
    dispatch(EVENT_PLAY_SOUND, { type, sender });
  }

  function setUILock(isLocked) {
    if (window.DoubleChatUI && typeof window.DoubleChatUI.setLock === 'function') {
      window.DoubleChatUI.setLock(isLocked);
    }
  }

  function updateTokenCounter() {
    const input = document.getElementById('dc-input');
    if (!input) return;

    const value = input.value || '';
    const detail = {
      chars: value.length,
      lines: value ? value.split(/\r\n|\r|\n/).length : 1,
      text: value
    };

    if (window.DoubleChatUI && typeof window.DoubleChatUI.updateTokenCounter === 'function') {
      window.DoubleChatUI.updateTokenCounter(detail);
    }

    const counter = document.getElementById('dc-token-counter');
    if (counter) {
      counter.textContent = detail.chars + ' chars / ' + detail.lines + ' line' + (detail.lines === 1 ? '' : 's');
    }

    dispatch(EVENT_TOKEN_COUNT, detail);
  }

  function setupTokenCounterBridge() {
    const bind = () => {
      const input = document.getElementById('dc-input');
      if (!input || input.dataset.dcCoreTokenBound === '1') return;

      input.dataset.dcCoreTokenBound = '1';
      input.addEventListener('input', updateTokenCounter);
      input.addEventListener('change', updateTokenCounter);
      updateTokenCounter();
    };

    bind();
    document.addEventListener('DOMContentLoaded', bind, { once: true });
    window.setTimeout(bind, 250);
    window.setTimeout(bind, 1000);
  }

  function getEarRatio(length) {
    if (length <= 2) return 0;
    if (length === 3) return 0.16;
    if (length <= 6) return 0.26;
    if (length <= 12) return 0.36;
    return 0.40;
  }

  function applyEarPositionFallback(sender, bubble, text) {
    if (!bubble) return;

    const width = bubble.offsetWidth;
    if (!width) return;

    const ratio = getEarRatio(String(text || '').length);
    let leftPx = width / 2;

    if (sender === 'you') leftPx += width * ratio;
    if (sender === 'gpt' || sender === 'gemini') leftPx -= width * ratio;
