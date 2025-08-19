/** main optimisé - même fonctionnalité, moins de lignes */

import Overlay from './Overlay.js';
import Observers from './observers.js';
import ApiManager from './apiManager.js';
import TemplateManager from './templateManager.js';
import { consoleLog, consoleWarn, selectAllCoordinateInputs } from './utils.js';

const name = GM_info.script.name.toString();
const version = GM_info.script.version.toString();
const consoleStyle = 'color: cornflowerblue;';

/* --- inject code into page context to spy fetch --- */
function inject(cb){
  const s=document.createElement('script');
  s.setAttribute('bm-name',name);
  s.setAttribute('bm-cStyle',consoleStyle);
  s.textContent=`(${cb})();`;
  document.documentElement?.appendChild(s);
  s.remove();
}

inject(()=>{ // runs in page context
  const script=document.currentScript;
  const NAME = script?.getAttribute('bm-name')||'Blue Marble';
  const CSTYLE = script?.getAttribute('bm-cStyle')||'';
  const fetchedBlobQueue = new Map();

  window.addEventListener('message', e=>{
    const { source, endpoint, blobID, blobData, blink } = e.data;
    const elapsed = Date.now()-blink;
    console.groupCollapsed(`%c${NAME}%c: ${fetchedBlobQueue.size} Recieved IMAGE message about blob "${blobID}"`, CSTYLE, '');
    console.log(`Blob fetch took %c${String(Math.floor(elapsed/60000)).padStart(2,'0')}:${String(Math.floor(elapsed/1000)%60).padStart(2,'0')}.${String(elapsed%1000).padStart(3,'0')}%c MM:SS.mmm`, CSTYLE,'');
    console.log(fetchedBlobQueue);
    console.groupEnd();

    if (source==='blue-marble' && blobID && blobData && !endpoint){
      const cb = fetchedBlobQueue.get(blobID);
      if (typeof cb==='function') cb(blobData);
      else console.warn(`${NAME}: Attempted to retrieve a blob (${blobID}) but blobID wasn't a function.`);
      fetchedBlobQueue.delete(blobID);
    }
  });

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch.apply(this,args);
    const cloned = response.clone();
    const endpointName = ((args[0] instanceof Request) ? args[0]?.url : args[0]) || 'ignore';
    const contentType = cloned.headers.get('content-type')||'';

    if (contentType.includes('application/json')){
      console.log(`%c${NAME}%c: Sending JSON message about endpoint "${endpointName}"`, CSTYLE,'');
      cloned.json().then(jsonData=>{
        window.postMessage({ source:'blue-marble', endpoint: endpointName, jsonData }, '*');
      }).catch(err=> console.error(`%c${NAME}%c: Failed to parse JSON: `, CSTYLE,'', err));
    } else if (contentType.includes('image/') && !endpointName.includes('openfreemap') && !endpointName.includes('maps')){
      const blink = Date.now();
      const blob = await cloned.blob();
      console.log(`%c${NAME}%c: ${fetchedBlobQueue.size} Sending IMAGE message about endpoint "${endpointName}"`, CSTYLE,'');
      return new Promise(resolve=>{
        const id = crypto.randomUUID();
        fetchedBlobQueue.set(id, blobProcessed => {
          resolve(new Response(blobProcessed, { headers: cloned.headers, status: cloned.status, statusText: cloned.statusText }));
          console.log(`%c${NAME}%c: ${fetchedBlobQueue.size} Processed blob "${id}"`, CSTYLE,'');
        });
        window.postMessage({ source:'blue-marble', endpoint: endpointName, blobID: id, blobData: blob, blink }, '*');
      }).catch(exception=>{
        const elapsed = Date.now();
        console.error(`%c${NAME}%c: Failed to Promise blob!`, CSTYLE,'');
        console.groupCollapsed(`%c${NAME}%c: Details of failed blob Promise:`, CSTYLE,'');
        console.log(`Endpoint: ${endpointName}\nThere are ${fetchedBlobQueue.size} blobs processing...\nBlink: ${blink.toLocaleString()}\nTime Since Blink: ${String(Math.floor(elapsed/60000)).padStart(2,'0')}:${String(Math.floor(elapsed/1000) % 60).padStart(2,'0')}.${String(elapsed % 1000).padStart(3,'0')} MM:SS.mmm`);
        console.error(`Exception stack:`, exception);
        console.groupEnd();
      });
    }
    return response;
  };
});

