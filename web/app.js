/* ============================================================
   Meesho Product Pro v6 - public website logic
   Pure browser JS, no dependencies, no inline handlers.
   Data source: data/catalog.json (built from data/shares.txt)
   Share links:  https://site/#mp=<gzip-base64url code>
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var FAV_KEY = 'mpFavProducts';
  var THEME_KEY = 'mpSiteTheme';
  var COMPARE_MAX = 3;

  var state = {
    catalog: [],
    products: [],
    generatedAt: '',
    query: '',
    category: '',
    sort: 'new',
    quick: 'all',
    favOnly: false,
    favs: new Set(),
    compare: [],
    current: null,
    galleryIndex: 0,
    loading: true,
    theme: 'system',
    deferredInstall: null
  };

  /* ---------------- helpers ---------------- */
  function inr(n) {
    var v = Number(n) || 0;
    return '\u20B9' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  function num(n) {
    var v = Number(n);
    return Number.isFinite(v) ? v : 0;
  }

  function discount(mrp, price) {
    var m = num(mrp);
    var p = num(price);
    if (m > p && m > 0) return Math.round((1 - p / m) * 100);
    return 0;
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }

  function timeAgo(ts) {
    var t = num(ts);
    if (!t) return '';
    if (t < 1e12) t *= 1000;
    var diff = Date.now() - t;
    if (diff < 0) diff = 0;
    var min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + 'm ago';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    var day = Math.floor(hr / 24);
    if (day < 31) return day + 'd ago';
    try {
      return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  function shortDate(ts) {
    var t = num(ts);
    var d;
    if (!t && ts) d = new Date(ts);
    else {
      if (t && t < 1e12) t *= 1000;
      d = new Date(t);
    }
    if (!d || isNaN(d.getTime())) return '\u2014';
    try {
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch (e) {
      return '\u2014';
    }
  }

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  var toastTimer = null;
  function toast(msg, kind) {
    var box = $('toasts');
    if (!box) return;
    var node = document.createElement('div');
    node.className = 'toast' + (kind === 'err' ? ' err' : '');
    var dot = document.createElement('i');
    node.appendChild(dot);
    var span = document.createElement('span');
    span.textContent = msg;
    node.appendChild(span);
    box.appendChild(node);
    while (box.childElementCount > 3) box.removeChild(box.firstElementChild);
    setTimeout(function () {
      node.classList.add('out');
      setTimeout(function () { node.remove(); }, 220);
    }, 2800);
    clearTimeout(toastTimer);
  }

  function copyText(text) {
    var value = String(text == null ? '' : text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value).then(
        function () { return true; },
        function () { return legacyCopy(value); }
      );
    }
    return Promise.resolve(legacyCopy(value));
  }

  function legacyCopy(value) {
    try {
      var ta = document.createElement('textarea');
      ta.value = value;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  function downloadText(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ---------------- share code decode ---------------- */
  function extractPayload(text) {
    var t = String(text || '').trim();
    if (!t) return '';
    if (/^[gj]1\./.test(t)) return t;
    if (t.charAt(0) === '{') return 'RAW:' + t;
    try {
      var u = new URL(t, location.href);
      var hash = u.hash.replace(/^#/, '');
      if (hash) {
        if (/^[gj]1\./.test(hash)) return hash;
        var hp = new URLSearchParams(hash);
        var hv = hp.get('mp') || hp.get('mpdata');
        if (hv) return hv;
      }
      var sv = u.searchParams.get('mp') || u.searchParams.get('mpdata');
      if (sv) return sv;
    } catch (e) {
      /* not a URL */
    }
    var m = t.match(/[#?&](?:mp|mpdata)=([^&\s]+)/);
    if (m) {
      try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
    }
    if (/^[A-Za-z0-9\-_]{40,}$/.test(t)) return t;
    return '';
  }

  function b64urlToBytes(b64) {
    var s = String(b64 || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function decodeShare(text) {
    var payload = extractPayload(text);
    if (!payload) return Promise.reject(new Error('Share link ya share code valid nahi hai.'));

    var jsonPromise;
    if (payload.indexOf('RAW:') === 0) {
      jsonPromise = Promise.resolve(payload.slice(4));
    } else {
      var dot = payload.indexOf('.');
      if (dot < 1) return Promise.reject(new Error('Share code ka format galat hai.'));
      var kind = payload.slice(0, dot);
      var bytes;
      try {
        bytes = b64urlToBytes(payload.slice(dot + 1));
      } catch (e) {
        return Promise.reject(new Error('Share code base64 galat hai.'));
      }
      if (kind === 'g1') {
        if (typeof DecompressionStream === 'undefined') {
          return Promise.reject(new Error('Browser purana hai. Chrome update karke try karo.'));
        }
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        jsonPromise = new Response(stream).text();
      } else {
        jsonPromise = Promise.resolve(new TextDecoder().decode(bytes));
      }
    }

    return jsonPromise.then(function (json) {
      if (!json || json.length > 4000000) throw new Error('Share data bahut bada hai.');
      var data = JSON.parse(json);
      var product = data.p || (data.title ? data : null);
      if (!product || !product.title) throw new Error('Share data me product nahi mila.');
      return {
        version: Number(data.v) || 1,
        createdAt: Number(data.t) || 0,
        product: product,
        profile: data.l && typeof data.l === 'object' ? data.l : null,
        settings: data.s && typeof data.s === 'object' ? data.s : null,
        meta: data.m && typeof data.m === 'object' ? data.m : null,
        code: payload.indexOf('RAW:') === 0 ? '' : payload
      };
    });
  }

  function shareLinkFor(code) {
    if (!code) return '';
    return location.origin + location.pathname + '#mp=' + encodeURIComponent(code);
  }

  /* ---------------- listing text ---------------- */
  function fallbackProfile(p, s) {
    var settings = s || {};
    var specs = p.specifications || {};
    var selling = num(settings.priceOverride) || num(p.price) || 0;
    var mrp = num(p.mrp) || 0;
    if (mrp < selling) mrp = selling;
    var colors = Array.isArray(p.colors) ? p.colors : [];
    var sizes = Array.isArray(p.sizes) ? p.sizes : [];
    return {
      title: p.title || '',
      meeshoTitle: p.title || '',
      brand: p.brand || settings.brand || 'Generic',
      category: p.category || '',
      subcat: p.subcategory || '',
      fabric: specs.Fabric || specs.Material || p.fabric || '',
      pattern: specs.Pattern || p.pattern || '',
      colors: colors.join(', '),
      colorList: colors,
      sizes: sizes.join(', '),
      sizeList: sizes,
      selling: selling,
      price: selling,
      mrp: mrp,
      discount: discount(mrp, selling),
      hsn: specs.HSN || settings.hsnDefault || '',
      gst: settings.gstMode && settings.gstMode !== 'auto' ? String(settings.gstMode) + '%' : specs.GST || '',
      weightText: p.weightText || '',
      dimText: p.dimText || '',
      description: p.description || '',
      highlights: Array.isArray(p.highlights) ? p.highlights : [],
      specifications: specs,
      keywords: p.keywords || '',
      images: Array.isArray(p.images) ? p.images : [],
      defaultStock: num(settings.defaultStock) || 20,
      sku: p.sku || '',
      pack: specs['Pack of'] || '1',
      country: settings.country || 'India',
      manufacturerName: settings.manufacturerName || settings.brand || p.brand || '',
      manufacturerAddress: settings.manufacturerAddress || '',
      care: specs['Care Instructions'] || specs['Wash Care'] || '',
      rating: p.rating || '',
      ratingCount: p.ratingCount || ''
    };
  }

  function listingText(item) {
    var p = (item && item.product) || {};
    var pr = (item && item.profile) || fallbackProfile(p, item && item.settings);
    var limit = Math.max(20, num((item && item.settings || {}).titleLimit) || 60);
    var title = pr.title || pr.meeshoTitle || p.title || '';
    var lines = [];
    var rule = '--------------------------------------------';
    lines.push('MEESHO LISTING - ' + (title || 'Untitled product'));
    lines.push(rule);
    lines.push('');
    lines.push('TITLE (' + String(title).length + '/' + limit + ')');
    lines.push(title || '-');
    lines.push('');
    lines.push('PRICE');
    lines.push('Selling: ' + inr(pr.selling || item.selling) + '   MRP: ' + inr(pr.mrp) + '   Discount: ' + (pr.discount || discount(pr.mrp, pr.selling || item.selling)) + '% OFF');
    lines.push('Stock: ' + (pr.defaultStock || 20) + '   SKU: ' + (pr.sku || '-'));
    lines.push('');
    lines.push('PRODUCT');
    lines.push('Brand: ' + (pr.brand || p.brand || '-'));
    lines.push('Category: ' + (pr.category || p.category || '-') + (pr.subcat ? ' / ' + pr.subcat : ''));
    if (pr.fabric) lines.push('Fabric: ' + pr.fabric);
    if (pr.pattern) lines.push('Pattern: ' + pr.pattern);
    if (pr.pack) lines.push('Pack of: ' + pr.pack);
    lines.push('Country: ' + (pr.country || 'India'));
    lines.push('');
    lines.push('VARIANTS');
    lines.push('Colours: ' + ((pr.colorList || p.colors || []).join(', ') || '-'));
    lines.push('Sizes: ' + ((pr.sizeList || p.sizes || []).join(', ') || '-'));
    lines.push('');
    lines.push('TAX & SHIPPING');
    lines.push('HSN: ' + (pr.hsn || '-') + '   GST: ' + (pr.gst || '-'));
    lines.push('Weight: ' + (pr.weightText || '-') + '   Dimensions: ' + (pr.dimText || '-'));
    lines.push('');
    lines.push('DESCRIPTION');
    lines.push(pr.description || p.description || '-');
    var highlights = pr.highlights || p.highlights || [];
    if (highlights.length) {
      lines.push('');
      lines.push('HIGHLIGHTS');
      highlights.forEach(function (h) { lines.push('- ' + h); });
    }
    var specs = Object.entries(pr.specifications || p.specifications || {});
    if (specs.length) {
      lines.push('');
      lines.push('SPECIFICATIONS');
      specs.forEach(function (entry) { lines.push(entry[0] + ': ' + entry[1]); });
    }
    if (pr.care) {
      lines.push('');
      lines.push('CARE');
      lines.push(pr.care);
    }
    if (pr.manufacturerName || pr.manufacturerAddress) {
      lines.push('');
      lines.push('MANUFACTURER');
      lines.push('Name: ' + (pr.manufacturerName || pr.brand || '-'));
      if (pr.manufacturerAddress) lines.push('Address: ' + pr.manufacturerAddress);
      lines.push('Country: ' + (pr.country || 'India'));
    }
    if (pr.keywords) {
      lines.push('');
      lines.push('KEYWORDS');
      lines.push(pr.keywords);
    }
    var images = pr.images || p.images || [];
    if (images.length) {
      lines.push('');
      lines.push('IMAGES (' + images.length + ')');
      images.forEach(function (u, i) { lines.push(i + 1 + '. ' + u); });
    }
    if (p.url) {
      lines.push('');
      lines.push('SOURCE');
      lines.push(p.url);
    }
    lines.push('');
    lines.push(rule);
    lines.push('Generated by Meesho Product Pro v6');
    return lines.join('\n');
  }

  /* ---------------- data ---------------- */
  function normalizeItem(raw) {
    var it = raw || {};
    var p = it.product || {};
    var pr = it.profile || {};
    var selling = num(it.selling) || num(p.price) || num(pr.selling);
    var mrp = num(p.mrp) || num(pr.mrp) || num(it.mrp);
    var images = (Array.isArray(p.images) ? p.images : []).filter(safeUrl);
    var image = safeUrl(it.image) || safeUrl(p.mainImage) || images[0] || '';
    var colors = Array.isArray(p.colors) ? p.colors : (Array.isArray(it.colors) ? it.colors : []);
    var sizes = Array.isArray(p.sizes) ? p.sizes : (Array.isArray(it.sizes) ? it.sizes : []);
    var createdAt = num(it.createdAt);
    if (createdAt && createdAt < 1e12) createdAt *= 1000;
    return {
      code: String(it.code || ''),
      createdAt: createdAt,
      title: String(it.title || p.title || 'Untitled product'),
      selling: selling,
      mrp: mrp,
      discount: discount(mrp, selling),
      brand: String(p.brand || pr.brand || it.brand || ''),
      category: String(p.category || it.category || ''),
      subcategory: String(p.subcategory || it.subcategory || ''),
      rating: String(p.rating || it.rating || ''),
      ratingCount: String(p.ratingCount || it.ratingCount || ''),
      image: image,
      images: images,
      photos: images.length,
      colors: colors,
      sizes: sizes,
      product: p,
      profile: it.profile || null,
      settings: it.settings || null,
      meta: it.meta || null,
      url: safeUrl(p.url),
      search: [
        it.title, p.title, p.brand, p.category, p.subcategory, p.description, p.keywords,
        colors.join(' '), sizes.join(' '),
        Object.keys(p.specifications || {}).join(' '),
        Object.values(p.specifications || {}).join(' ')
      ].join(' ').toLowerCase()
    };
  }

  function loadFavs() {
    try {
      var raw = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
      state.favs = new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch (e) {
      state.favs = new Set();
    }
  }

  function saveFavs() {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(state.favs)));
    } catch (e) { /* ignore */ }
  }

  function itemKey(item) {
    if (!item) return '';
    return String(item.code || (item.product && (item.product.productId || item.product.url)) || item.title || '');
  }

  function applyCatalog(catalog) {
    var list = catalog && Array.isArray(catalog.products) ? catalog.products : [];
    state.generatedAt = catalog && catalog.generatedAt ? catalog.generatedAt : '';
    state.products = list.map(normalizeItem);
    rebuildCategories();
    renderStats();
    renderAll();
  }

  function rebuildCategories() {
    var sel = $('categorySelect');
    if (!sel) return;
    var counts = {};
    state.products.forEach(function (p) {
      var c = (p.category || '').trim();
      if (!c) return;
      counts[c] = (counts[c] || 0) + 1;
    });
    var cats = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });
    var prev = sel.value;
    sel.innerHTML = '<option value="">All categories</option>' + cats
      .map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + ' (' + counts[c] + ')</option>'; })
      .join('');
    sel.value = cats.indexOf(prev) >= 0 ? prev : '';
    state.category = sel.value;
  }

  function fetchCatalog(force) {
    state.loading = true;
    renderGrid(true);
    var url = 'data/catalog.json';
    if (force) url += '?t=' + Date.now();
    return fetch(url, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        state.loading = false;
        applyCatalog(data);
      })
      .catch(function (e) {
        state.loading = false;
        applyCatalog({ products: [] });
        if (e && e.message && e.message.indexOf('HTTP 404') < 0) {
          console.warn('[catalog]', e.message);
        }
      });
  }

  /* ---------------- filters ---------------- */
  function visibleProducts() {
    var q = state.query.trim().toLowerCase();
    var terms = q ? q.split(/\s+/).filter(Boolean) : [];
    var list = state.products.filter(function (p) {
      if (state.favOnly && !state.favs.has(itemKey(p))) return false;
      if (state.category && p.category !== state.category) return false;
      if (state.quick === 'under499' && !(p.selling > 0 && p.selling <= 499)) return false;
      if (state.quick === 'under999' && !(p.selling > 0 && p.selling <= 999)) return false;
      if (state.quick === 'bigOff' && !(p.discount >= 50)) return false;
      if (state.quick === 'photos' && !(p.photos >= 6)) return false;
      if (state.quick === 'fav' && !state.favs.has(itemKey(p))) return false;
      if (terms.length) {
        for (var i = 0; i < terms.length; i++) {
          if (p.search.indexOf(terms[i]) < 0) return false;
        }
      }
      return true;
    });

    var sort = state.quick === 'fav' ? 'new' : state.sort;
    list.sort(function (a, b) {
      if (sort === 'priceAsc') return (a.selling || 1e12) - (b.selling || 1e12);
      if (sort === 'priceDesc') return (b.selling || 0) - (a.selling || 0);
      if (sort === 'discount') return b.discount - a.discount;
      if (sort === 'title') return a.title.localeCompare(b.title);
      return b.createdAt - a.createdAt;
    });
    return list;
  }

  /* ---------------- render ---------------- */
  function renderStats() {
    var photos = state.products.reduce(function (sum, p) { return sum + p.photos; }, 0);
    var cats = new Set();
    state.products.forEach(function (p) { if (p.category) cats.add(p.category); });
    if ($('statProducts')) $('statProducts').textContent = String(state.products.length);
    if ($('statPhotos')) $('statPhotos').textContent = String(photos);
    if ($('statCategories')) $('statCategories').textContent = String(cats.size);
    if ($('statUpdated')) $('statUpdated').textContent = state.generatedAt ? shortDate(state.generatedAt) : '\u2014';
    if ($('favCount')) $('favCount').textContent = String(state.favs.size);
  }

  function starSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.7l1.2-6.6L2.5 9.5l6.6-.9z"/></svg>';
  }

  function imageSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-5-5L5 21"/></svg>';
  }

  function cardHtml(item, index) {
    var key = itemKey(item);
    var fav = state.favs.has(key);
    var inCompare = state.compare.indexOf(key) >= 0;
    var off = item.discount;
    return (
      '<article class="card" data-key="' + esc(key) + '" data-index="' + index + '" tabindex="0" role="button" aria-label="' + esc(item.title) + '">' +
        '<div class="cardMedia' + (item.image ? '' : ' empty') + '">' +
          (item.image
            ? '<img src="' + esc(item.image) + '" alt="' + esc(item.title) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
            : imageSvg()) +
          '<div class="badgesTop">' +
            (off > 0 ? '<span class="badge off">' + off + '% OFF</span>' : '<span class="badge">NEW</span>') +
            (item.photos ? '<span class="badge photos">' + imageSvg() + item.photos + '</span>' : '') +
          '</div>' +
          '<button class="favBtn' + (fav ? ' on' : '') + '" data-fav="' + esc(key) + '" aria-pressed="' + (fav ? 'true' : 'false') + '" title="' + (fav ? 'Remove favourite' : 'Add favourite') + '" aria-label="Favourite">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="m12 3.5 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9z"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="cardBody">' +
          '<span class="cardCat">' + esc(item.category || item.brand || 'Product') + '</span>' +
          '<h3 class="cardTitle">' + esc(item.title) + '</h3>' +
          '<div class="cardPrice">' +
            '<b>' + (item.selling ? inr(item.selling) : '\u2014') + '</b>' +
            (item.mrp > item.selling ? '<s>' + inr(item.mrp) + '</s>' : '') +
            (off > 0 ? '<em>' + off + '% off</em>' : '') +
          '</div>' +
          '<div class="cardMeta">' +
            (item.rating ? '<span class="rate">' + starSvg() + esc(item.rating) + '</span>' : '') +
            (item.ratingCount ? '<span>' + esc(item.ratingCount) + ' ratings</span>' : '') +
            (item.photos ? '<span>' + item.photos + ' photos</span>' : '<span>shared listing</span>') +
            (item.createdAt ? '<span>\u00b7 ' + esc(timeAgo(item.createdAt)) + '</span>' : '') +
          '</div>' +
          '<button class="cardAdd' + (inCompare ? ' on' : '') + '" data-compare="' + esc(key) + '">' +
            (inCompare ? 'Added to compare' : 'Compare') +
          '</button>' +
        '</div>' +
      '</article>'
    );
  }

  function renderGrid(showSkeleton) {
    var grid = $('grid');
    var empty = $('emptyState');
    if (!grid) return;

    if (showSkeleton && state.loading) {
      var skeleton = '';
      for (var s = 0; s < 8; s++) skeleton += '<div class="skel"></div>';
      grid.innerHTML = skeleton;
      if (empty) empty.hidden = true;
      return;
    }

    var list = visibleProducts();
    if ($('resultCount')) {
      $('resultCount').textContent = list.length + (list.length === 1 ? ' product' : ' products');
    }

    if (!list.length) {
      grid.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        var title = $('emptyTitle');
        var text = $('emptyText');
        if (state.products.length && (state.query || state.category || state.quick !== 'all' || state.favOnly)) {
          if (title) title.textContent = 'Kuch match nahi hua';
          if (text) {
            text.innerHTML = 'Filters hata ke dobara try karo. <button class="btn ghost sm" id="resetFiltersBtn">Reset filters</button>';
            var btn = $('resetFiltersBtn');
            if (btn) btn.onclick = resetFilters;
          }
        } else {
          if (title) title.textContent = 'Catalog khali hai';
          if (text) {
            text.innerHTML = 'Extension se product capture karo, Share tab se code copy karo, aur repo ki <code>data/shares.txt</code> me paste karo. Build automatic chalega.';
          }
        }
      }
      return;
    }

    if (empty) empty.hidden = true;
    grid.innerHTML = list.map(cardHtml).join('');
    bindGrid();
  }

  function bindGrid() {
    $$('#grid .card').forEach(function (card) {
      var key = card.dataset.key;
      card.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-fav]') || ev.target.closest('[data-compare]')) return;
        openProduct(key);
      });
      card.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openProduct(key);
        }
      });
    });

    $$('#grid [data-fav]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        toggleFav(btn.dataset.fav);
      });
    });

    $$('#grid [data-compare]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        toggleCompare(btn.dataset.compare);
      });
    });
  }

  function findItem(key) {
    for (var i = 0; i < state.products.length; i++) {
      if (itemKey(state.products[i]) === key) return state.products[i];
    }
    return null;
  }

  function renderAll() {
    renderStats();
    renderGrid();
    renderCompareBar();
  }

  function resetFilters() {
    state.query = '';
    state.category = '';
    state.quick = 'all';
    state.favOnly = false;
    state.sort = 'new';
    if ($('searchInput')) $('searchInput').value = '';
    if ($('categorySelect')) $('categorySelect').value = '';
    if ($('sortSelect')) $('sortSelect').value = 'new';
    $$('#quickChips .chip').forEach(function (c) {
      c.setAttribute('aria-pressed', c.dataset.quick === 'all' ? 'true' : 'false');
    });
    if ($('favToggle')) {
      $('favToggle').setAttribute('aria-pressed', 'false');
    }
    renderGrid();
  }

  /* ---------------- favourites + compare ---------------- */
  function toggleFav(key) {
    if (!key) return;
    if (state.favs.has(key)) {
      state.favs.delete(key);
      toast('Favourites se hata diya');
    } else {
      state.favs.add(key);
      toast('Favourite me add ho gaya');
    }
    saveFavs();
    renderStats();
    renderGrid();
  }

  function toggleCompare(key) {
    if (!key) return;
    var at = state.compare.indexOf(key);
    if (at >= 0) {
      state.compare.splice(at, 1);
    } else {
      if (state.compare.length >= COMPARE_MAX) {
        toast('Max ' + COMPARE_MAX + ' products compare kar sakte ho', 'err');
        return;
      }
      state.compare.push(key);
    }
    renderGrid();
    renderCompareBar();
  }

  function renderCompareBar() {
    var bar = $('compareBar');
    var box = $('compareItems');
    if (!bar) return;
    var items = state.compare.map(findItem).filter(Boolean);
    var open = items.length > 0;
    if (document.body) document.body.classList.toggle('compare-open', open);
    if (!items.length) {
      bar.hidden = true;
      if (box) box.innerHTML = '';
      return;
    }
    bar.hidden = false;
    if ($('compareCount')) $('compareCount').textContent = String(items.length);
    if (box) {
      box.innerHTML = items.map(function (p) {
        return p.image
          ? '<img src="' + esc(p.image) + '" alt="' + esc(p.title) + '" referrerpolicy="no-referrer" title="' + esc(p.title) + '">'
          : '<span class="badge">' + esc((p.title || 'P').charAt(0)) + '</span>';
      }).join('');
    }
    if ($('compareOpen')) $('compareOpen').disabled = items.length < 2;
  }

  function openCompare() {
    var items = state.compare.map(findItem).filter(Boolean);
    var box = $('compareTable');
    var dlg = $('compareDialog');
    if (!box || !dlg) return;
    if (items.length < 2) {
      toast('Kam se kam 2 products select karo', 'err');
      return;
    }
    box.innerHTML = items.map(function (p) {
      var specs = Object.keys(p.product.specifications || {}).length;
      return (
        '<div class="cmpCol">' +
          (p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.title) + '" referrerpolicy="no-referrer">' : '') +
          '<div class="cmpBody">' +
            '<b>' + esc(p.title) + '</b>' +
            '<div class="cmpPrice">' + (p.selling ? inr(p.selling) : '\u2014') + '</div>' +
            '<div class="cmpRow"><span>MRP</span><b>' + (p.mrp ? inr(p.mrp) : '\u2014') + '</b></div>' +
            '<div class="cmpRow"><span>Discount</span><b>' + (p.discount ? p.discount + '%' : '\u2014') + '</b></div>' +
            '<div class="cmpRow"><span>Brand</span><b>' + esc(p.brand || '\u2014') + '</b></div>' +
            '<div class="cmpRow"><span>Category</span><b>' + esc(p.category || '\u2014') + '</b></div>' +
            '<div class="cmpRow"><span>Photos</span><b>' + (p.photos || 0) + '</b></div>' +
            '<div class="cmpRow"><span>Specs</span><b>' + specs + '</b></div>' +
            '<div class="cmpRow"><span>Colours</span><b>' + esc((p.colors || []).join(', ') || '\u2014') + '</b></div>' +
            '<div class="cmpRow"><span>Sizes</span><b>' + esc((p.sizes || []).join(', ') || '\u2014') + '</b></div>' +
            '<div class="pdActions" style="margin-top:10px"><button class="btn dark sm" data-open="' + esc(itemKey(p)) + '">Open</button></div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    $$('[data-open]', box).forEach(function (btn) {
      btn.onclick = function () {
        dlg.close();
        openProduct(btn.dataset.open);
      };
    });
    if (typeof dlg.showModal === 'function') dlg.showModal();
  }

  /* ---------------- product dialog ---------------- */
  function galleryHtml(item) {
    var images = item.images;
    if (!images.length) {
      return '<div class="pdMain">' + imageSvg() + '</div>';
    }
    return (
      '<div class="pdMain"><img id="pdMainImg" src="' + esc(images[0]) + '" alt="' + esc(item.title) + '" referrerpolicy="no-referrer">' +
        (images.length > 1
          ? '<div class="pdArrows"><button data-step="-1" aria-label="Previous photo">\u2039</button><button data-step="1" aria-label="Next photo">\u203a</button></div>'
          : '') +
      '</div>' +
      (images.length > 1
        ? '<div class="pdThumbs">' + images.map(function (u, i) {
            return '<button data-thumb="' + i + '" class="' + (i === 0 ? 'on' : '') + '" aria-label="Photo ' + (i + 1) + '"><img src="' + esc(u) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></button>';
          }).join('') + '</div>'
        : '')
    );
  }

  function openProduct(key) {
    var item = findItem(key);
    if (!item) return;
    var body = $('dialogBody');
    var dlg = $('productDialog');
    if (!body || !dlg) return;
    state.current = item;
    state.galleryIndex = 0;

    var p = item.product || {};
    var specs = Object.entries(p.specifications || {});

    body.innerHTML =
      '<div class="pdGrid">' +
        '<div class="pdGallery">' + galleryHtml(item) + '</div>' +
        '<div class="pdInfo">' +
          '<div class="pdTags">' +
            (item.category ? '<span class="tag">' + esc(item.category) + '</span>' : '') +
            (item.brand ? '<span class="tag">' + esc(item.brand) + '</span>' : '') +
            (item.discount >= 40 ? '<span class="tag hot">' + item.discount + '% OFF</span>' : '') +
            (item.photos >= 6 ? '<span class="tag mint">' + item.photos + ' photos</span>' : '') +
          '</div>' +
          '<h2 class="pdTitle" id="pdTitle">' + esc(item.title) + '</h2>' +
          '<p class="pdSub">' +
            esc([
              item.brand,
              item.subcategory || '',
              item.createdAt ? 'shared ' + timeAgo(item.createdAt) : ''
            ].filter(Boolean).join(' \u00b7 ') || 'Shared listing') +
          '</p>' +
          '<div class="pdPriceRow">' +
            '<b>' + (item.selling ? inr(item.selling) : '\u2014') + '</b>' +
            (item.mrp > item.selling ? '<s>' + inr(item.mrp) + '</s>' : '') +
            (item.discount ? '<em>' + item.discount + '% off</em>' : '') +
          '</div>' +
          (item.mrp > item.selling ? '<div class="pdSave">Aap ' + inr(item.mrp - item.selling) + ' bacha rahe ho</div>' : '') +
          '<div class="pdActions">' +
            (item.url ? '<a class="btn primary" href="' + esc(item.url) + '" target="_blank" rel="noopener">Open on Meesho</a>' : '') +
            '<button class="btn dark" id="pdCopyLink">Copy share link</button>' +
            '<button class="btn ghost" id="pdCopyText">Copy listing</button>' +
            '<button class="btn ghost" id="pdDownload">Download JSON</button>' +
          '</div>' +
          '<div class="pdFacts">' +
            '<div class="fact"><span>Photos</span><b>' + (item.photos || 0) + '</b></div>' +
            '<div class="fact"><span>Specifications</span><b>' + specs.length + '</b></div>' +
            '<div class="fact"><span>Colours</span><b>' + esc((item.colors || []).join(', ') || '\u2014') + '</b></div>' +
            '<div class="fact"><span>Sizes</span><b>' + esc((item.sizes || []).join(', ') || '\u2014') + '</b></div>' +
          '</div>' +
          '<div class="pdTabs" role="tablist">' +
            '<button class="pdTab on" data-pdtab="desc" role="tab">Description</button>' +
            '<button class="pdTab" data-pdtab="specs" role="tab">Specs (' + specs.length + ')</button>' +
            '<button class="pdTab" data-pdtab="images" role="tab">Photos (' + item.photos + ')</button>' +
            '<button class="pdTab" data-pdtab="text" role="tab">Listing text</button>' +
          '</div>' +
          '<div class="pdPanel" id="pdPanel"></div>' +
        '</div>' +
      '</div>';

    renderPdPanel('desc');

    $$('[data-pdtab]', body).forEach(function (tab) {
      tab.onclick = function () {
        $$('[data-pdtab]', body).forEach(function (t) { t.classList.remove('on'); });
        tab.classList.add('on');
        renderPdPanel(tab.dataset.pdtab);
      };
    });

    var mainImg = $('pdMainImg');
    $$('[data-thumb]', body).forEach(function (btn) {
      btn.onclick = function () {
        var i = Number(btn.dataset.thumb) || 0;
        setGallery(i);
      };
    });
    $$('[data-step]', body).forEach(function (btn) {
      btn.onclick = function () {
        setGallery(state.galleryIndex + Number(btn.dataset.step || 0));
      };
    });
    if (mainImg) mainImg.onerror = function () { mainImg.style.display = 'none'; };

    var copyLink = $('pdCopyLink');
    if (copyLink) {
      copyLink.onclick = function () {
        var link = item.code ? shareLinkFor(item.code) : '';
        if (!link) return toast('Is product ka share code nahi hai', 'err');
        copyText(link).then(function (ok) {
          toast(ok ? 'Share link copied' : 'Copy fail', ok ? '' : 'err');
        });
      };
    }
    var copyBtn = $('pdCopyText');
    if (copyBtn) {
      copyBtn.onclick = function () {
        copyText(listingText(item)).then(function (ok) {
          toast(ok ? 'Listing text copied' : 'Copy fail', ok ? '' : 'err');
        });
      };
    }
    var dl = $('pdDownload');
    if (dl) {
      dl.onclick = function () {
        downloadText('meesho-' + safeName(item.title) + '.json', JSON.stringify(item, null, 2), 'application/json');
        toast('JSON download ho gaya');
      };
    }

    if (typeof dlg.showModal === 'function') {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute('open', '');
    }
    body.scrollTop = 0;
  }

  function safeName(v) {
    return String(v || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'product';
  }

  function setGallery(i) {
    var item = state.current;
    if (!item || !item.images.length) return;
    var n = item.images.length;
    var idx = ((i % n) + n) % n;
    state.galleryIndex = idx;
    var img = $('pdMainImg');
    if (img) {
      img.style.display = '';
      img.src = item.images[idx];
    }
    $$('#dialogBody [data-thumb]').forEach(function (btn) {
      btn.classList.toggle('on', Number(btn.dataset.thumb) === idx);
    });
  }

  function renderPdPanel(mode) {
    var item = state.current;
    var panel = $('pdPanel');
    if (!item || !panel) return;
    var p = item.product || {};

    if (mode === 'desc') {
      var desc = String(p.description || (item.profile || {}).description || '').trim();
      var highlights = Array.isArray(p.highlights) ? p.highlights : [];
      var html = desc ? '<p class="descText">' + esc(desc) + '</p>' : '<p class="descText" style="color:var(--muted)">Description share nahi hui.</p>';
      if (highlights.length) {
        html += '<div class="chipsList">' + highlights.map(function (h) { return '<span>' + esc(h) + '</span>'; }).join('') + '</div>';
      }
      if (p.keywords) {
        html += '<p class="pdSub" style="margin-top:14px">Keywords: ' + esc(p.keywords) + '</p>';
      }
      panel.innerHTML = html;
      return;
    }

    if (mode === 'specs') {
      var specs = Object.entries(p.specifications || {});
      panel.innerHTML = specs.length
        ? '<div class="specList">' + specs.map(function (e) {
            return '<div><span>' + esc(e[0]) + '</span><b>' + esc(e[1]) + '</b></div>';
          }).join('') + '</div>'
        : '<p class="descText" style="color:var(--muted)">Koi specification share nahi hui.</p>';
      return;
    }

    if (mode === 'images') {
      panel.innerHTML = item.images.length
        ? '<div class="pdImages">' + item.images.map(function (u, i) {
            return '<a href="' + esc(u) + '" target="_blank" rel="noopener" title="Photo ' + (i + 1) + '"><img src="' + esc(u) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></a>';
          }).join('') + '</div>'
        : '<p class="descText" style="color:var(--muted)">Koi photo share nahi hui.</p>';
      return;
    }

    panel.innerHTML = '<pre>' + esc(listingText(item)) + '</pre>' +
      '<div class="btnrow" style="margin-top:10px"><button class="btn dark sm" id="pdCopyText2">Copy listing</button></div>';
    var btn = $('pdCopyText2');
    if (btn) {
      btn.onclick = function () {
        copyText(listingText(item)).then(function (ok) {
          toast(ok ? 'Listing text copied' : 'Copy fail', ok ? '' : 'err');
        });
      };
    }
  }

  function closeDialog(dlg) {
    if (!dlg) return;
    if (typeof dlg.close === 'function' && dlg.open) dlg.close();
    else dlg.removeAttribute('open');
  }

  /* ---------------- share code flow ---------------- */
  function openShareCode(text) {
    decodeShare(text).then(function (payload) {
      var item = normalizeItem({
        code: payload.code,
        createdAt: payload.createdAt,
        title: payload.product.title,
        selling: (payload.profile && payload.profile.selling) || payload.product.price,
        image: payload.product.mainImage,
        product: payload.product,
        profile: payload.profile,
        settings: payload.settings,
        meta: payload.meta
      });
      var existing = findItem(itemKey(item));
      if (!existing) {
        state.products = [item].concat(state.products);
        rebuildCategories();
        renderStats();
      }
      closeDialog($('productDialog'));
      openProduct(itemKey(item));
      renderGrid();
      var url = '#mp=' + encodeURIComponent(payload.code || '');
      if (payload.code) {
        try { history.replaceState(null, '', location.pathname + location.search + url); } catch (e) { /* ignore */ }
      }
      toast('Share code open ho gaya');
      return true;
    }).catch(function (e) {
      var err = $('codeErr');
      if (err) {
        err.hidden = false;
        err.textContent = e.message || 'Code decode nahi hua.';
      }
      return false;
    });
  }

  function openCodeDialog() {
    var dlg = $('codeDialog');
    var err = $('codeErr');
    if (err) err.hidden = true;
    var input = $('codeInput');
    if (input) input.value = '';
    if (!dlg) return;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    setTimeout(function () { if (input) input.focus(); }, 60);
  }

  function handleHash() {
    var hash = location.hash || '';
    if (!hash || hash.indexOf('mp=') < 0) return false;
    var raw = hash.replace(/^#/, '');
    var code = '';
    try {
      var params = new URLSearchParams(raw);
      code = params.get('mp') || params.get('mpdata') || raw;
    } catch (e) {
      code = raw;
    }
    if (!code) return false;
    openShareCode(code);
    return true;
  }

  /* ---------------- theme ---------------- */
  function applyTheme(theme, save) {
    var t = theme === 'dark' || theme === 'light' ? theme : 'system';
    state.theme = t;
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (save) {
      try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
    }
  }

  function cycleTheme() {
    var order = ['light', 'dark', 'system'];
    var next = order[(order.indexOf(state.theme) + 1) % order.length];
    applyTheme(next, true);
    toast('Theme: ' + next);
  }

  /* ---------------- PWA ---------------- */
  function setupPwa() {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* optional */ });
      });
    }
    window.addEventListener('beforeinstallprompt', function (ev) {
      ev.preventDefault();
      state.deferredInstall = ev;
      var btn = $('installBtn');
      if (btn) btn.hidden = false;
    });
    var btn = $('installBtn');
    if (btn) {
      btn.onclick = function () {
        var ev = state.deferredInstall;
        if (!ev) return toast('Browser menu se "Install app" chuno');
        state.deferredInstall = null;
        btn.hidden = true;
        ev.prompt();
      };
    }
    window.addEventListener('appinstalled', function () {
      var b = $('installBtn');
      if (b) b.hidden = true;
      toast('App install ho gaya');
    });
  }

  /* ---------------- bind ---------------- */
  function bind() {
    var search = $('searchInput');
    if (search) {
      search.addEventListener('input', debounce(function () {
        state.query = search.value;
        renderGrid();
      }, 140));
    }

    var cat = $('categorySelect');
    if (cat) {
      cat.onchange = function () {
        state.category = cat.value;
        renderGrid();
      };
    }

    var sort = $('sortSelect');
    if (sort) {
      sort.onchange = function () {
        state.sort = sort.value;
        renderGrid();
      };
    }

    var favToggle = $('favToggle');
    if (favToggle) {
      favToggle.onclick = function () {
        state.favOnly = !state.favOnly;
        favToggle.setAttribute('aria-pressed', state.favOnly ? 'true' : 'false');
        renderGrid();
      };
    }

    $$('#quickChips .chip').forEach(function (chip) {
      chip.onclick = function () {
        state.quick = chip.dataset.quick || 'all';
        $$('#quickChips .chip').forEach(function (c) {
          c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
        });
        renderGrid();
      };
    });

    var refresh = $('refreshBtn');
    if (refresh) {
      refresh.onclick = function () {
        refresh.disabled = true;
        fetchCatalog(true).then(function () {
          refresh.disabled = false;
          toast('Catalog refresh ho gaya');
        });
      };
    }

    var theme = $('themeBtn');
    if (theme) theme.onclick = cycleTheme;

    var dlg = $('productDialog');
    if (dlg) {
      dlg.addEventListener('click', function (ev) {
        if (ev.target === dlg) closeDialog(dlg);
      });
      dlg.addEventListener('close', function () {
        state.current = null;
        var body = $('dialogBody');
        if (body) body.innerHTML = '';
      });
    }
    var close = $('dialogClose');
    if (close) close.onclick = function () { closeDialog(dlg); };

    var cdlg = $('compareDialog');
    if (cdlg) {
      cdlg.addEventListener('click', function (ev) {
        if (ev.target === cdlg) closeDialog(cdlg);
      });
    }
    var cclose = $('compareClose');
    if (cclose) cclose.onclick = function () { closeDialog(cdlg); };

    if ($('compareOpen')) $('compareOpen').onclick = openCompare;
    if ($('compareClear')) {
      $('compareClear').onclick = function () {
        state.compare = [];
        renderGrid();
        renderCompareBar();
      };
    }

    var codeDlg = $('codeDialog');
    if (codeDlg) {
      codeDlg.addEventListener('click', function (ev) {
        if (ev.target === codeDlg) closeDialog(codeDlg);
      });
    }
    var codeGo = $('codeGo');
    if (codeGo) {
      codeGo.onclick = function (ev) {
        ev.preventDefault();
        var input = $('codeInput');
        var value = input ? input.value.trim() : '';
        var err = $('codeErr');
        if (!value) {
          if (err) {
            err.hidden = false;
            err.textContent = 'Pehle code ya link paste karo.';
          }
          return;
        }
        if (err) err.hidden = true;
        openShareCode(value).then(function (ok) {
          if (ok) closeDialog(codeDlg);
        });
      };
    }
    var codeInput = $('codeInput');
    if (codeInput) {
      codeInput.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          if (codeGo) codeGo.click();
        }
      });
    }
    if ($('pasteCodeBtn')) $('pasteCodeBtn').onclick = openCodeDialog;
    if ($('pasteCodeBtn2')) $('pasteCodeBtn2').onclick = openCodeDialog;

    var topbar = $('topbar');
    if (topbar) {
      var onScroll = function () {
        topbar.classList.toggle('scrolled', window.scrollY > 8);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    document.addEventListener('keydown', function (ev) {
      var tag = (ev.target && ev.target.tagName) || '';
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (ev.target && ev.target.isContentEditable);
      if (ev.key === '/' && !typing) {
        ev.preventDefault();
        if (search) search.focus();
      }
      if (ev.key === 'Escape') {
        if (dlg && dlg.open) closeDialog(dlg);
        if (cdlg && cdlg.open) closeDialog(cdlg);
        if (codeDlg && codeDlg.open) closeDialog(codeDlg);
      }
    });

    window.addEventListener('hashchange', function () {
      handleHash();
    });

    var darkMq = window.matchMedia('(prefers-color-scheme: dark)');
    var onDarkChange = function () {
      if (state.theme === 'system') applyTheme('system', false);
    };
    if (darkMq && darkMq.addEventListener) darkMq.addEventListener('change', onDarkChange);
    else if (darkMq && darkMq.addListener) darkMq.addListener(onDarkChange);

    var repo = 'https://github.com/piyush00110/meesho-product-pro';
    ['repoLink', 'repoCta'].forEach(function (id) {
      var a = $(id);
      if (a) a.href = repo;
    });
    $$('a.repo').forEach(function (a) { a.href = repo; });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    loadFavs();
    var savedTheme = 'system';
    try { savedTheme = localStorage.getItem(THEME_KEY) || 'system'; } catch (e) { /* ignore */ }
    applyTheme(savedTheme, false);
    bind();
    setupPwa();
    renderStats();
    fetchCatalog().then(function () {
      /* deep link opens after the catalog is ready (so it can dedupe) */
      if (location.hash && location.hash.indexOf('mp=') >= 0) {
        handleHash();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
