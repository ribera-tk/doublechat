window.DoubleChatCore = {

  _initialized: false,
  _listenerAttached: false,

  init() {
    console.log("Core init OK");

    // initは何回でもOKにする
    if (!this._listenerAttached) {
      this._listenerAttached = true;

      console.log("🔥リスナー登録");

      document.addEventListener("DoubleChat:Send", (e) => {
        console.log("🔥受信:", e.detail);

        let text = typeof e.detail === "string"
          ? e.detail
          : e.detail.text;

        document.dispatchEvent(new CustomEvent("dc-append-log", {
          detail: {
            sender: "gpt",
            text: "返答：" + text
          }
        }));
      });
    }
  }
};
