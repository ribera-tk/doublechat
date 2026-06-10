window.DoubleChatCore = {

  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    console.log("Core init OK");

    document.addEventListener("DoubleChat:Send", (e) => {
      console.log("🔥受信 raw:", e.detail);

      let text, mode;

      // 安全に分岐
      if (typeof e.detail === "string") {
        text = e.detail;
        mode = "normal";
      } else {
        text = e.detail.text;
        mode = e.detail.mode;
      }

      console.log("🔥解析後:", text, mode);

      document.dispatchEvent(new CustomEvent("dc-append-log", {
        detail: {
          sender: "gpt",
          text: "返答：" + text + " [" + mode + "]"
        }
      }));
    });
  }

};
