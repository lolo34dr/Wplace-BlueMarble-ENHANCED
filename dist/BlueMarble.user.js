// ==UserScript==
// @name         Blue Marble
// @namespace    https://github.com//lolo34dr/
// @version      0.84.0
// @description  A userscript to automate and/or enhance the user experience on Wplace.live. Make sure to comply with the site's Terms of Service, and rules! This script is not affiliated with Wplace.live in any way, use at your own risk. This script is not affiliated with TamperMonkey. The author of this userscript is not responsible for any damages, issues, loss of data, or punishment that may occur as a result of using this script. This script is provided "as is" under the MPL-2.0 license. The "Blue Marble" icon is licensed under CC0 1.0 Universal (CC0 1.0) Public Domain Dedication. The image is owned by NASA.
// @author       SwingTheVine
// @license      MPL-2.0
// @supportURL   https://discord.gg/tpeBPy46hf
// @homepageURL  https://bluemarble.camilledaguin.fr/
// @icon         https://raw.githubusercontent.com/lolo34dr/Wplace-BlueMarble-ENHANCED/8d02ac9cbe8f6861248152f2b0d632a0b4a830ee/dist/assets/Favicon.png
// @updateURL    https://raw.githubusercontent.com/lolo34dr/Wplace-BlueMarble-ENHANCED/main/dist/BlueMarble.user.js
// @downloadURL  https://raw.githubusercontent.com/lolo34dr/Wplace-BlueMarble-ENHANCED/main/dist/BlueMarble.user.js
// @match        https://wplace.live/*
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        GM.setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      telemetry.thebluecorner.net
// @resource     CSS-BM-File https://raw.githubusercontent.com/lolo34dr/Wplace-BlueMarble-ENHANCED/8d02ac9cbe8f6861248152f2b0d632a0b4a830ee/dist/BlueMarble.user.css
// ==/UserScript==

// Wplace  --> https://wplace.live
// License --> https://www.mozilla.org/en-US/MPL/2.0/

(() => {
  'use strict';

  const RAW_URL = 'https://raw.githubusercontent.com/lolo34dr/Wplace-BlueMarble-ENHANCED/main/src/main.js';

  function log(...args) { console.info('[BM-loader]', ...args); }
  function err(...args) { console.error('[BM-loader]', ...args); }

  // Fetch the raw JS via GM_xmlhttpRequest (bypasses CORS)
  GM_xmlhttpRequest({
    method: 'GET',
    url: RAW_URL,
    onload(resp) {
      if (resp.status >= 200 && resp.status < 300 && resp.responseText) {
        try {
          const code = resp.responseText;
          // Heuristic: if the fetched file uses ESM imports/exports, inject as module.
          const isModule = /(^|\n)\s*(import|export)\s+/m.test(code);
          const script = document.createElement('script');

          script.type = isModule ? 'module' : 'text/javascript';
          // Add sourceURL so errors and debugging point to the remote file
          script.textContent = code + '\n//# sourceURL=' + RAW_URL;

          // Insert as early as possible
          (document.documentElement || document.head || document.body).appendChild(script);
          // Optionally remove element node after insertion (the script already ran)
          script.parentNode && script.parentNode.removeChild(script);

          log('Successfully injected remote script:', RAW_URL, 'as', script.type);
        } catch (e) {
          err('Failed to execute remote script:', e);
        }
      } else {
        err('Failed to fetch remote script. HTTP', resp.status, resp.statusText);
      }
    },
    onerror(e) {
      err('Network error while fetching remote script:', e);
    }
  });

  // Safety note (console)
  log('Attempting to load remote Blue Marble main.js from GitHub raw.');
})();