/* --- resources & fonts --- */
GM_addStyle(GM_getResourceText("CSS-BM-File"));
(function preloadRobotoMono(){
  const l=document.createElement('link');
  l.href='https://fonts.googleapis.com/css2?family=Roboto+Mono:ital,wght@0,100..700;1,100..700&display=swap';
  l.rel='preload';
  l.as='style';
  l.onload=function(){this.onload=null;this.rel='stylesheet';};
  document.head?.appendChild(l);
})();

/* --- constructors & initial state --- */
const observers = new Observers();
const overlayMain = new Overlay(name, version);
const overlayTabTemplate = new Overlay(name, version);
const templateManager = new TemplateManager(name, version, overlayMain);
const apiManager = new ApiManager(templateManager);

overlayMain.setApiManager(apiManager);
apiManager.spontaneousResponseListener(overlayMain);
overlayMain.handleDrag('#bm-overlay', '#bm-bar-drag');

try{ templateManager.importJSON(JSON.parse(GM_getValue('bmTemplates','{}'))); }catch(_){}
const userSettings = JSON.parse(GM_getValue('bmUserSettings','{}'));
if (!Object.keys(userSettings).length){
  const uuid = crypto.randomUUID();
  GM.setValue('bmUserSettings', JSON.stringify({ uuid }));
}
setInterval(()=>apiManager.sendHeartbeat(version), 1000*60*30);

consoleLog(`%c${name}%c (${version}) userscript has loaded!`, 'color: cornflowerblue;', '');

/* --- helpers --- */
const $ = s => document.querySelector(s);
const setDisplay = (el, v) => { if(el) el.style.display = v; };
const toggleDisplayList = (selList, isMin) => selList.forEach(sel => document.querySelectorAll(sel).forEach(el=>el.style.display = isMin ? 'none' : ''));

/* --- observe black + add Move button --- */
function observeBlack(){
  const mo = new MutationObserver(()=> {
    const black = $('#color-1'); if (!black) return;
    if ($('#bm-button-move')) return;
    const move = document.createElement('button');
    move.id='bm-button-move'; move.textContent='Move ↑'; move.className='btn btn-soft';
    move.onclick=function(){
      const roundedBox = this.closest('div')?.parentNode?.parentNode?.parentNode || this.parentNode;
      const shouldMoveUp = (this.textContent=='Move ↑');
      roundedBox.parentNode.className = roundedBox.parentNode.className.replace(shouldMoveUp?'bottom':'top', shouldMoveUp?'top':'bottom');
      ['TopLeft','TopRight','BottomLeft','BottomRight'].forEach(c=>{
        roundedBox.style[`border${c}Radius`] = (shouldMoveUp && c.startsWith('Top')) ? '0px' : ((!shouldMoveUp && c.startsWith('Bottom')) ? '0px' : 'var(--radius-box)');
      });
      this.textContent = shouldMoveUp ? 'Move ↓' : 'Move ↑';
    };
    const anchor = black.closest('div')?.querySelector('h2');
    anchor?.parentNode?.appendChild(move);
  });
  mo.observe(document.body, { childList: true, subtree: true });
}
observeBlack();

