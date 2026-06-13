;
function () {
  'use strict';
  
  // --- ここが抜けていた設定部分 ---
  const CORE_VERSION = '2.1';
  const EVENT_SEND_LEGACY = 'dc-send-legacy';
  const EVENT_SEND_SPEC = 'dc-send-spec';
  const MODES = { normal: 'Normal', debug: 'Debug' };

  function getConfig() {
    return {
      // 監督、ここに自分のGASのURLを貼り付けてくれ！
      gasEndpoint: 'https://script.google.com/macros/s/AKfycbz5KpGu5WMGrpsuHcfNFX5ygcnL0yfsOIBEEETvTZ8cBzZ842GG-HIEvx9XEwCM4j56ew/exec',
      timeoutMs: 30000
    };
  }

  function setupTokenCounterBridge() {
    document.addEventListener('dc-update-token', (e) => {
      window.DoubleChatUI?.updateTokenCounter(e.detail);
    });
  }

  function applyEarPositionFallback(sender, bubble, text) {
    window.DoubleChatUI?.applyEarPosition(sender, bubble, text);
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
function normalizeAIReplies(raw) {
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    return [{ sender: 'gpt', text: raw }];
  }

  const replies = [];

  const ai1 = data.ai1;
  const ai2 = data.ai2;

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
