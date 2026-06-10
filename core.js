window.DoubleChatCore = {

  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    console.log("Core init OK");

    document.addEventListener("dc-request-send", (e) => {
      const { text, mode } = e.detail;

      console.log("🔥受信:", text, mode);

      // 即返す（遅延なし）
      document.dispatchEvent(new CustomEvent("dc-append-log", {
        detail: {
          sender: "gpt",
          text: "テスト返答：" + text + " [" + mode + "]"
        }
      }));

    });
  }

};
