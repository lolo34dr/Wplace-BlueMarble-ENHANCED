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
  const LOG_PREFIX = '[BM-remote-loader]';

  function log(...args){ console.info(LOG_PREFIX, ...args); }
  function warn(...args){ console.warn(LOG_PREFIX, ...args); }
  function error(...args){ console.error(LOG_PREFIX, ...args); }

  // Fetch remote JS bypassing CORS (GM_xmlhttpRequest)
  GM_xmlhttpRequest({
    method: 'GET',
    url: RAW_URL,
    onload(resp) {
      if (!resp || resp.status < 200 || resp.status >= 300 || !resp.responseText) {
        return error('Échec du téléchargement', resp && resp.status, resp && resp.statusText);
      }

      const code = resp.responseText;
      // Heuristique simple pour détecter ESM (import/export). Non parfaite mais fonctionnelle la plupart du temps.
      const isModule = /(^|\n)\s*(import|export)\s+/m.test(code);

      try {
        if (isModule) {
          // Crée un blob et injecte comme <script type="module" src="blob:...">
          const blob = new Blob([code + '\n//# sourceURL=' + RAW_URL], { type: 'application/javascript' });
          const blobUrl = URL.createObjectURL(blob);
          const s = document.createElement('script');
          s.type = 'module';
          s.src = blobUrl;
          s.async = false; // exécute dès que possible
          s.onload = () => {
            log('Module exécuté depuis', RAW_URL);
            // libère l'URL blob après un court délai pour éviter d'interrompre l'exécution si besoin
            setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
            s.remove();
          };
          s.onerror = (ev) => {
            error('Erreur lors du chargement du module', ev);
            s.remove();
            URL.revokeObjectURL(blobUrl);
          };
          // injecte dans documentElement pour s'exécuter tôt
          (document.documentElement || document.head || document.body).appendChild(s);
        } else {
          // Injection directe en tant que script classique dans le contexte page
          const wrapper = `(function(){\ntry{\n${code}\n}catch(e){console.error('${LOG_PREFIX} remote script error:', e)}\n})();\n//# sourceURL=${RAW_URL}`;
          const s = document.createElement('script');
          s.type = 'text/javascript';
          s.textContent = wrapper;
          (document.documentElement || document.head || document.body).appendChild(s);
          // on peut retirer le nœud (le script s'est déjà exécuté)
          s.remove();
          log('Script non-module injecté et exécuté depuis', RAW_URL);
        }
      } catch (e) {
        error('Exception lors de l\'injection/exécution:', e);
      }
    },
    onerror(err) {
      error('GM_xmlhttpRequest network error:', err);
    },
    ontimeout() {
      warn('GM_xmlhttpRequest timeout');
    }
  });

})();
