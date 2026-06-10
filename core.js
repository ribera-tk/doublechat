(function () {
  'use strict';

  window.DoubleChatCore = {

    _initialized: false,
    _listenerAttached: false,

    init() {
      console.log("Core init OK");

      if (!this._listenerAttached) {
        this._listenerAttached = true;

        console.log("🔥リスナー登録");

        document.addEventListener("dc-request-send", (e) => {
          console.log("🔥受信:", e.detail);

          const text = e.detail.text;

          document.dispatchEvent(new CustomEvent("dc-lock-ui"));

          document.dispatchEvent(new CustomEvent("dc-append-log", {
            detail: { sender: "you", text: text }
          }));

          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("dc-append-log", {
              detail: { sender: "gpt", text: "受け取った: " + text }
            }));

            document.dispatchEvent(new CustomEvent("dc-play-sound", {
              detail: { type: "reply_gpt" }
            }));

            document.dispatchEvent(new CustomEvent("dc-unlock-ui"));

          }, 500);
        });
      }
    }

  };

})();
