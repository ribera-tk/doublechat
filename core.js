window.DoubleChatCore = {

  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    console.log("Core init OK");

   document.addEventListener("DoubleChat:Send", (e) => {
  const text = e.detail;

  console.log("🔥受信:", text);

  document.dispatchEvent(new CustomEvent("dc-append-log", {
    detail: {
      sender: "gpt",
      text: "返答：" + text
    }
  }));
});
