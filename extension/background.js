/* ============================================================
   Meesho Product Pro - background service worker
   Image fetch/optimize, downloads, seller tab opening, badge.
   ============================================================ */

const IMAGE_MAX_DIM = 1600;
const IMAGE_QUALITY = 0.9;

function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  return 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + bytesToBase64(buf);
}

async function optimizeImage(blob, opts) {
  const o = opts || {};
  if (!blob || !/^image\//i.test(blob.type || '')) return blob;
  if (/gif|svg/i.test(blob.type)) return blob;

  try {
    const maxDim = Number(o.maxDim) || IMAGE_MAX_DIM;
    const quality = Number(o.quality) || IMAGE_QUALITY;
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const needsResize = scale < 1;
    const needsShrink = blob.size > 750 * 1024;
    if (!needsResize && !needsShrink) {
      if (bmp.close) bmp.close();
      return blob;
    }

    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();

    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return out.size < blob.size ? out : blob;
  } catch (e) {
    return blob;
  }
}

async function fetchImageBlob(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('Invalid image URL');
  const res = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
  if (!res.ok) throw new Error('Image HTTP ' + res.status);
  return res.blob();
}

/* ------------------------------------------------------------
   Image pack cache
   Product photos ek baar download ho kar cache me rehti hain.
   Isse share-link / seller upload me CDN URL expire hone par bhi
   images attach ho jati hain (aur upload fast hota hai).
   ------------------------------------------------------------ */

const SESSION_PREFIX = 'mpimg:';
const MEM_LIMIT = 24;
const MEM_CACHE = new Map(); // url -> {dataUrl, mime, size}
const INFLIGHT = new Map(); // url -> Promise<entry>

function hashUrl(url) {
  let h = 5381;
  const s = String(url || '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

async function cacheGet(url) {
  if (!url) return null;
  if (MEM_CACHE.has(url)) return MEM_CACHE.get(url);
  try {
    if (chrome.storage && chrome.storage.session) {
      const key = SESSION_PREFIX + hashUrl(url);
      const got = await chrome.storage.session.get(key);
      const hit = got && got[key];
      if (hit && hit.dataUrl) {
        MEM_CACHE.set(url, hit);
        return hit;
      }
    }
  } catch (e) {
    /* session storage unavailable */
  }
  return null;
}

async function cachePut(url, entry) {
  if (!url || !entry || !entry.dataUrl) return;
  MEM_CACHE.set(url, entry);
  while (MEM_CACHE.size > MEM_LIMIT) {
    const first = MEM_CACHE.keys().next().value;
    MEM_CACHE.delete(first);
  }
  try {
    if (chrome.storage && chrome.storage.session) {
      const key = SESSION_PREFIX + hashUrl(url);
      await chrome.storage.session.set({ [key]: entry });
    }
  } catch (e) {
    /* quota / unavailable - memory cache still works */
  }
}

async function loadImageEntry(url, opts) {
  const o = opts || {};
  const cached = await cacheGet(url);
  if (cached) return Object.assign({ cached: true }, cached);

  if (INFLIGHT.has(url)) return INFLIGHT.get(url);

  const job = (async () => {
    try {
      const blob = await fetchImageBlob(url);
      const finalBlob = o.optimize === false ? blob : await optimizeImage(blob, o);
      const entry = {
        dataUrl: await blobToDataUrl(finalBlob),
        mime: finalBlob.type || blob.type || 'image/jpeg',
        size: finalBlob.size || 0
      };
      await cachePut(url, entry);
      return entry;
    } finally {
      INFLIGHT.delete(url);
    }
  })();

  INFLIGHT.set(url, job);
  return job;
}

async function handleFetchImage(msg) {
  const entry = await loadImageEntry(msg.url, msg);
  return Object.assign({ ok: true }, entry);
}

async function handleCacheImages(msg) {
  const urls = (msg.urls || []).filter((u) => /^https?:\/\//i.test(String(u || ''))).slice(0, 20);
  if (!urls.length) return { ok: false, error: 'Koi image URL nahi mila.' };

  let cached = 0;
  const failed = [];
  const limit = Math.max(1, Math.min(4, Number(msg.concurrency) || 2));
  let index = 0;

  async function worker() {
    while (index < urls.length) {
      const url = urls[index++];
      try {
        const entry = await loadImageEntry(url, { maxDim: 1600, quality: 0.9 });
        if (entry && entry.dataUrl) cached++;
      } catch (e) {
        failed.push(url);
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return { ok: cached > 0, cached, total: urls.length, failed: failed.length };
}

async function clearImageCache() {
  MEM_CACHE.clear();
  INFLIGHT.clear();
  try {
    if (chrome.storage && chrome.storage.session) {
      const all = await chrome.storage.session.get(null);
      const keys = Object.keys(all || {}).filter((k) => k.indexOf(SESSION_PREFIX) === 0);
      if (keys.length) await chrome.storage.session.remove(keys);
    }
  } catch (e) {
    /* ignore */
  }
  return { ok: true };
}

async function cacheStats() {
  let count = MEM_CACHE.size;
  try {
    if (chrome.storage && chrome.storage.session) {
      const all = await chrome.storage.session.get(null);
      count = Object.keys(all || {}).filter((k) => k.indexOf(SESSION_PREFIX) === 0).length;
    }
  } catch (e) {
    /* ignore */
  }
  return { ok: true, count };
}

async function handleDownloadImage(msg) {
  let targetUrl = msg.url;
  let downloadedBlob = null;
  try {
    downloadedBlob = await fetchImageBlob(msg.url);
    const optimized = await optimizeImage(downloadedBlob, { maxDim: 1800, quality: 0.92 });
    targetUrl = await blobToDataUrl(optimized);
  } catch (e) {
    // fall back to the CDN url directly
    targetUrl = msg.url;
  }

  let id;
  try {
    id = await chrome.downloads.download({
      url: targetUrl,
      filename: msg.filename || 'Meesho/image.jpg',
      saveAs: false,
      conflictAction: 'uniquify'
    });
  } catch (e) {
    if (targetUrl !== msg.url) {
      id = await chrome.downloads.download({
        url: msg.url,
        filename: msg.filename || 'Meesho/image.jpg',
        saveAs: false,
        conflictAction: 'uniquify'
      });
    } else {
      throw e;
    }
  }
  return { ok: true, id, size: downloadedBlob ? downloadedBlob.size : 0 };
}

async function openSellerTab() {
  const patterns = ['https://supplier.meesho.com/*', 'https://seller.flipkart.com/*'];
  const tabs = await chrome.tabs.query({ url: patterns });
  if (tabs && tabs.length) {
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    try {
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (e) {
      /* window may be gone */
    }
    return { ok: true, tabId: tab.id, opened: false };
  }
  const created = await chrome.tabs.create({ url: 'https://supplier.meesho.com/' });
  return { ok: true, tabId: created.id, opened: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  (async () => {
    try {
      if (msg.type === 'fetch-image') {
        sendResponse(await handleFetchImage(msg));
        return;
      }
      if (msg.type === 'cache-images') {
        sendResponse(await handleCacheImages(msg));
        return;
      }
      if (msg.type === 'image-cache-stats') {
        sendResponse(await cacheStats());
        return;
      }
      if (msg.type === 'clear-image-cache') {
        sendResponse(await clearImageCache());
        return;
      }
      if (msg.type === 'download-image') {
        sendResponse(await handleDownloadImage(msg));
        return;
      }
      if (msg.type === 'open-seller') {
        sendResponse(await openSellerTab());
        return;
      }
      if (msg.type === 'product-captured') {
        if (sender && sender.tab && sender.tab.id != null) {
          const text = msg.images ? String(msg.images).slice(0, 4) : '\u2713';
          chrome.action.setBadgeBackgroundColor({ color: '#0a7d2c', tabId: sender.tab.id });
          chrome.action.setBadgeText({ text, tabId: sender.tab.id });
        }
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'clear-badge') {
        if (sender && sender.tab && sender.tab.id != null) {
          chrome.action.setBadgeText({ text: '', tabId: sender.tab.id });
        }
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (e) {
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  })();

  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});
