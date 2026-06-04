// ==UserScript==
// @name         DC TEST
// @match        https://chatgpt.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  function createUI() {
    if (document.getElementById("dc-root")) return;

    const root = document.createElement("div");
    root.id = "dc-root";

    root.innerHTML =
      '<div id="dc-header">DC TEST</div>' +
      '<div id="dc-body">' +
      '<div id="dc-log">起動OK</div>' +
      '</div>';

    document.body.appendChild(root);

    const style = document.createElement("style");
    style.textContent =
      "#dc-root { position: fixed; top: 50px; right: 10px; width: 200px; background:#fff; z-index:9999; }";

    document.head.appendChild(style);
  }

  setTimeout(createUI, 1000);

})();
