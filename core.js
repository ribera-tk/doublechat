window.DoubleChatCore = {

  init() {
    console.log("Core init OK");

    document.addEventListener("dc-request-send", (e) => {
      const { text, mode } = e.detail;

      console.log("受信:", text, mode);

      // テスト返信
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent("dc-append-log", {
          detail: { sender: "gpt", text: "Coreから返答：" + text }
        }));
      }, 500);
    });
  }

};