/* --- build color list (global) --- */
window.buildColorFilterList = function(){
  const listContainer = $('#bm-colorfilter-list');
  const t = templateManager.templatesArray?.[0];
  if (!listContainer || !t?.colorPalette) { if (listContainer) listContainer.innerHTML = '<small>No template colors to display.</small>'; return; }
  listContainer.innerHTML = '';
  Object.entries(t.colorPalette).sort((a,b)=>b[1].count-a[1].count).forEach(([rgb,meta])=>{
    const [r,g,b] = rgb.split(',').map(Number);
    const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px'; row.style.margin='4px 0';
    const sw = document.createElement('div'); sw.style.width='14px'; sw.style.height='14px'; sw.style.border='1px solid rgba(255,255,255,0.5)'; sw.style.background=`rgb(${r},${g},${b})`;
    const label = document.createElement('span'); label.style.fontSize='12px';
    let labelText = `${meta.count.toLocaleString()}`;
    try {
      const tMeta = templateManager.templatesArray?.[0]?.rgbToMeta?.get(rgb);
      if (tMeta && typeof tMeta.id === 'number') {
        labelText = `#${tMeta.id} ${tMeta.premium ? '★ ' : ''}${(tMeta.name||`rgb(${r},${g},${b})`)} • ${labelText}`;
      }
    } catch(_) {}
    label.textContent = labelText;
    const toggle = document.createElement('input'); toggle.type='checkbox'; toggle.checked=!!meta.enabled;
    toggle.addEventListener('change', ()=>{
      meta.enabled = toggle.checked;
      overlayMain.handleDisplayStatus(`${toggle.checked ? 'Enabled' : 'Disabled'} ${rgb}`);
      try {
        const t = templateManager.templatesArray?.[0]; const key = t?.storageKey;
        if (t && key && templateManager.templatesJSON?.templates?.[key]) {
          templateManager.templatesJSON.templates[key].palette = t.colorPalette;
          GM.setValue('bmTemplates', JSON.stringify(templateManager.templatesJSON));
        }
      } catch(_) {}
    });
    [toggle, sw, label].forEach(n=>row.appendChild(n));
    listContainer.appendChild(row);
  });
};

/* --- listen for palette rebuild event --- */
window.addEventListener('message', e => { if (e?.data?.bmEvent === 'bm-rebuild-color-list') try{ buildColorFilterList(); } catch(_){} });

