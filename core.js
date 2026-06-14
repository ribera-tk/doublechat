(function () {
  'use strict';

  const EVENT_SEND = 'dc-send-spec';

  async function fakeAI(text) {
    // とりあえず動作確認用（GAS抜き）
    return [
      { sender: 'gpt', text: 'GPT: ' + text },
      { sender: 'gemini', text: 'Gemini: ' + text }
    ];
  }

  async function handleSend(e) {
    const text = e.detail?.text?.trim();
    if (!text) return;

    window.DoubleChatUI?.appendLog('you', text);
    window.DoubleChatUI?.setLock?.(true);

    try {
      const replies = await fakeAI(text);

      for (const r of replies) {
        window.DoubleChatUI?.appendLog(r.sender, r.text);
      }
    } catch (err) {
      window.DoubleChatUI?.appendLog('gpt', 'エラー: ' + err.message);
    } finally {
      window.DoubleChatUI?.setLock?.(false);
    }
  }

  window.DoubleChatCore = {
    init() {
      document.addEventListener(EVENT_SEND, handleSend);
      console.log('✅ Core起動');
    }
  };

})();
