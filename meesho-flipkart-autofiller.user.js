// ==UserScript==
// @name         Meesho + Flipkart Product Auto-Fill
// @namespace    meesho-flipkart-tool
// @version      1.0
// @description  supplier.meesho.com aur seller.flipkart.com par Add Product form auto-fill karo. Tool se Export JSON paste karo.
// @match        https://supplier.meesho.com/*
// @match        https://seller.flipkart.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function(){
'use strict';
function log(m){const el=document.getElementById('mf-log');if(el){el.innerText=m;console.log('[AutoFill]',m);}}

function setNative(el,val){
  if(!el) return false;
  el.focus();
  const setter=Object.getOwnPropertyDescriptor(el.__proto__,'value')?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
  // select handling
  if(el.tagName==='SELECT'){
    [...el.options].forEach(o=>{if(o.text.toLowerCase().includes(String(val).toLowerCase())||o.value==val) el.value=o.value;});
    el.dispatchEvent(new Event('change',{bubbles:true})); return true;
  }
  try{
    const proto = el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el,val);
  }catch(e){el.value=val;}
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
}

function findField(keys){
  // keys = ['product name','title',...]
  const all=[...document.querySelectorAll('input,textarea,select')];
  for(const k of keys){
    const kl=k.toLowerCase();
    // 1. by placeholder/name/id
    for(const el of all){
      const hay=((el.placeholder||'')+' '+(el.name||'')+' '+(el.id||'')+' '+((el.getAttribute('aria-label'))||'')).toLowerCase();
      if(hay.includes(kl)){return el;}
    }
    // 2. by label text nearby
    const labels=[...document.querySelectorAll('label,span,div,p')].filter(e=>e.innerText&&e.innerText.toLowerCase().includes(kl)&&e.innerText.length<80);
    for(const lb of labels){
      const box=lb.closest('div');
      if(box){const inp=box.querySelector('input,textarea,select');if(inp)return inp;}
      const nxt=lb.nextElementSibling;if(nxt&&(nxt.tagName==='INPUT'||nxt.tagName==='TEXTAREA'))return nxt;
    }
  }
  return null;
}

function fillSite(profile, map){
  let ok=0,fail=[];
  for(const [field,keys] of Object.entries(map)){
    const val=profile[field];
    if(val===undefined||val==='')continue;
    const el=findField(keys);
    if(el){setNative(el,val);ok++;}
    else fail.push(field);
  }
  log('Filled '+ok+' fields. Missed: '+(fail.join(', ')||'none')+'. Missed wale manually paste karo.');
}

function meeshoMap(){
  return {
    productName:['product name','product title','title'],
    description:['description'],
    mrp:['mrp','maximum retail'],
    selling:['selling price','sale price','price'],
    hsn:['hsn'],
    gst:['gst','tax'],
    weight:['weight','dead weight'],
    length:['length'], breadth:['breadth','width'], height:['height'],
    color:['colour','color'],
    size:['size'],
    fabric:['fabric','material'],
    country:['country of origin','country'],
    manufacturer:['manufactured by','manufacturer'],
    keywords:['keywords','search keywords','tags']
  };
}
function flipkartMap(){return meeshoMap();}

function buildProfileFromToolJSON(j){
  // tool exports {category,subcat,fabric,colors,sizes,cost,selling,gst,pack,country,biz,addr}
  // plus generated fields if present, else build basic
  const p={};
  p.productName=(j.meeshoTitle||('Elegant '+j.fabric+' '+j.subcat)).slice(0,60);
  p.flipkartTitle=((j.biz||'')+' '+j.fabric+' '+(j.category||'')+' - '+j.subcat+', Pack of '+j.pack).slice(0,190);
  p.description='Add charm with this '+j.fabric+' '+j.category+'. '+j.subcat+' design, perfect for daily wear, office, festive. Pack of '+j.pack+'. Country: '+(j.country||'India');
  p.mrp=j.mrp||(Number(j.selling)===499?999:Math.round(Number(j.selling)*1.95));
  p.selling=j.selling; p.hsn=j.hsn||'5407'; p.gst=(j.gst||'5').toString().replace('%','');
  p.weight='400'; p.length='28'; p.breadth='22'; p.height='4';
  p.color=j.colors; p.size=j.sizes; p.fabric=j.fabric; p.country=j.country||'India';
  p.manufacturer='Manufactured by: '+j.biz+', '+j.addr;
  p.keywords=(j.fabric+', '+j.category+', '+j.subcat+', '+j.colors).slice(0,200);
  return p;
}

function panel(){
  if(document.getElementById('mf-panel'))return;
  const d=document.createElement('div');d.id='mf-panel';
  d.style.cssText='position:fixed;right:12px;bottom:12px;z-index:99999;background:#fff;border:2px solid #f43397;border-radius:12px;padding:12px;width:300px;box-shadow:0 4px 20px rgba(0,0,0,.3);font-family:Arial;font-size:13px;';
  d.innerHTML='<b>Meesho/Flipkart Auto-Fill</b><br><small>Tool se Export JSON copy karke yaha paste karo:</small><textarea id="mf-json" style="width:100%;height:80px;font-size:11px" placeholder=\'{"category":"Women Saree",...}\'></textarea><div style="display:flex;gap:6px;margin-top:8px"><button id="mf-meesho" style="flex:1;background:#f43397;color:#fff;border:0;border-radius:8px;padding:8px;font-weight:700">Meesho Fill</button><button id="mf-flip" style="flex:1;background:#2874f0;color:#fff;border:0;border-radius:8px;padding:8px;font-weight:700">Flipkart Fill</button></div><div id="mf-log" style="margin-top:8px;font-size:12px;color:#333"></div>';
  document.body.appendChild(d);
  document.getElementById('mf-meesho').onclick=()=>{
    try{const j=JSON.parse(document.getElementById('mf-json').value);const p=buildProfileFromToolJSON(j);GM_setValue('profile',JSON.stringify(j));fillSite(p,meeshoMap());}catch(e){log('JSON galat hai: '+e.message);}
  };
  document.getElementById('mf-flip').onclick=()=>{
    try{const j=JSON.parse(document.getElementById('mf-json').value);const p=buildProfileFromToolJSON(j);GM_setValue('profile',JSON.stringify(j));const pf={...p,productName:p.flipkartTitle};fillSite(pf,flipkartMap());}catch(e){log('JSON galat hai: '+e.message);}
  };
  const saved=GM_getValue('profile','');if(saved)document.getElementById('mf-json').value=saved;
}
setInterval(()=>{if(!document.getElementById('mf-panel'))panel();},2000);
panel();
})();