/* --- UI: main overlay --- */
function buildOverlayMain(){
  let isMinimized=false;
  let savedCoords={};
  try{ savedCoords = JSON.parse(GM_getValue('bmCoords','{}')) || {}; }catch(_){ savedCoords = {}; }
  const persistCoords = ()=> {
    try{
      const tx = Number($('#bm-input-tx')?.value||'');
      const ty = Number($('#bm-input-ty')?.value||'');
      const px = Number($('#bm-input-px')?.value||'');
      const py = Number($('#bm-input-py')?.value||'');
      GM.setValue('bmCoords', JSON.stringify({tx,ty,px,py}));
    }catch(_){}
  };

  overlayMain
    .addDiv({'id':'bm-overlay','style':'top: 10px; right: 75px;'})
      .addDiv({'id':'bm-contain-header'})
        .addDiv({'id':'bm-bar-drag'}).buildElement()
        .addImg({'alt':'Blue Marble Icon - Click to minimize/maximize','src':'https://raw.githubusercontent.com/SwingTheVine/Wplace-BlueMarble/main/dist/assets/Favicon.png','style':'cursor: pointer;'},
          (instance,img)=>{
            img.addEventListener('click',()=>{
              isMinimized = !isMinimized;
              const overlay = $('#bm-overlay'), header = $('#bm-contain-header'), dragBar = $('#bm-bar-drag');
              const coordsContainer = $('#bm-contain-coords'), coordsButton = $('#bm-button-coords');
              const createButton = $('#bm-button-create'), enableButton = $('#bm-button-enable'), disableButton = $('#bm-button-disable');
              const coordInputs = document.querySelectorAll('#bm-contain-coords input');
              if (!isMinimized){
                overlay.style.width="auto"; overlay.style.maxWidth="300px"; overlay.style.minWidth="200px"; overlay.style.padding="10px";
              }
              const elementsToToggle = [
                '#bm-overlay h1', '#bm-contain-userinfo', '#bm-overlay hr',
                '#bm-contain-automation > *:not(#bm-contain-coords)', '#bm-input-file-template',
                '#bm-contain-buttons-action', `#${instance.outputStatusId}`, '#bm-contain-colorfilter'
              ];
              toggleDisplayList(elementsToToggle, isMinimized);
              if (isMinimized){
                coordsContainer && (coordsContainer.style.display='none');
                coordsButton && (coordsButton.style.display='none');
                createButton && (createButton.style.display='none');
                enableButton && (enableButton.style.display='none');
                disableButton && (disableButton.style.display='none');
                coordInputs.forEach(i=>i.style.display='none');
                overlay.style.width='60px'; overlay.style.height='76px'; overlay.style.maxWidth='60px'; overlay.style.minWidth='60px'; overlay.style.padding='8px';
                img.style.marginLeft='3px'; header.style.textAlign='center'; header.style.margin='0'; header.style.marginBottom='0';
                if (dragBar){ dragBar.style.display=''; dragBar.style.marginBottom='0.25em'; }
              } else {
                coordsContainer && (['display','flexDirection','justifyContent','alignItems','gap','textAlign','margin'].forEach(k=>coordsContainer.style[k]=''));
                coordsButton && (coordsButton.style.display='');
                [createButton, enableButton, disableButton].forEach(b=>{ if (b){ b.style.display=''; b.style.marginTop=''; }});
                coordInputs.forEach(i=>i.style.display='');
                img.style.marginLeft=''; overlay.style.padding='10px'; header.style.textAlign=''; header.style.margin=''; header.style.marginBottom='';
                if (dragBar) dragBar.style.marginBottom='0.5em';
                overlay.style.width=''; overlay.style.height='';
              }
              img.alt = isMinimized ? 'Blue Marble Icon - Minimized (Click to maximize)' : 'Blue Marble Icon - Maximized (Click to minimize)';
            });
          }
        ).buildElement()
        .addHeader(1, {'textContent': name}).buildElement()
      .buildElement()

      .addHr().buildElement()

      .addDiv({'id':'bm-contain-userinfo'})
        .addP({'id':'bm-user-name','textContent':'Username:'}).buildElement()
        .addP({'id':'bm-user-droplets','textContent':'Droplets:'}).buildElement()
        .addP({'id':'bm-user-nextlevel','textContent':'Next level in...'}).buildElement()
      .buildElement()

      .addHr().buildElement()

      .addDiv({'id':'bm-contain-automation'})
        .addDiv({'id':'bm-contain-coords'})
          .addButton({'id':'bm-button-coords','className':'bm-help','style':'margin-top: 0;','innerHTML':'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 6"><circle cx="2" cy="2" r="2"></circle><path d="M2 6 L3.7 3 L0.3 3 Z"></path><circle cx="2" cy="2" r="0.7" fill="white"></circle></svg>'},
            (instance,button)=>{ button.onclick = ()=> {
                const coords = instance.apiManager?.coordsTilePixel;
                if (!coords?.[0]) { instance.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?'); return; }
                instance.updateInnerHTML('bm-input-tx', coords?.[0] || '');
                instance.updateInnerHTML('bm-input-ty', coords?.[1] || '');
                instance.updateInnerHTML('bm-input-px', coords?.[2] || '');
                instance.updateInnerHTML('bm-input-py', coords?.[3] || '');
                persistCoords();
              };
            }
          ).buildElement()
          .addInput({'type':'number','id':'bm-input-tx','placeholder':'Tl X','min':0,'max':2047,'step':1,'required':true,'value':(savedCoords.tx ?? '')},
            (instance,input)=>{
              input.addEventListener('paste', e=>{
                let splitText = (e.clipboardData||window.clipboardData).getData('text').split(' ').filter(n=>n).map(Number).filter(n=>!isNaN(n));
                if (splitText.length !== 4) return;
                let coords = selectAllCoordinateInputs(document);
                for (let i=0;i<coords.length;i++) coords[i].value = splitText[i];
                e.preventDefault();
              });
              ['input','change'].forEach(ev=>input.addEventListener(ev, ()=>persistCoords()));
            }
          ).buildElement()
          .addInput({'type':'number','id':'bm-input-ty','placeholder':'Tl Y','min':0,'max':2047,'step':1,'required':true,'value':(savedCoords.ty ?? '')},
            (instance,input)=>['input','change'].forEach(ev=>input.addEventListener(ev, ()=>persistCoords()))
          ).buildElement()
          .addInput({'type':'number','id':'bm-input-px','placeholder':'Px X','min':0,'max':2047,'step':1,'required':true,'value':(savedCoords.px ?? '')},
            (instance,input)=>['input','change'].forEach(ev=>input.addEventListener(ev, ()=>persistCoords()))
          ).buildElement()
          .addInput({'type':'number','id':'bm-input-py','placeholder':'Px Y','min':0,'max':2047,'step':1,'required':true,'value':(savedCoords.py ?? '')},
            (instance,input)=>['input','change'].forEach(ev=>input.addEventListener(ev, ()=>persistCoords()))
          ).buildElement()
        .buildElement()

        .addDiv({'id':'bm-contain-colorfilter','style':'max-height:140px; overflow:auto; border:1px solid rgba(255,255,255,0.1); padding:4px; border-radius:4px; display:none;'})
          .addDiv({'style':'display:flex; gap:6px; margin-bottom:6px;'})
            .addButton({'id':'bm-button-colors-enable-all','textContent':'Enable All'}, (inst,btn)=>{ btn.onclick=()=>{
              const t = templateManager.templatesArray[0]; if (!t?.colorPalette) return; Object.values(t.colorPalette).forEach(v=>v.enabled=true); buildColorFilterList(); inst.handleDisplayStatus('Enabled all colors');
            }; }).buildElement()
            .addButton({'id':'bm-button-colors-disable-all','textContent':'Disable All'}, (inst,btn)=>{ btn.onclick=()=>{
              const t = templateManager.templatesArray[0]; if (!t?.colorPalette) return; Object.values(t.colorPalette).forEach(v=>v.enabled=false); buildColorFilterList(); inst.handleDisplayStatus('Disabled all colors');
            }; }).buildElement()
          .buildElement()
          .addDiv({'id':'bm-colorfilter-list'}).buildElement()
        .buildElement()

        .addInputFile({'id':'bm-input-file-template','textContent':'Upload Template','accept':'image/png, image/jpeg, image/webp, image/bmp, image/gif'}).buildElement()
        .addDiv({'id':'bm-contain-buttons-template'})
          .addButton({'id':'bm-button-enable','textContent':'Enable'}, (inst,btn)=>{ btn.onclick = ()=>{ inst.apiManager?.templateManager?.setTemplatesShouldBeDrawn(true); inst.handleDisplayStatus(`Enabled templates!`); }; }).buildElement()
          .addButton({'id':'bm-button-create','textContent':'Create'}, (inst,btn)=>{ btn.onclick = ()=>{
            const input = $('#bm-input-file-template');
            const coordTlX = $('#bm-input-tx'), coordTlY = $('#bm-input-ty'), coordPxX = $('#bm-input-px'), coordPxY = $('#bm-input-py');
            if (!coordTlX.checkValidity()){coordTlX.reportValidity(); inst.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?'); return;}
            if (!coordTlY.checkValidity()){coordTlY.reportValidity(); inst.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?'); return;}
            if (!coordPxX.checkValidity()){coordPxX.reportValidity(); inst.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?'); return;}
            if (!coordPxY.checkValidity()){coordPxY.reportValidity(); inst.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?'); return;}
            if (!input?.files[0]) { inst.handleDisplayError(`No file selected!`); return; }
            templateManager.createTemplate(input.files[0], input.files[0]?.name.replace(/\.[^/.]+$/, ''), [Number(coordTlX.value), Number(coordTlY.value), Number(coordPxX.value), Number(coordPxY.value)]);
            inst.handleDisplayStatus(`Drew to canvas!`);
          }; }).buildElement()
          .addButton({'id':'bm-button-disable','textContent':'Disable'}, (inst,btn)=>{ btn.onclick = ()=>{ inst.apiManager?.templateManager?.setTemplatesShouldBeDrawn(false); inst.handleDisplayStatus(`Disabled templates!`); }; }).buildElement()
        .buildElement()

        .addTextarea({'id': overlayMain.outputStatusId, 'placeholder': `Status: Sleeping...\nVersion: ${version}`, 'readOnly': true}).buildElement()

        .addDiv({'id':'bm-contain-buttons-action'})
          .addDiv()
            .addButton({'id':'bm-button-convert','className':'bm-help','innerHTML':'🎨','title':'Template Color Converter'}, (inst,btn)=>btn.addEventListener('click',()=>window.open('https://pepoafonso.github.io/color_converter_wplace/','_blank','noopener noreferrer'))).buildElement()
            .addButton({'id':'bm-button-website','className':'bm-help','innerHTML':'🌐','title':'Official Blue Marble Website'}, (inst,btn)=>btn.addEventListener('click',()=>window.open('https://bluemarble.camilledaguin.fr/','_blank','noopener noreferrer'))).buildElement()
          .buildElement()
          .addSmall({'textContent':'Made by SwingTheVine - ENHANCED By lolo34dr','style':'margin-top:auto;'}).buildElement()
        .buildElement()
      .buildElement()
    .buildOverlay(document.body);
}

/* --- telemetry overlay --- */
function buildTelemetryOverlay(overlay){
  overlay.addDiv({'id':'bm-overlay-telemetry','style':'top:0; left:0; width:100vw; height:100vh; z-index:9999;'})
    .addDiv({'id':'bm-contain-all-telemetry','style':'display:flex; flex-direction:column; align-items:center;'})
      .addDiv({'id':'bm-contain-header-telemetry','style':'margin-top:10%;'}).addHeader(1, {'textContent': `${name} Telemetry`}).buildElement().buildElement()
      .addDiv({'id':'bm-contain-telemetry','style':'max-width:50%; overflow-y:auto; max-height:80vh;'})
        .addHr().buildElement().addBr().buildElement()
        .addDiv({'style':'width:fit-content; margin:auto; text-align:center;'})
          .addButton({'id':'bm-button-telemetry-more','textContent':'More Information'}, (inst,btn)=>btn.onclick = ()=>window.open('https://github.com/SwingTheVine/Wplace-TelemetryServer#telemetry-data','_blank','noopener noreferrer')).buildElement()
        .buildElement()
        .addBr().buildElement()
        .addDiv({'style':'width:fit-content; margin:auto; text-align:center;'})
          .addButton({'id':'bm-button-telemetry-enable','textContent':'Enable Telemetry','style':'margin-right:2ch;'}, (inst,btn)=>btn.onclick=()=>{
            const s=JSON.parse(GM_getValue('bmUserSettings','{}')); s.telemetry=1; GM.setValue('bmUserSettings', JSON.stringify(s)); $('#bm-overlay-telemetry') && ($('#bm-overlay-telemetry').style.display='none');
          }).buildElement()
          .addButton({'id':'bm-button-telemetry-disable','textContent':'Disable Telemetry'}, (inst,btn)=>btn.onclick=()=>{
            const s=JSON.parse(GM_getValue('bmUserSettings','{}')); s.telemetry=0; GM.setValue('bmUserSettings', JSON.stringify(s)); $('#bm-overlay-telemetry') && ($('#bm-overlay-telemetry').style.display='none');
          }).buildElement()
        .buildElement()
        .addBr().buildElement()
        .addP({'textContent':'We collect anonymous telemetry data such as your browser, OS, and script version to make the experience better for everyone. The data is never shared personally. The data is never sold. You can turn this off by pressing the \'Disable\' button, but keeping it on helps us improve features and reliability faster. Thank you for supporting the Blue Marble!'}).buildElement()
        .addP({'textContent':'You can disable telemetry by pressing the "Disable" button below.'}).buildElement()
      .buildElement()
    .buildElement()
  .buildOverlay(document.body);
}

/* --- overlay tab template minimal --- */
function buildOverlayTabTemplate(){
  overlayTabTemplate.addDiv({'id':'bm-tab-template','style':'top:20%; left:10%;'})
    .addDiv()
      .addDiv({'className':'bm-dragbar'}).buildElement()
      .addButton({'className':'bm-button-minimize','textContent':'↑'}, (inst,btn)=>{ btn.onclick=()=>{ btn.textContent = btn.textContent == '↑' ? '↓' : '↑'; }; }).buildElement()
    .buildElement()
  .buildOverlay();
}

/* --- telemetry notice logic --- */
if ((userSettings?.telemetry === undefined) || (userSettings?.telemetry > 1)) {
  const telemetryOverlay = new Overlay(name, version);
  telemetryOverlay.setApiManager(apiManager);
  buildTelemetryOverlay(telemetryOverlay);
}

/* --- finish build & initial color UI --- */
buildOverlayMain();
buildOverlayTabTemplate();

setTimeout(()=> {
  try {
    if (templateManager.templatesArray?.length > 0) {
      const cu = $('#bm-contain-colorfilter');
      if (cu) cu.style.display = '';
      buildColorFilterList();
    }
  } catch(_) {}
}, 0);
