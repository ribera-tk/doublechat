(function () {
  'use strict';

  window.DoubleChatCore = {

    _listenerAttached: false,

    init() {
      console.log("Core init OK");

      if (this._listenerAttached) return;
      this._listenerAttached = true;

      console.log("🔥リスナー登録");

      document.addEventListener("dc-request-send", (e) => {
        console.log("🔥受信:", e.detail);

        // 🔥 ここが今回の本体
        const text = e.detail?.text;

        if (!text) {
          console.warn("❌ text undefined", e.detail);
          return;
        }

        // 自分ログ
        document.dispatchEvent(new CustomEvent("dc-append-log", {
          detail: { sender: "you", text: text }
        }));

        // ダミー返信
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent("dc-append-log", {
            detail: { sender: "gpt", text: "受け取った: " + text }
          }));

          document.dispatchEvent(new CustomEvent("dc-play-sound", {
            detail: { type: "reply_gpt" }
          }));

        }, 500);
      });
    }

  };

})();
