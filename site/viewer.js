/* ============================================================
   Meesho Product Pro v6 - share viewer
   Works inside the extension and on GitHub Pages.
   No inline scripts (MV3 CSP friendly).
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) {
    return document.getElementById(id);
  };

  var state = {
    payload: null,
    catalog: [],
    theme: 'system'
  };

  /* ---------------- helpers ---------------- */
  function inr(n) {
    return '\u20B9' + (Number(n) || 0).toLocaleString('en-IN');
  }

  function discount(mrp, price) {
    if (Number(mrp) > Number(price) && Number(mrp) > 0) {
      return Math.round((1 - Number(price) / Number(mrp)) * 100);
    }
    return 0;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  var toastTimer = null;
  function toast(msg, kind) {
    var box = $('vToast');
    if (!box) return;
    box.textContent = msg;
    box.className = 'vToast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      box.className = 'vToast' + (kind ? ' ' + kind : '');
    }, 2600);
  }

  function copyText(text) {
    var value = String(text == null ? '' : text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value).then(
        function () {
          return true;
        },
        function () {
          return legacyCopy(value);
        }
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

  function b64urlToBytes(b64) {
    var s = String(b64 || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* ---------------- share decode ---------------- */
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
      /* not a url */
    }
    var m = t.match(/[#?&](?:mp|mpdata)=([^&\s]+)/);
    if (m) {
      try {
        return decodeURIComponent(m[1]);
      } catch (e) {
        return m[1];
      }
    }
    return '';
  }

  async function decodeShare(text) {
    var payload = extractPayload(text);
    if (!payload) throw new Error('Share link ya share code valid nahi hai.');

    var json = '';
    if (payload.indexOf('RAW:') === 0) {
      json = payload.slice(4);
    } else {
      var dot = payload.indexOf('.');
      if (dot < 1) throw new Error('Share code ka format galat hai.');
      var kind = payload.slice(0, dot);
      var bytes = b64urlToBytes(payload.slice(dot + 1));
      if (kind === 'g1') {
        if (typeof DecompressionStream === 'undefined') {
          throw new Error('Browser purana hai. Chrome update karke dobara try karo.');
        }
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        json = await new Response(stream).text();
      } else {
        json = new TextDecoder().decode(bytes);
      }
    }

    if (!json || json.length > 2000000) throw new Error('Share data bahut bada hai.');
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
  }

  /* ---------------- listing text ---------------- */
  function fallbackProfile(p, s) {
    var settings = s || {};
    var specs = p.specifications || {};
    var selling = Number(settings.priceOverride) || Number(p.price) || 0;
    var mrp = Number(p.mrp) || 0;
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
      gst:
        settings.gstMode && settings.gstMode !== 'auto'
          ? String(settings.gstMode) + '%'
          : specs.GST || '',
      weightText: p.weightText || '',
      dimText: p.dimText || '',
      description: p.description || '',
      highlights: Array.isArray(p.highlights) ? p.highlights : [],
      specifications: specs,
      keywords: p.keywords || '',
      images: Array.isArray(p.images) ? p.images : [],
      defaultStock: Number(settings.defaultStock) || 20,
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

  function formatListing(p, profile, settings) {
    if (!p) return '';
    var pr = profile || fallbackProfile(p, settings);
    var limit = Math.max(20, Number((settings || {}).titleLimit) || 60);
    var title = pr.title || pr.meeshoTitle || '';
    var lines = [];
    var rule = '--------------------------------------------';

    lines.push('MEESHO LISTING - ' + (title || 'Untitled product'));
    lines.push(rule);
    lines.push('');
    lines.push('TITLE (' + String(title).length + '/' + limit + ')');
    lines.push(title || '-');
    lines.push('');
    lines.push('PRICE');
    lines.push(
      'Selling: ' + inr(pr.selling) + '   MRP: ' + inr(pr.mrp) + '   Discount: ' + (pr.discount || 0) + '% OFF'
    );
    lines.push('Stock: ' + (pr.defaultStock || 20) + '   SKU: ' + (pr.sku || '-'));
    lines.push('');
    lines.push('PRODUCT');
    lines.push('Brand: ' + (pr.brand || '-'));
    lines.push('Category: ' + (pr.category || '-') + (pr.subcat ? ' / ' + pr.subcat : ''));
    if (pr.fabric) lines.push('Fabric: ' + pr.fabric);
    if (pr.pattern) lines.push('Pattern: ' + pr.pattern);
    if (pr.occasion) lines.push('Occasion: ' + pr.occasion);
    if (pr.pack) lines.push('Pack of: ' + pr.pack);
    lines.push('Country: ' + (pr.country || 'India'));
    lines.push('');
    lines.push('VARIANTS');
    lines.push('Colours: ' + ((pr.colorList || []).join(', ') || '-'));
    lines.push('Sizes: ' + ((pr.sizeList || []).join(', ') || '-'));
    lines.push('');
    lines.push('TAX & SHIPPING');
    lines.push('HSN: ' + (pr.hsn || '-') + '   GST: ' + (pr.gst || '-'));
    lines.push('Weight: ' + (pr.weightText || '-') + '   Dimensions: ' + (pr.dimText || '-'));
    lines.push('');
    lines.push('DESCRIPTION');
    lines.push(pr.description || '-');
    if ((pr.highlights || []).length) {
      lines.push('');
      lines.push('HIGHLIGHTS');
      pr.highlights.forEach(function (h) {
        lines.push('- ' + h);
      });
    }
    var specs = Object.entries(pr.specifications || p.specifications || {});
    if (specs.length) {
      lines.push('');
      lines.push('SPECIFICATIONS');
      specs.forEach(function (entry) {
        lines.push(entry[0] + ': ' + entry[1]);
      });
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
      images.forEach(function (u, i) {
        lines.push(i + 1 + '. ' + u);
      });
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

  /* ---------------- theme ---------------- */
  function applyTheme(theme, save) {
    var t = theme === 'dark' || theme === 'light' ? theme : 'system';
    state.theme = t;
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (save) {
      try {
        localStorage.setItem('mpViewerTheme', t);
      } catch (e) {
        /* ignore */
      }
    }
  }

  function cycleTheme() {
    var order = ['light', 'dark', 'system'];
    var next = order[(order.indexOf(state.theme) + 1) % order.length];
    applyTheme(next, true);
    toast('Theme: ' + next, '');
  }

  /* ---------------- render ---------------- */
  function setStatus(text, kind) {
    var box = $('vStatus');
    if (!box) return;
    box.textContent = text;
    box.className = 'vStatus' + (kind ? ' ' + kind : '');
  }

  function formatDate(ts) {
    if (!ts) return '';
    try {
      return new Date(Number(ts)).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return '';
    }
  }

  function metaChip(text) {
    return el('span', 'vMetaChip', text);
  }

  function detailRow(label, value) {
    var row = el('div', 'vDetailRow');
    row.appendChild(el('span', '', label));
    row.appendChild(el('b', '', value));
    return row;
  }

  function renderDetail(data) {
    state.payload = data;
    var p = data.product || {};
    var settings = data.settings || {};
    var prof = data.profile || fallbackProfile(p, settings);
    var images = Array.isArray(p.images) ? p.images : [];
    var image = p.mainImage || images[0] || '';
    var specs = p.specifications || {};
    var specKeys = Object.keys(specs);

    $('vCatalog').classList.add('hidden');
    $('vEmpty').classList.add('hidden');
    $('vDetail').classList.remove('hidden');
    setStatus('Data loaded', 'ok');
    document.title = (p.title || 'Product') + ' \u2014 Meesho Pro Viewer';

    var mainImg = $('vMainImg');
    mainImg.onerror = function () {
      mainImg.style.visibility = 'hidden';
    };
    mainImg.onload = function () {
      mainImg.style.visibility = 'visible';
    };
    mainImg.src = image;
    mainImg.style.visibility = image ? 'visible' : 'hidden';
    mainImg.alt = p.title || '';
    $('vImgBadge').textContent = String(images.length);

    $('vTitle').textContent = p.title || 'Untitled product';

    var priceBox = $('vPrice');
    clear(priceBox);
    var selling = Number(prof.selling) || Number(p.price) || 0;
    var mrp = Number(prof.mrp) || Number(p.mrp) || 0;
    priceBox.appendChild(document.createTextNode(selling ? inr(selling) : 'Price not found'));
    if (mrp && mrp > selling) {
      priceBox.appendChild(el('small', '', 'MRP ' + inr(mrp)));
      var off = prof.discount || discount(mrp, selling);
      if (off) priceBox.appendChild(el('span', 'off', off + '% OFF'));
    }

    var meta = $('vMeta');
    clear(meta);
    if (p.category) meta.appendChild(metaChip(p.category + (p.subcategory ? ' / ' + p.subcategory : '')));
    if (p.brand) meta.appendChild(metaChip(p.brand));
    if (p.rating) meta.appendChild(metaChip('\u2B50 ' + p.rating + (p.ratingCount ? ' (' + p.ratingCount + ')' : '')));
    (prof.colorList || p.colors || []).slice(0, 4).forEach(function (c) {
      meta.appendChild(metaChip(c));
    });
    (prof.sizeList || p.sizes || []).slice(0, 4).forEach(function (s) {
      meta.appendChild(metaChip('Size ' + s));
    });
    if (p.productId) meta.appendChild(metaChip('ID ' + p.productId));

    var source = $('vSource');
    if (p.url && /^https?:\/\//i.test(p.url)) {
      source.href = p.url;
      source.classList.remove('hidden');
    } else {
      source.classList.add('hidden');
      source.removeAttribute('href');
    }

    $('vStatImages').textContent = String(images.length);
    $('vStatSpecs').textContent = String(specKeys.length);
    $('vStatDesc').textContent = String(String(p.description || prof.description || '').length);
    $('vStatDiscount').textContent = (prof.discount || discount(prof.mrp, prof.selling) || 0) + '%';

    $('vListing').textContent = formatListing(p, prof, settings);

    var details = $('vDetails');
    clear(details);
    var rows = [
      ['Product ID', p.productId],
      ['Category', (p.category || '') + (p.subcategory ? ' / ' + p.subcategory : '')],
      ['Brand', p.brand],
      ['Seller', p.seller],
      ['Rating', p.rating ? p.rating + (p.ratingCount ? ' (' + p.ratingCount + ')' : '') : ''],
      ['Colours', (prof.colorList || p.colors || []).join(', ')],
      ['Sizes', (prof.sizeList || p.sizes || []).join(', ')],
      ['Fabric', prof.fabric],
      ['HSN', prof.hsn],
      ['GST', prof.gst],
      ['SKU', prof.sku],
      ['Weight', prof.weightText],
      ['Dimensions', prof.dimText],
      ['Share version', 'v' + (data.version || 1)],
      ['Created', formatDate(data.createdAt)]
    ];
    rows.forEach(function (entry) {
      if (entry[1]) details.appendChild(detailRow(entry[0], entry[1]));
    });
    $('vDetailsChip').textContent = details.children.length + ' fields';

    $('vDesc').textContent = p.description || prof.description || 'Description available nahi hai.';

    var specsBox = $('vSpecs');
    clear(specsBox);
    specKeys.forEach(function (key) {
      var row = el('div', 'vSpecRow');
      row.appendChild(el('span', '', key));
      row.appendChild(el('b', '', specs[key]));
      specsBox.appendChild(row);
    });
    if (!specKeys.length) specsBox.appendChild(el('div', 'vMuted vSmall', 'No specifications captured.'));
    $('vSpecCount').textContent = String(specKeys.length);

    var highlightsCard = $('vHighlightsCard');
    var highlights = Array.isArray(p.highlights) ? p.highlights : [];
    var list = $('vHighlights');
    clear(list);
    if (highlights.length) {
      highlights.forEach(function (h) {
        list.appendChild(el('li', '', h));
      });
      highlightsCard.classList.remove('hidden');
    } else {
      highlightsCard.classList.add('hidden');
    }

    var gallery = $('vImages');
    clear(gallery);
    images.forEach(function (url, index) {
      var tile = el('div', 'vTile');
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.alt = (p.title || 'Product') + ' image ' + (index + 1);
      img.src = url;
      tile.appendChild(img);
      tile.appendChild(el('span', '', String(index + 1)));
      gallery.appendChild(tile);
    });
    if (!images.length) gallery.appendChild(el('div', 'vMuted vSmall', 'No images captured.'));
    $('vImgCount').textContent = images.length + ' photos';

    var settingsBox = $('vSettings');
    clear(settingsBox);
    var sRows = [
      ['Brand', settings.brand],
      ['Manufacturer', settings.manufacturerName],
      ['Address', settings.manufacturerAddress],
      ['Country', settings.country],
      ['HSN default', settings.hsnDefault],
      ['GST mode', settings.gstMode],
      ['Title limit', settings.titleLimit],
      ['Stock', settings.defaultStock],
      ['Max images', settings.maxImages],
      ['Weight g', settings.weightGrams],
      [
        'Dimensions',
        settings.length || settings.breadth || settings.height
          ? settings.length + ' x ' + settings.breadth + ' x ' + settings.height + ' cm'
          : ''
      ],
      ['Viewer base', settings.viewerBase],
      ['Share version', 'v' + (data.version || 1)]
    ];
    sRows.forEach(function (entry) {
      if (entry[1] === 0 || entry[1]) {
        var row = el('div', 'vSettingRow');
        row.appendChild(el('span', '', entry[0]));
        row.appendChild(el('b', '', entry[1]));
        settingsBox.appendChild(row);
      }
    });
    if (!settingsBox.children.length) settingsBox.appendChild(el('div', 'vMuted vSmall', 'Default settings.'));

    var chips = $('vKeywords');
    clear(chips);
    var words = String(prof.keywords || '')
      .split(',')
      .map(function (w) {
        return w.trim();
      })
      .filter(Boolean);
    words.forEach(function (word) {
      chips.appendChild(el('span', 'vChipItem', word));
    });
    if (!words.length) chips.appendChild(el('span', 'vMuted vSmall', 'No keywords.'));

    $('vRaw').textContent = JSON.stringify(
      {
        version: data.version,
        createdAt: data.createdAt,
        product: p,
        profile: prof,
        settings: settings,
        meta: data.meta
      },
      null,
      2
    );

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- catalog ---------------- */
  function renderCatalog() {
    var box = $('vCatalogList');
    if (!box) return;
    clear(box);
    var q = String(($('vSearch') || {}).value || '').toLowerCase().trim();
    var items = state.catalog.filter(function (item) {
      if (!q) return true;
      var p = item.product || {};
      return (
        String(p.title || '').toLowerCase().indexOf(q) !== -1 ||
        String(p.brand || '').toLowerCase().indexOf(q) !== -1 ||
        String(p.category || '').toLowerCase().indexOf(q) !== -1
      );
    });

    $('vCatalogCount').textContent = items.length + ' products';

    if (!items.length) {
      box.appendChild(el('div', 'vCatEmpty', 'Koi product match nahi hua.'));
      return;
    }

    items.forEach(function (item) {
      var p = item.product || {};
      var button = el('button', 'vCatItem');
      button.type = 'button';

      var img = document.createElement('img');
      img.className = 'vCatImg';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.alt = '';
      img.src = item.image || p.mainImage || (p.images || [])[0] || '';
      img.onerror = function () {
        img.style.visibility = 'hidden';
      };

      var info = el('div', 'vCatInfo');
      info.appendChild(el('div', 'vCatTitle', p.title || 'Untitled'));
      var metaBits = [];
      if (p.category) metaBits.push(p.category);
      metaBits.push((p.images || []).length + ' photos');
      if (item.createdAt) metaBits.push(formatDate(item.createdAt));
      info.appendChild(el('div', 'vCatMeta', metaBits.join(' \u00B7 ')));
      info.appendChild(el('div', 'vCatPrice', inr(item.selling || p.price || 0)));

      button.appendChild(img);
      button.appendChild(info);
      button.addEventListener('click', function () {
        var data = {
          version: 2,
          createdAt: item.createdAt || 0,
          product: p,
          profile: item.profile || null,
          settings: item.settings || null,
          meta: item.meta || null,
          code: item.code || ''
        };
        renderDetail(data);
        if (item.code) {
          try {
            history.replaceState(null, '', '#mp=' + encodeURIComponent(item.code));
          } catch (e) {
            /* ignore */
          }
        }
      });
      box.appendChild(button);
    });
  }

  async function loadCatalog() {
    try {
      var res = await fetch('data/catalog.json', { cache: 'no-store' });
      if (!res.ok) return;
      var data = await res.json();
      state.catalog = Array.isArray(data.products) ? data.products : [];
    } catch (e) {
      state.catalog = [];
    }
    if (state.payload) return;
    if (state.catalog.length) {
      $('vCatalog').classList.remove('hidden');
      $('vEmpty').classList.add('hidden');
      renderCatalog();
      setStatus(state.catalog.length + ' products', '');
    }
  }

  /* ---------------- actions ---------------- */
  async function openText(text) {
    var hint = $('vHint');
    hint.className = 'vMuted vSmall';
    hint.textContent = 'Decode ho raha hai...';
    try {
      var data = await decodeShare(text);
      renderDetail(data);
      hint.textContent = 'Loaded \u2713 ' + data.product.title;
      hint.className = 'vMuted vSmall';
      if (data.code) {
        try {
          history.replaceState(null, '', '#mp=' + encodeURIComponent(data.code));
        } catch (e) {
          /* ignore */
        }
      }
      toast('Share data loaded', 'ok');
    } catch (e) {
      hint.textContent = 'Error: ' + e.message;
      hint.className = 'vMuted vSmall err';
      setStatus('Invalid link', 'err');
      toast('Share data load nahi hua', 'err');
    }
  }

  function shareLinkFor(payload) {
    if (!payload || !payload.code) return '';
    return 'https://supplier.meesho.com/#mp=' + encodeURIComponent(payload.code);
  }

  function bindActions() {
    $('vOpen').addEventListener('click', function () {
      openText($('vInput').value);
    });
    $('vInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') openText($('vInput').value);
    });
    $('vSearch').addEventListener('input', renderCatalog);
    $('vTheme').addEventListener('click', cycleTheme);

    $('vCopyLink').addEventListener('click', function () {
      var link = shareLinkFor(state.payload);
      if (!link) return toast('Share code available nahi hai', 'err');
      copyText(link).then(function (ok) {
        toast(ok ? 'Share link copied' : 'Copy fail', ok ? 'ok' : 'err');
      });
    });

    $('vCopyListing').addEventListener('click', function () {
      var text = $('vListing').textContent || '';
      if (!text) return toast('Listing text khali hai', 'err');
      copyText(text).then(function (ok) {
        toast(ok ? 'Full listing text copied' : 'Copy fail', ok ? 'ok' : 'err');
      });
    });

    $('vCopyDesc').addEventListener('click', function () {
      var text = $('vDesc').textContent || '';
      copyText(text).then(function (ok) {
        toast(ok ? 'Description copied' : 'Copy fail', ok ? 'ok' : 'err');
      });
    });

    $('vCopyImages').addEventListener('click', function () {
      var images = (state.payload && state.payload.product && state.payload.product.images) || [];
      if (!images.length) return toast('Koi image nahi', 'err');
      copyText(images.join('\n')).then(function (ok) {
        toast(ok ? images.length + ' image links copied' : 'Copy fail', ok ? 'ok' : 'err');
      });
    });

    $('vCopyKeywords').addEventListener('click', function () {
      var prof =
        (state.payload && state.payload.profile) ||
        fallbackProfile((state.payload && state.payload.product) || {}, {});
      copyText(prof.keywords || '').then(function (ok) {
        toast(ok ? 'Keywords copied' : 'Copy fail', ok ? 'ok' : 'err');
      });
    });

    $('vDownload').addEventListener('click', function () {
      if (!state.payload) return toast('Pehle share link kholo', 'err');
      try {
        var payload = {
          app: 'Meesho Product Pro',
          version: 5,
          exportedAt: new Date().toISOString(),
          shareCode: state.payload.code || '',
          product: state.payload.product,
          profile: state.payload.profile,
          settings: state.payload.settings,
          meta: state.payload.meta
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'meesho-product-share.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
          URL.revokeObjectURL(a.href);
        }, 4000);
        toast('JSON downloaded', 'ok');
      } catch (e) {
        toast('Download fail', 'err');
      }
    });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    var saved = 'system';
    try {
      saved = localStorage.getItem('mpViewerTheme') || 'system';
    } catch (e) {
      saved = 'system';
    }
    applyTheme(saved, false);
    bindActions();
    loadCatalog();

    var initial = location.hash || location.search || '';
    if (/[#?&](?:mp|mpdata)=/.test(initial) || /^[#?][gj]1\./.test(initial)) {
      openText(initial);
    } else if (initial.length > 3) {
      openText(initial);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
