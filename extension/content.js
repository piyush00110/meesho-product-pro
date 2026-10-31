// Meesho Flipkart AutoFill PRO v2 - content script
(function(){
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function status(m){const e=document.getElementById('mf-pro-log');if(e)e.innerText=m;console.log('[MF-PRO]',m);}

function reactSet(el,val){
  el.focus();el.scrollIntoView({block:'center'});
  if(el.tagName==='SELECT'){
    const opts=[...el.options];let hit=opts.find(o=>o.text.toLowerCase().includes(String(val).toLowerCase().slice(0,12))||o.value==val);
    if(hit)el.value=hit.value;else{el.value=val;}
    el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('input',{bubbles:true}));return;
  }
  if(el.isContentEditable){el.innerText=val;el.dispatchEvent(new InputEvent('input',{bubbles:true}));return;}
  try{
    const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const desc=Object.getOwnPropertyDescriptor(proto,'value');
    desc.set.call(el,val);
  }catch(e){el.value=val;}
  el.dispatchEvent(new InputEvent('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
  el.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true}));
  el.style.outline='2px solid #00c853';
  setTimeout(()=>el.style.outline='',1500);
}

function score(el,keys){
  const hay=((el.placeholder||'')+' '+(el.name||'')+' '+(el.id||'')+' '+(el.getAttribute('aria-label')||'')+' '+(el.className||'')).toLowerCase();
  let s=0,hit=null;
  for(const k of keys){if(hay.includes(k.toLowerCase())){s+=3;hit=k;}}
  // label/nearby text
  let p=el;for(let i=0;i<4&&p;i++){p=p.parentElement;if(!p)break;
    const t=(p.innerText||'').toLowerCase().slice(0,300);
    for(const k of keys){if(t.includes(k.toLowerCase())){s+=1;hit=hit||k;break;}}}
  return {s,hit};
}
function findBest(keys){
  const all=[...document.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable=true]')].filter(e=>e.offsetParent!==null);
  let best=null,bs=0;
  for(const el of all){const r=score(el,keys);if(r.s>bs){bs=r.s;best=el;}}
  return bs>0?best:null;
}

const MAP_MEESHO={
  meeshoTitle:['product name','product title','title'],
  description:['description','product description'],
  mrp:['mrp','maximum retail price'],
  selling:['selling price','sale price','price'],
  hsn:['hsn','hsn code'],
  gst:['gst','tax rate','gst rate'],
  weightGrams:['weight','dead weight','package weight'],
  length:['length'],breadth:['breadth','width'],height:['height'],
  colors:['colour','color','variant'],
  sizes:['size'],
  fabric:['fabric','material'],
  country:['country of origin','country'],
  manufacturer:['manufactured by','manufacturer'],
  keywords:['keyword','search term','tags']
};
const MAP_FLIP={...MAP_MEESHO,meeshoTitle:['product name','listing title','title']};

async function fillAll(profile,site){
  const map=site==='flipkart'?MAP_FLIP:MAP_MEESHO;
  // flipkart uses flipkartTitle as name
  if(site==='flipkart'&&profile.flipkartTitle)profile={...profile,meeshoTitle:profile.flipkartTitle};
  let ok=0,miss=[];
  for(const [f,keys] of Object.entries(map)){
    let v=profile[f];
    if(v===undefined||v===''||v===null)continue;
    if(Array.isArray(v))v=v.join(', ');
    const el=findBest(keys);
    if(el){reactSet(el,String(v));ok++;status('Filling '+f+' ... ('+ok+')');await sleep(300);}
    else miss.push(f);
  }
  status('Done! Filled '+ok+'. Missed: '+(miss.join(', ')||'none')+'. Missed wale tool se Copy karke paste karo.');
  return {ok,miss};
}

function ensurePanel(){
  if(document.getElementById('mf-pro-panel'))return;
  const d=document.createElement('div');d.id='mf-pro-panel';
  d.style.cssText='position:fixed;right:12px;bottom:12px;z-index:999999;background:#fff;border:2px solid #6c00ff;border-radius:12px;padding:12px;width:310px;font-family:Arial;font-size:13px;box-shadow:0 4px 20px rgba(0,0,0,.35)';
  d.innerHTML='<b>AutoFill PRO v2</b> <small id="mf-pro-site"></small><br><textarea id="mf-pro-json" style="width:100%;height:90px;font-size:11px" placeholder="PRO tool se Copy Extension JSON paste karo"></textarea><div style="display:flex;gap:6px;margin-top:8px"><button id="mf-pro-m" style="flex:1;background:#f43397;color:#fff;border:0;border-radius:8px;padding:9px;font-weight:700">Meesho Fill</button><button id="mf-pro-f" style="flex:1;background:#2874f0;color:#fff;border:0;border-radius:8px;padding:9px;font-weight:700">Flipkart Fill</button></div><div id="mf-pro-log" style="margin-top:8px;font-size:12px"></div>';
  document.body.appendChild(d);
  const host=location.hostname;
  document.getElementById('mf-pro-site').innerText=host.includes('meesho')?'(Meesho)':'(Flipkart)';
  try{chrome.storage.local.get('mfpro',r=>{if(r.mfpro)document.getElementById('mf-pro-json').value=r.mfpro;});}catch(e){}
  document.getElementById('mf-pro-m').onclick=async()=>{
    const t=document.getElementById('mf-pro-json').value;try{const j=JSON.parse(t);try{chrome.storage.local.set({mfpro:t});}catch(e){}await fillAll(j,'meesho');}catch(e){status('JSON error: '+e.message);}
  };
  document.getElementById('mf-pro-f').onclick=async()=>{
    const t=document.getElementById('mf-pro-json').value;try{const j=JSON.parse(t);try{chrome.storage.local.set({mfpro:t});}catch(e){}await fillAll(j,'flipkart');}catch(e){status('JSON error: '+e.message);}
  };
}
setInterval(ensurePanel,2500);ensurePanel();

// popup messages
try{
chrome.runtime.onMessage.addListener((msg,sender,send)=>{
  if(msg.action==='fill'){
    (async()=>{const r=await fillAll(msg.profile,msg.site);send(r);})();
    return true;
  }
});
}catch(e){}
window.MF_fill=fillAll;
})();
