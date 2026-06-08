// == DoubleChat Core Minimal ==

(function () {
  'use strict';

  let currentMode = "normal";

  // UI → Core：送信
  document.addEventListener("dc-request-send", async (e) => {
    const { text, mode } = e.detail;

    currentMode = mode;

    // UIロック
    dispatch("dc-lock-ui");

    // ユーザー発言をログ表示
    dispatch("dc-append-log", {
      sender: "you",
      text: text
    });

    // ダミー応答（あとでAPIに置き換え）
    setTimeout(() => {
      dispatch("dc-append-log", {
        sender: "gpt",
        text: `[GPT:${currentMode}] ${text}`
      });
      dispatch("dc-play-sound", { type: "reply_gpt" });
    }, 500);

    setTimeout(() => {
      dispatch("dc-append-log", {
        sender: "gemini",
        text: `[Gemini:${currentMode}] ${text}`
      });
      dispatch("dc-play-sound", { type: "reply_gemini" });
      dispatch("dc-unlock-ui");
    }, 900);
  });

  // UI → Core：モード変更
  document.addEventListener("dc-mode-changed", (e) => {
    currentMode = e.detail.mode;
  });

  // Core → UI：共通送信関数
  function dispatch(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  // Core起動通知（UI側のフェイルセーフ用）
  document.dispatchEvent(new CustomEvent("dc-core-ready"));

})();
