// ==UserScript==
// @name         Meesho + Flipkart AutoFill PRO v2
// @namespace    meesho-flipkart-tool
// @version      2.0
// @description  Best auto-fill: delay + React-safe + score matching + PRO JSON. Extension nahi hai to ye use karo.
// @match        https://supplier.meesho.com/*
// @match        https://seller.flipkart.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==
(function(){
'use strict';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function log(m){const e=document.getElementById('mf-pro-log');if(e)e.innerText=m;console.log('[MF-PRO]',m);}
function reactSet(el,val){
  el.focus();el.scrollIntoView({block:'center'});
  if(el.tagName==='SELECT'){[...el.options].forEach(o=>{if(o.text.toLowerCase().includes(String(val).toLowerCase().slice(0,12)))el.value=o.value;});el.dispatchEvent(new Event('change',{bubbles:true}));return;}
  try{const p=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(el,val);}catch(e){el.value=val;}
  el.dispatchEvent(new InputEvent('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
  el.style.outline='2px solid #00c853';setTimeout(()=>el.style.outline='',1500);
}
function score(el,keys){
  const hay=((el.placeholder||'')+' '+(el.name||'')+' '+(el.id||'')+' '+(el.getAttribute('aria-label')||'')).toLowerCase();
  let s=0;for(const k of keys)if(hay.includes(k.toLowerCase()))s+=3;
  let p=el;for(let i=0;i<4&&p;i++){p=p.parentElement;if(!p)break;const t=(p.innerText||'').toLowerCase().slice(0,300);for(const k of keys)if(t.includes(k.toLowerCase())){s+=1;break;}}
  return s;
}
function findBest(keys){
  const all=[...document.querySelectorAll('input:not([type=hidden]):not([type=file]),textarea,select')].filter(e=>e.offsetParent!==null);
  let best=null,bs=0;for(const el of all){const r=score(el,keys);if(r>bs){bs=r;best=el;}}return bs>0?best:null;
}
const MAP={meeshoTitle:['product name','product title','title'],description:['description'],mrp:['mrp','maximum retail'],selling:['selling price','sale price','price'],hsn:['hsn'],gst:['gst','tax'],weightGrams:['weight','dead weight'],length:['length'],breadth:['breadth','width'],height:['height'],colors:['colour','color'],sizes:['size'],fabric:['fabric','material'],country:['country of origin','country'],manufacturer:['manufactured by','manufacturer'],keywords:['keyword','search','tags']};
async function fillAll(profile,site){
  if(site==='flipkart'&&profile.flipkartTitle)profile={...profile,meeshoTitle:profile.flipkartTitle};
  let ok=0,miss=[];
  for(const [f,keys] of Object.entries(MAP)){
    let v=profile[f];if(v===undefined||v==='')continue;if(Array.isArray(v))v=v.join(', ');
    const el=findBest(keys);
    if(el){reactSet(el,String(v));ok++;log('Filling '+f+' ('+ok+')');await sleep(350);}else miss.push(f);
  }
  log('Done! Filled '+ok+'. Missed: '+(miss.join(', ')||'none'));
}
function panel(){
  if(document.getElementById('mf-pro-panel'))return;
  const d=document.createElement('div');d.id='mf-pro-panel';
  d.style.cssText='position:fixed;right:12px;bottom:12px;z-index:999999;background:#fff;border:2px solid #6c00ff;border-radius:12px;padding:12px;width:310px;font-family:Arial;font-size:13px;box-shadow:0 4px 20px rgba(0,0,0,.35)';
  d.innerHTML='<b>AutoFill PRO v2</b><br><textarea id="mf-pro-json" style="width:100%;height:90px;font-size:11px" placeholder="PRO JSON paste karo"></textarea><div style="display:flex;gap:6px;margin-top:8px"><button id="mf-pro-m" style="flex:1;background:#f43397;color:#fff;border:0;border-radius:8px;padding:9px;font-weight:700">Meesho Fill</button><button id="mf-pro-f" style="flex:1;background:#2874f0;color:#fff;border:0;border-radius:8px;padding:9px;font-weight:700">Flipkart Fill</button></div><div id="mf-pro-log" style="margin-top:8px;font-size:12px"></div>';
  document.body.appendChild(d);
  document.getElementById('mf-pro-m').onclick=async()=>{try{const j=JSON.parse(document.getElementById('mf-pro-json').value);GM_setValue('profile',JSON.stringify(j));await fillAll(j,'meesho');}catch(e){log('JSON error: '+e.message);}};
  document.getElementById('mf-pro-f').onclick=async()=>{try{const j=JSON.parse(document.getElementById('mf-pro-json').value);GM_setValue('profile',JSON.stringify(j));await fillAll(j,'flipkart');}catch(e){log('JSON error: '+e.message);}};
  try{const s=GM_getValue('profile','');if(s)document.getElementById('mf-pro-json').value=s;}catch(e){}
}
setInterval(panel,2500);panel();
})();
