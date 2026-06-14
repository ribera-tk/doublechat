(function () {
  'use strict';

  if (window.DoubleChatCore && window.DoubleChatCore._aiCoreVersion) return;

  const CORE_VERSION = 'Core-4.1-gas-secure';
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

    leftPx = Math.max(16, Math.min(width - 16, leftPx));
    bubble.style.setProperty('--dc-ear-left-px', leftPx + 'px');
  }

  function queueUIAfterAppend(sender, text) {
    window.requestAnimationFrame(() => {
      const wrappers = document.querySelectorAll('.dc-msg-wrapper.' + sender);
      const wrapper = wrappers[wrappers.length - 1];
      const bubble = wrapper?.querySelector('.dc-msg-bubble');

      if (window.DoubleChatUI && typeof window.DoubleChatUI.applyEarPosition === 'function') {
        window.DoubleChatUI.applyEarPosition(sender, bubble, text);
      } else if (typeof window.applyEarPosition === 'function') {
        window.applyEarPosition(sender, bubble, text);
      } else {
        applyEarPositionFallback(sender, bubble, text);
      }

      if (window.DoubleChatUI && typeof window.DoubleChatUI.pulseEar === 'function') {
        window.DoubleChatUI.pulseEar(sender, bubble);
      }
    });
  }

  function normalizeAIReplies(responseText) {
    let data;

    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return [{ sender: 'gpt', text: String(responseText || '').trim() }];
    }

    if (typeof data === 'string') return [{ sender: 'gpt', text: data.trim() }];
    if (!data || typeof data !== 'object') return [];

    if (Array.isArray(data.replies)) {
      return data.replies
        .map((item, index) => ({
          sender: item.sender || item.role || (index === 1 ? 'gemini' : 'gpt'),
          text: item.text || item.message || item.reply || ''
        }))
        .filter((item) => item.text);
    }

    const ai1 = data.ai1 || data.gpt || data.chatgpt || data.reply || data.text || data.message || data.answer;
    const ai2 = data.ai2 || data.gemini;
    const replies = [];

    if (typeof ai1 === 'string' && ai1.trim()) replies.push({ sender: 'gpt', text: ai1.trim() });
    if (typeof ai2 === 'string' && ai2.trim()) replies.push({ sender: 'gemini', text: ai2.trim() });

    if (!replies.length && Array.isArray(data.choices) && data.choices[0]) {
      const choice = data.choices[0];
      const text = choice.message?.content || choice.text;
      if (text) replies.push({ sender: 'gpt', text: String(text).trim() });
    }

    if (!replies.length && Array.isArray(data.candidates) && data.candidates[0]) {
      const candidate = data.candidates[0];
      const text = candidate.content?.parts?.[0]?.text || candidate.content || candidate.text;
      if (text) replies.push({ sender: 'gemini', text: String(text).trim() });
    }

    if (!replies.length) replies.push({ sender: 'gpt', text: JSON.stringify(data) });
    return replies;
  }

  async function requestWithGM(url, payload, config) {
    return new Promise((resolve, reject) => {
      const gmRequest = window.GM_xmlhttpRequest || window.GM?.xmlHttpRequest;

      if (!gmRequest) {
        reject(new Error('GM_xmlhttpRequest is not available'));
        return;
      }

      gmRequest({
        method: 'POST',
        url,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        data: JSON.stringify(payload),
        timeout: config.timeoutMs,
        onload: (res) => {
          if (res.status < 200 || res.status >= 300) {
            reject(new Error('GAS HTTP ' + res.status));
            return;
          }
          resolve(normalizeAIReplies(res.responseText));
        },
        onerror: () => reject(new Error('GAS network error')),
        ontimeout: () => reject(new Error('GAS request timeout'))
      });
    });
  }

  async function requestWithFetch(url, payload, config) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
        credentials: 'omit',
        signal: controller.signal
      });

      if (res.type === 'opaque') {
        throw new Error('GAS response is opaque. Use GM_xmlhttpRequest permission or enable CORS in GAS.');
      }

      if (!res.ok) throw new Error('GAS HTTP ' + res.status);
      return normalizeAIReplies(await res.text());
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('GAS request timeout');
      throw err;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function requestAI(text) {
    const config = getConfig();
    const payload = {
      source: 'DoubleChat',
      text,
      message: text,
      timestamp: new Date().toISOString()
    };

    if (window.GM_xmlhttpRequest || window.GM?.xmlHttpRequest) {
      return await requestWithGM(config.gasEndpoint, payload, config);
    }

    return await requestWithFetch(config.gasEndpoint, payload, config);
  }

  async function handleSend(e) {
    const text = e.detail?.text?.trim();

    if (!text) {
      return;
    }

    appendLog('you', text);
    playSound('send', 'you');
    updateTokenCounter();
    setUILock(true);

    try {
      const replies = await requestAI(text);
      const normalized = replies.length ? replies : [{ sender: 'gpt', text: '\u5fdc\u7b54\u304c\u7a7a\u3067\u3057\u305f\u3002' }];

      for (const reply of normalized) {
        const sender = reply.sender === 'gemini' || reply.sender === 'ai2' ? 'gemini' : 'gpt';
        appendLog(sender, reply.text);
        playSound(sender === 'gemini' ? 'reply_gemini' : 'reply_gpt', sender);
      }
    } catch (err) {
      appendLog('gpt', '\u901a\u4fe1\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + (err.message || err));
      playSound('reply_gpt', 'gpt');
    } finally {
      setUILock(false);
    }
  }

  window.DoubleChatCore = {
    _aiCoreVersion: CORE_VERSION,
    _listenerAttached: false,

    init() {
      if (this._listenerAttached) return;
      this._listenerAttached = true;

      document.addEventListener(EVENT_SEND_LEGACY, handleSend);
      document.addEventListener(EVENT_SEND_SPEC, handleSend);
      setupTokenCounterBridge();
    },

    sendToAI: requestAI,
    updateTokenCounter,
    applyEarPositionFallback,
    getConfig
  };

})();
