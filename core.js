window.DoubleChatCore = {

  _initialized: false,
  _listenerAttached: false,

  init() {
    console.log("Core init OK");

    // initは何回でもOKにする
    if (!this._listenerAttached) {
      this._listenerAttached = true;

      console.log("🔥リスナー登録");

      document.addEventListener("dc-request-send", (e) => {
        console.log("🔥受信:", e.detail);

        const text = e.detail.text;

        // UIロック（任意）
        document.dispatchEvent(new CustomEvent("dc-lock-ui"));

        // 自分の発言を表示
        document.dispatchEvent(new CustomEvent("dc-append-log", {
          detail: { sender: "you", text: text }
        }));

        // ダミー返信（テスト用）
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent("dc-append-log", {
            detail: { sender: "gpt", text: "受け取った: " + text }
          }));

          // 音（必要なら）
          document.dispatchEvent(new CustomEvent("dc-play-sound", {
            detail: { type: "reply_gpt" }
          }));

          // UIアンロック
          document.dispatchEvent(new CustomEvent("dc-unlock-ui"));

        }, 500);
      });
    }
    ｝
  };

})();
