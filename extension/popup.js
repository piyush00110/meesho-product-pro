/* ============================================================
   Meesho Product Pro v6 - popup logic
   ============================================================ */
(function () {
  const MP = window.MP;
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const PROFIT_DEFAULT = {
    cost: '',
    selling: '',
    commission: 12,
    shipping: 60,
    target: 25,
    gst: 5
  };

  const S = {
    tab: null,
    product: null,
    settings: Object.assign({}, MP.DEFAULT_SETTINGS),
    selected: new Set(),
    productKey: '',
    legacyProfile: null,
    history: [],
    theme: 'system',
    profit: Object.assign({}, PROFIT_DEFAULT),
    toolsKey: null,
    lastProfit: null,
    lastScore: 0,
    cacheCount: 0,
    share: null,
    shareToken: 0,
    collected: [],
    collectedKey: ''
  };

  /* ---------------- tiny helpers ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, Number(n) || 0));
  }

  function toast(msg, kind) {
    const wrap = $('toasts');
    if (!wrap) return;
    while (wrap.children.length >= 3) wrap.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    const dot = document.createElement('span');
    dot.className = 'dot';
    const text = document.createElement('span');
    text.textContent = msg;
    el.appendChild(dot);
    el.appendChild(text);
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    }, 2500);
  }

  function setLog(el, msg, kind) {
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'log' + (kind ? ' ' + kind : '');
  }

  function confirmTap(btn, label, action) {
    if (!btn) return action();
    if (btn.dataset.armed === '1') {
      btn.dataset.armed = '';
      btn.textContent = label;
      return action();
    }
    const original = btn.textContent;
    btn.dataset.armed = '1';
    btn.textContent = 'Tap again to confirm';
    setTimeout(() => {
      if (btn.dataset.armed === '1') {
        btn.dataset.armed = '';
        btn.textContent = original;
      }
    }, 2600);
  }

  function mediaDark() {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
      return false;
    }
  }

  function applyTheme(theme, save) {
    const t = theme === 'dark' || theme === 'light' ? theme : 'system';
    S.theme = t;
    const dark = t === 'dark' || (t === 'system' && mediaDark());
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (save) {
      try {
        chrome.storage.local.set({ mpTheme: t });
      } catch (e) {
        /* ignore */
      }
    }
  }

  function cycleTheme() {
    const order = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(S.theme) + 1) % order.length];
    applyTheme(next, true);
    toast('Theme: ' + next, 'ok');
  }

  function isProductTab(tab) {
    const url = (tab && tab.url) || '';
    if (/^https:\/\/(www\.)?meesho\.com\//.test(url) && /\/p\//i.test(url)) return true;
    if (/^https:\/\/(www\.)?flipkart\.com\//.test(url) && /\/p\/itm/i.test(url)) return true;
    return false;
  }

  function isSeller(tab) {
    return !!tab && /^https:\/\/(supplier\.meesho\.com|seller\.flipkart\.com)\//.test(tab.url || '');
  }

  async function getActiveTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs[0] || null;
    } catch (e) {
      return null;
    }
  }

  async function sendToTab(tab, msg) {
    if (!tab || tab.id == null) return null;
    try {
      return await chrome.tabs.sendMessage(tab.id, msg);
    } catch (e) {
      const files = isSeller(tab) ? ['common.js', 'content-seller.js'] : ['common.js', 'content-pdp.js'];
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files });
        await MP.sleep(500);
        return await chrome.tabs.sendMessage(tab.id, msg);
      } catch (e2) {
        return null;
      }
    }
  }

  /* ---------------- tabs ---------------- */
  function switchTab(name) {
    $$('.tab').forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + name));
    if (name === 'tools') {
      renderTools();
      updateCacheInfo();
    }
    if (name === 'library') renderLibrary();
    if (name === 'share') renderShare();
    const main = $('main');
    if (main) main.scrollTop = 0;
  }

  /* ---------------- render: header ---------------- */
  function updateStats() {
    const el = (id, value) => {
      const node = $(id);
      if (node) node.textContent = String(value);
    };
    el('statImages', (S.product && S.product.images ? S.product.images.length : 0));
    el('statLibrary', S.history.length);
    el('statCache', S.cacheCount || 0);
    el('statScore', S.lastScore ? S.lastScore + '%' : '\u2014');
  }

  function renderHeader() {
    const pill = $('statusPill');
    let text = 'No product';
    let cls = 'statusChip';
    if (isSeller(S.tab)) {
      text = 'Seller page';
      cls = 'statusChip warn';
    } else if (S.product) {
      text = 'Ready \u2713';
      cls = 'statusChip ok';
    }
    pill.textContent = text;
    pill.className = cls;

    let sub = 'capture \u2192 listing \u2192 share';
    if (S.tab) {
      try {
        sub = new URL(S.tab.url).hostname.replace(/^www\./, '');
      } catch (e) {
        /* ignore */
      }
    }
    if (S.product) sub += ' \u00b7 ' + ((S.product.images || []).length) + ' images';
    $('subtitle').textContent = sub;
    $('tabImgCount').textContent = String((S.product && S.product.images ? S.product.images.length : 0));
    $('imgBadge').textContent = String((S.product && S.product.images ? S.product.images.length : 0));
    updateStats();
  }

  /* ---------------- render: product ---------------- */
  function addRow(container, label, value, long) {
    if (!value) return;
    const row = document.createElement('div');
    row.className = 'row';

    const head = document.createElement('div');
    head.className = 'rowHead';
    const lab = document.createElement('div');
    lab.className = 'rowLabel';
    lab.textContent = label;

    const btn = document.createElement('button');
    btn.className = 'mini';
    btn.textContent = 'Copy';
    btn.onclick = async () => {
      const ok = await MP.copyText(value);
      btn.textContent = ok ? 'Copied' : 'Fail';
      if (ok) toast(label + ' copied', 'ok');
      setTimeout(() => {
        btn.textContent = 'Copy';
      }, 1500);
    };
    head.appendChild(lab);
    head.appendChild(btn);

    const val = document.createElement('div');
    val.className = 'val' + (long ? ' long' : '');
    val.textContent = value;

    row.appendChild(head);
    row.appendChild(val);
    container.appendChild(row);
  }

  function renderDetails() {
    const p = S.product;
    $('emptyDetails').classList.toggle('hidden', !!p);
    $('productDetails').classList.toggle('hidden', !p);
    if (!p) return;

    const img = $('mainImg');
    const src = p.mainImage || (p.images && p.images[0]) || '';
    img.onerror = () => {
      img.style.visibility = 'hidden';
    };
    img.onload = () => {
      img.style.visibility = 'visible';
    };
    img.referrerPolicy = 'no-referrer';
    img.src = src;
    img.style.visibility = src ? 'visible' : 'hidden';

    $('prodTitle').textContent = p.title || 'Untitled product';

    const prof = currentProfile();
    const price = $('prodPrice');
    const showPrice = (prof && prof.selling) || p.price;
    price.textContent = showPrice ? MP.inr(showPrice) : 'Price not found';
    const mrp = (prof && prof.mrp) || p.mrp;
    if (mrp && Number(mrp) > Number(showPrice)) {
      const sm = document.createElement('small');
      sm.textContent = 'MRP ' + MP.inr(mrp);
      price.appendChild(sm);
      const off = (prof && prof.discount) || MP.discount(mrp, showPrice);
      if (off) {
        const tag = document.createElement('span');
        tag.className = 'off';
        tag.textContent = off + '% OFF';
        price.appendChild(tag);
      }
    }

    const metaBits = [];
    if (p.category) metaBits.push(p.category);
    if (p.rating) metaBits.push('\u2b50 ' + p.rating + (p.ratingCount ? ' (' + p.ratingCount + ')' : ''));
    if (p.colors && p.colors.length) metaBits.push(p.colors.slice(0, 3).join(', '));
    $('prodMeta').textContent = metaBits.join(' \u00b7 ');

    const rows = $('detailRows');
    rows.innerHTML = '';

    if (p.title) addRow(rows, 'Title', p.title, false);
    if (p.productId) addRow(rows, 'Product ID', p.productId, false);
    if (p.category) addRow(rows, 'Category', p.category + (p.subcategory ? ' / ' + p.subcategory : ''), false);
    if (p.brand) addRow(rows, 'Brand', p.brand, false);
    if (p.price) {
      addRow(
        rows,
        'Price',
        MP.inr(p.price) +
          (p.mrp && p.mrp > p.price
            ? '   MRP ' + MP.inr(p.mrp) + '   ' + (p.discount || MP.discount(p.mrp, p.price)) + '% OFF'
            : ''),
        false
      );
    }
    if (p.rating) addRow(rows, 'Rating', p.rating + (p.ratingCount ? ' (' + p.ratingCount + ' ratings)' : ''), false);
    if (p.colors && p.colors.length) addRow(rows, 'Colours', p.colors.join(', '), false);
    if (p.sizes && p.sizes.length) addRow(rows, 'Sizes', p.sizes.join(', '), false);
    if (p.fabric) addRow(rows, 'Fabric', p.fabric, false);
    if (p.seller) addRow(rows, 'Seller', p.seller, false);
    if (p.returnPolicy) addRow(rows, 'Return policy', p.returnPolicy, false);

    const specs = Object.entries(p.specifications || {})
      .filter(([k, v]) => k && v)
      .map(([k, v]) => k + ': ' + v)
      .join('\n');
    if (specs) addRow(rows, 'Specifications', specs, true);
    if (p.highlights && p.highlights.length) addRow(rows, 'Highlights', p.highlights.join('\n'), true);
    if (p.description) addRow(rows, 'Description', p.description, true);
    if (p.images && p.images.length) {
      addRow(rows, 'Image links', p.images.map((u, i) => i + 1 + '. ' + u).join('\n'), true);
    }
  }

  function quickValue(kind) {
    const p = S.product;
    if (!p) return '';
    if (kind === 'title') return p.title || '';
    if (kind === 'price') {
      const prof = currentProfile();
      return prof && prof.selling ? String(prof.selling) : String(p.price || '');
    }
    if (kind === 'desc') {
      const prof = currentProfile();
      return (prof && prof.description) || p.description || '';
    }
    if (kind === 'specs') {
      return Object.entries(p.specifications || {})
        .filter(([k, v]) => k && v)
        .map(([k, v]) => k + ': ' + v)
        .join('\n');
    }
    if (kind === 'links') return (p.images || []).join('\n');
    return '';
  }

  /* ---------------- render: images ---------------- */
  function renderImages() {
    const p = S.product;
    const images = (p && p.images) || [];
    $('imgEmpty').classList.toggle('hidden', images.length > 0);
    $('imgBody').classList.toggle('hidden', !images.length);
    if (!images.length) return;

    const grid = $('imageGrid');
    grid.innerHTML = '';

    images.forEach((url, i) => {
      const tile = document.createElement('div');
      tile.className = 'tile' + (S.selected.has(url) ? ' sel' : '') + (i === 0 ? ' main' : '');
      tile.title = url;

      const check = document.createElement('span');
      check.className = 'check';
      check.textContent = '\u2713';

      const img = document.createElement('img');
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => tile.classList.add('broken');
      img.src = url;

      const idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = String(i + 1);

      const star = document.createElement('button');
      star.className = 'star';
      star.title = 'Set as main image';
      star.textContent = '\u2605';
      star.onclick = (ev) => {
        ev.stopPropagation();
        setMainImage(url);
      };

      tile.onclick = () => {
        if (S.selected.has(url)) S.selected.delete(url);
        else S.selected.add(url);
        tile.classList.toggle('sel', S.selected.has(url));
        updateSelCount();
        renderFill();
      };

      tile.appendChild(check);
      tile.appendChild(img);
      tile.appendChild(idx);
      tile.appendChild(star);
      grid.appendChild(tile);
    });

    updateSelCount();
  }

  function updateSelCount() {
    const images = (S.product && S.product.images) || [];
    const box = $('selectAll');
    $('selCount').textContent = S.selected.size + ' of ' + images.length + ' selected';
    box.checked = images.length > 0 && S.selected.size === images.length;
    box.indeterminate = S.selected.size > 0 && S.selected.size < images.length;
  }

  function selectedUrls() {
    const images = (S.product && S.product.images) || [];
    return images.filter((u) => S.selected.has(u));
  }

  /* ---------------- render: fill ---------------- */
  function currentProfile() {
    if (S.legacyProfile) return S.legacyProfile;
    if (!S.product) return null;
    const p = MP.buildProfile(S.product, S.settings);
    const urls = selectedUrls();
    if (urls.length) p.images = urls.slice(0, Math.max(1, Number(S.settings.maxImages) || 8));
    return p;
  }

  function renderFill() {
    const box = $('fillPreview');
    const quality = $('qualityList');
    const scoreBadge = $('qualityScore');
    const prof = currentProfile();

    if (!prof) {
      box.className = 'fillPreview muted';
      box.textContent = 'Product capture karo ya share link import karo...';
      quality.innerHTML = '';
      scoreBadge.textContent = '\u2014';
      scoreBadge.className = 'scorePill';
      S.lastScore = 0;
      updateStats();
      return;
    }

    box.className = 'fillPreview';
    const limit = Math.max(20, Number(S.settings.titleLimit) || 60);
    const title = prof.meeshoTitle || prof.title || '';
    const lenClass = title.length > limit ? 'bad' : 'good';
    const descLen = String(prof.description || '').length;
    const imgCount = (prof.images && prof.images.length) || 0;

    const parts = [];
    parts.push('<b>' + esc(title) + '</b> <span class="chars ' + lenClass + '">' + title.length + '/' + limit + '</span>');
    parts.push(
      'Price: <b>' + (prof.selling ? MP.inr(prof.selling) : '-') + '</b> &nbsp; MRP: ' +
        (prof.mrp ? MP.inr(prof.mrp) : '-') +
        ' &nbsp; HSN: <b>' + esc(prof.hsn || '-') + '</b>' +
        ' &nbsp; GST: <b>' + esc(prof.gst || '-') + '</b>'
    );
    if (prof.colorList && prof.colorList.length) parts.push('Colours: ' + esc(prof.colorList.join(', ')));
    if (prof.sizes) parts.push('Sizes: ' + esc(prof.sizes));
    parts.push('Description: ' + descLen + ' chars &nbsp; Images: ' + imgCount);
    box.innerHTML = parts.join('<br>');

    const checks = [
      { label: 'Title', state: title.length > limit ? 'bad' : title.length < 15 ? 'warn' : 'good', text: title.length + '/' + limit },
      { label: 'Price', state: prof.selling > 0 ? 'good' : 'bad', text: prof.selling ? MP.inr(prof.selling) : 'missing' },
      { label: 'Description', state: descLen >= 120 ? 'good' : descLen > 0 ? 'warn' : 'bad', text: descLen + ' chars' },
      { label: 'Images', state: imgCount >= 3 ? 'good' : imgCount > 0 ? 'warn' : 'bad', text: imgCount + ' photos' },
      {
        label: 'Variants',
        state: (prof.colorList && prof.colorList.length) || (prof.sizeList && prof.sizeList.length) ? 'good' : 'warn',
        text: ((prof.colorList && prof.colorList.length) || 0) + ' colours'
      },
      { label: 'HSN / GST', state: prof.hsn && prof.gst ? 'good' : 'warn', text: (prof.hsn || '-') + ' / ' + (prof.gst || '-') },
      { label: 'Shipping', state: prof.weightGrams > 0 ? 'good' : 'warn', text: prof.weightText || '-' },
      { label: 'SKU', state: prof.sku ? 'good' : 'warn', text: prof.sku || '-' }
    ];

    quality.innerHTML = checks
      .map((c) => '<div class="qitem ' + c.state + '"><i></i><b>' + esc(c.label) + '</b><span>' + esc(c.text) + '</span></div>')
      .join('');

    const good = checks.filter((c) => c.state === 'good').length;
    const score = Math.round((good / checks.length) * 100);
    S.lastScore = score;
    scoreBadge.textContent = score + '%';
    scoreBadge.className = 'scorePill ' + (score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad');
    updateStats();
  }

  /* ---------------- render: settings ---------------- */
  function renderSettings() {
    const s = S.settings;
    $('setBrand').value = s.brand || '';
    $('setManufacturer').value = s.manufacturerName || '';
    $('setAddress').value = s.manufacturerAddress || '';
    $('setCountry').value = s.country || 'India';
    $('setHsn').value = s.hsnDefault || '6211';
    $('setGst').value = String(s.gstMode || 'auto');
    $('setTitleLimit').value = String(s.titleLimit || 60);
    $('setPriceAdjust').value = String(s.priceAdjust || 0);
    $('setPriceOverride').value = Number(s.priceOverride) ? String(s.priceOverride) : '';
    $('setStock').value = String(s.defaultStock || 20);
    $('setMaxImages').value = String(s.maxImages || 8);
    $('setWeight').value = String(s.weightGrams || 0);
    $('setLength').value = String(s.length || 0);
    $('setBreadth').value = String(s.breadth || 0);
    $('setHeight').value = String(s.height || 0);
    $('setAutoAttach').checked = s.autoAttachImages !== false;
    $('setWatch').checked = s.watchSteps !== false;
    if ($('setAutoCollect')) $('setAutoCollect').checked = s.autoCollect !== false;
    if ($('setAutoSubmit')) $('setAutoSubmit').checked = s.autoSubmit === true;
    if ($('setAutoSteps')) $('setAutoSteps').value = String(s.autoSteps || 12);
    if ($('setViewerBase')) $('setViewerBase').value = s.viewerBase || '';
  }

  /* ---------------- render: tools ---------------- */
  function profitInputs() {
    return {
      cost: Math.max(0, Number($('profitCost').value) || 0),
      selling: Math.max(0, Number($('profitSelling').value) || 0),
      commission: clamp($('profitCommission').value, 0, 60),
      shipping: Math.max(0, Number($('profitShipping').value) || 0),
      target: clamp($('profitTarget').value, 0, 80),
      gst: clamp($('profitGst').value, 0, 28)
    };
  }

  function renderProfit() {
    const v = profitInputs();
    const denom = 1 - (v.commission + v.target) / 100;
    const recommended = denom > 0.02 ? MP.round9((v.cost + v.shipping) / denom) : 0;
    const beDenom = 1 - v.commission / 100;
    const breakEven = beDenom > 0.02 ? MP.round9((v.cost + v.shipping) / beDenom) : 0;
    const profit = v.selling ? v.selling - v.cost - v.shipping - (v.selling * v.commission) / 100 : 0;
    const margin = v.selling ? (profit / v.selling) * 100 : 0;
    const gstAmt = v.selling ? (v.selling * v.gst) / (100 + v.gst) : 0;

    S.lastProfit = { recommended, breakEven, profit, margin, gstAmt, selling: v.selling };

    $('profitOut').innerHTML =
      '<div class="stat hi"><small>Recommended</small><b>' + (recommended ? MP.inr(recommended) : '-') + '</b></div>' +
      '<div class="stat"><small>Break-even</small><b>' + (breakEven ? MP.inr(breakEven) : '-') + '</b></div>' +
      '<div class="stat"><small>Profit @ ' + (v.selling ? MP.inr(v.selling) : 'selling') + '</small><b class="' + (profit >= 0 ? 'good' : 'bad') + '">' + MP.inr(Math.round(profit)) + '</b></div>' +
      '<div class="stat"><small>Margin</small><b class="' + (margin >= 0 ? 'good' : 'bad') + '">' + (v.selling ? margin.toFixed(1) + '%' : '-') + '</b></div>' +
      '<div class="stat"><small>Platform fees</small><b>' + MP.inr(Math.round((v.selling * v.commission) / 100)) + '</b></div>' +
      '<div class="stat"><small>GST in price</small><b>' + MP.inr(Math.round(gstAmt)) + '</b></div>';
  }

  function renderTitleMeter() {
    const text = $('toolsTitle').value.trim();
    const limit = Math.max(20, Number(S.settings.titleLimit) || 60);
    const badge = $('titleMeter');
    badge.textContent = text.length + '/' + limit;
    badge.className = 'badge ' + (text.length > limit ? 'bad' : text.length < 15 ? 'warn' : 'good');

    const info = $('titleInfo');
    const overrideActive =
      !!S.settings.titleOverride &&
      (!S.settings.titleOverrideKey || S.settings.titleOverrideKey === S.productKey);
    if (overrideActive) {
      info.innerHTML = 'Custom title <b>active</b> hai \u2014 listing me yahi use hoga.';
    } else {
      info.textContent = 'Auto title use ho raha hai. Yahan se optimize karke "Use for listing" dabao.';
    }
  }

  function keywordList() {
    const prof = currentProfile();
    if (!prof) return [];
    return MP.unique(
      String(prof.keywords || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ).slice(0, 26);
  }

  function renderKeywords() {
    const box = $('keywordChips');
    const words = keywordList();
    if (!words.length) {
      box.innerHTML = '<span class="muted">Product capture karo, keywords auto ban jayenge.</span>';
      return;
    }
    box.innerHTML = '';
    words.forEach((word) => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = word;
      chip.title = 'Copy "' + word + '"';
      chip.onclick = async () => {
        const ok = await MP.copyText(word);
        toast(ok ? 'Copied: ' + word : 'Copy fail', ok ? 'ok' : 'err');
      };
      box.appendChild(chip);
    });
  }

  function renderTools(force) {
    const key = S.product ? S.productKey || MP.historyKey(S.product) : 'none';
    if (!force && S.toolsKey === key) {
      renderProfit();
      renderKeywords();
      return;
    }
    S.toolsKey = key;

    $('profitCost').value = S.profit.cost === '' || S.profit.cost == null ? '' : String(S.profit.cost);
    $('profitSelling').value = S.profit.selling === '' || S.profit.selling == null ? '' : String(S.profit.selling);
    $('profitCommission').value = String(S.profit.commission == null ? 12 : S.profit.commission);
    $('profitShipping').value = String(S.profit.shipping == null ? 60 : S.profit.shipping);
    $('profitTarget').value = String(S.profit.target == null ? 25 : S.profit.target);
    $('profitGst').value = String(S.profit.gst == null ? 5 : S.profit.gst);

    if (S.product) {
      const prof = currentProfile();
      const sell = (prof && prof.selling) || S.product.price || 0;
      if (sell) $('profitSelling').value = String(sell);
      if (!Number($('profitCost').value)) {
        const srcPrice = Number(S.product.price) || 0;
        if (srcPrice) $('profitCost').value = String(Math.max(1, Math.round(srcPrice * 0.55)));
      }
    }

    const activeTitle =
      S.settings.titleOverride &&
      (!S.settings.titleOverrideKey || S.settings.titleOverrideKey === S.productKey)
        ? S.settings.titleOverride
        : '';
    $('toolsTitle').value = activeTitle || (S.product && S.product.title) || '';
    renderProfit();
    renderTitleMeter();
    renderKeywords();
  }

  /* ---------------- render: library ---------------- */
  function renderLibrary() {
    $('libCount').textContent = S.history.length + ' saved';
    $('libEmpty').classList.toggle('hidden', S.history.length > 0);
    updateStats();

    const list = $('libList');
    list.innerHTML = '';

    S.history.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'libItem';

      const img = document.createElement('img');
      img.className = 'libThumb';
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => {
        img.style.visibility = 'hidden';
      };
      if (item.image) img.src = item.image;

      const info = document.createElement('div');
      info.className = 'libInfo';
      const title = document.createElement('div');
      title.className = 'libTitle';
      title.textContent = item.title || 'Untitled product';
      const meta = document.createElement('div');
      meta.className = 'libMeta';
      meta.innerHTML =
        (item.price ? '<b>' + MP.inr(item.price) + '</b> \u00b7 ' : '') +
        (item.imageCount || 0) + ' photos \u00b7 ' +
        esc(MP.relativeTime(item.at));
      info.appendChild(title);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'libActions';
      const load = document.createElement('button');
      load.className = 'mini';
      load.textContent = 'Load';
      load.onclick = () => loadHistoryItem(item);
      const del = document.createElement('button');
      del.className = 'mini del';
      del.textContent = 'Delete';
      del.onclick = async () => {
        S.history = await MP.removeHistory(item.key);
        renderLibrary();
        toast('Library item deleted', 'ok');
      };
      actions.appendChild(load);
      actions.appendChild(del);

      row.appendChild(img);
      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  /* ---------------- render all ---------------- */
  function renderAll() {
    S.share = null;
    renderHeader();
    renderDetails();
    renderImages();
    renderFill();
    renderLibrary();
    renderShare();
  }

  function autoSelect() {
    const imgs = (S.product && S.product.images) || [];
    S.selected = new Set(imgs.slice(0, Math.max(1, Number(S.settings.maxImages) || 8)));
  }

  async function pruneOverrides() {
    if (!S.productKey) return;
    const patch = {};
    if (S.settings.titleOverrideKey && S.settings.titleOverrideKey !== S.productKey) {
      patch.titleOverride = '';
      patch.titleOverrideKey = '';
    }
    if (S.settings.priceOverrideKey && S.settings.priceOverrideKey !== S.productKey) {
      patch.priceOverride = 0;
      patch.priceOverrideKey = '';
    }
    if (Object.keys(patch).length) {
      S.settings = await MP.saveSettings(patch);
    }
  }

  /* ---------------- data actions ---------------- */
  async function setStorage(obj) {
    try {
      await chrome.storage.local.set(obj);
    } catch (e) {
      /* ignore */
    }
  }

  function cacheImagesMessage(urls) {
    const list = (urls || []).filter((u) => /^https?:\/\//i.test(String(u || ''))).slice(0, 20);
    if (!list.length) return;
    try {
      const p = chrome.runtime.sendMessage({ type: 'cache-images', urls: list });
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* cache optional */
    }
  }

  async function refresh() {
    S.tab = await getActiveTab();

    let stored = {};
    try {
      stored = await chrome.storage.local.get(['mpProduct', 'mpSettings', 'mpHistory', 'mpProfit', 'mpTheme', 'mpCollected']);
    } catch (e) {
      stored = {};
    }

    S.settings = Object.assign({}, MP.DEFAULT_SETTINGS, stored.mpSettings || {});
    S.profit = Object.assign({}, PROFIT_DEFAULT, stored.mpProfit || {});
    S.history = Array.isArray(stored.mpHistory) ? stored.mpHistory : [];
    S.collected = Array.isArray(stored.mpCollected) ? stored.mpCollected : [];
    if (stored.mpTheme) applyTheme(stored.mpTheme, false);
    S.product = stored.mpProduct || null;

    if (isProductTab(S.tab)) {
      const res = await sendToTab(S.tab, { type: 'mp-extract' });
      if (res && res.product) S.product = res.product;
    }

    if (S.product) {
      S.productKey = MP.historyKey(S.product);
      await pruneOverrides();
      autoSelect();
      S.history = await MP.addHistory(S.product);
    } else {
      S.productKey = '';
      S.selected.clear();
    }

    renderSettings();
    renderAll();
    renderTools(true);
    updateCacheInfo();
  }

  async function captureNow() {
    if (!isProductTab(S.tab)) {
      setLog($('captureLog'), 'Pehle Meesho ya Flipkart product page kholo, phir capture dabao.', 'err');
      toast('Pehle Meesho/Flipkart product page kholo', 'err');
      return;
    }
    setLog($('captureLog'), 'Page scan ho raha hai...', '');
    const res = await sendToTab(S.tab, { type: 'mp-extract' });
    if (res && res.product) {
      S.legacyProfile = null;
      S.product = res.product;
      S.productKey = MP.historyKey(res.product);
      await setStorage({ mpProduct: res.product });
      autoSelect();
      S.history = await MP.addHistory(res.product);
      renderAll();
      renderTools(true);
      setLog($('captureLog'), 'Captured \u2713 ' + (res.product.images || []).length + ' images mile.', 'ok');
      toast('Product captured: ' + (res.product.images || []).length + ' images', 'ok');
    } else {
      setLog($('captureLog'), 'Details nahi mile. Page reload karke phir try karo.', 'err');
      toast('Capture fail \u2014 page reload karke try karo', 'err');
    }
  }

  async function copyAll() {
    if (!S.product) return toast('Pehle product capture karo', 'err');
    const ok = await MP.copyText(MP.formatProductText(S.product));
    toast(ok ? 'Saari details copy ho gayi' : 'Copy fail', ok ? 'ok' : 'err');
  }

  async function copyJson() {
    if (!S.product) return toast('Pehle product capture karo', 'err');
    const ok = await MP.copyText(JSON.stringify(S.product, null, 2));
    toast(ok ? 'Product JSON copied' : 'Copy fail', ok ? 'ok' : 'err');
  }

  function shareSignature() {
    if (!S.product) return '';
    const prof = currentProfile();
    return [
      S.productKey || MP.historyKey(S.product),
      prof && (prof.title || prof.meeshoTitle) ? prof.title || prof.meeshoTitle : '',
      prof && prof.selling ? prof.selling : '',
      prof && Array.isArray(prof.images) ? prof.images.length : 0,
      S.settings.titleLimit || '',
      S.settings.maxImages || '',
      S.settings.viewerBase || ''
    ].join('|');
  }

  async function buildShareData() {
    if (!S.product) return null;
    const profile = currentProfile();
    const code = await MP.encodeShare(S.product, S.settings, { profile });
    return {
      code,
      profile,
      link: MP.shareLink(code),
      viewerLink: MP.viewerLink(S.settings.viewerBase, code),
      at: Date.now(),
      sig: shareSignature()
    };
  }

  async function ensureShare() {
    const sig = shareSignature();
    if (S.share && S.share.sig === sig) {
      autoCollect(S.share);
      return S.share;
    }
    const data = await buildShareData();
    if (!data) return null;
    data.sig = sig;
    S.share = data;
    await autoCollect(data);
    return data;
  }

  async function autoCollect(data) {
    if (!data || !S.product || S.settings.autoCollect === false) return;
    const key = S.productKey || MP.historyKey(S.product);
    if (!key) return;
    const prev = (S.collected || []).find((x) => x && x.key === key);
    if (prev && prev.code === data.code) return;
    S.collected = await MP.collectShare({
      key,
      code: data.code,
      title: S.product.title || '',
      price: (data.profile && data.profile.selling) || S.product.price || 0,
      mrp: (data.profile && data.profile.mrp) || S.product.mrp || 0,
      image: S.product.mainImage || (S.product.images || [])[0] || '',
      images: (S.product.images || []).length,
      category: S.product.category || ''
    });
    renderCollected();
  }

  function renderCollected() {
    const list = (S.collected || []).filter((x) => x && x.code);
    const pill = $('collectPill');
    if (pill) {
      pill.textContent = list.length ? list.length + ' saved' : '0';
      pill.className = 'badge ' + (list.length ? 'good' : 'soft');
    }
    const box = $('collectList');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<p class="muted">Abhi kuch collect nahi hua. Product capture karo \u2014 share code khud queue me aa jayega.</p>';
      return;
    }
    box.innerHTML = list
      .slice(0, 8)
      .map((x) => {
        const price = x.price ? MP.inr(x.price) : '';
        return (
          '<div class="collectItem">' +
          (x.image
            ? '<img src="' + esc(x.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
            : '<span class="collectDot"></span>') +
          '<div class="collectMeta"><b>' + esc(x.title || 'Untitled product') + '</b><span>' +
          esc([price, (x.images || 0) + ' photos', MP.relativeTime(x.at)].filter(Boolean).join(' \u00b7 ')) +
          '</span></div>' +
          '<button class="mini collectRm" data-key="' + esc(x.key) + '" title="Remove">&times;</button>' +
          '</div>'
        );
      })
      .join('');
    box.querySelectorAll('.collectRm').forEach((btn) => {
      btn.onclick = async () => {
        S.collected = await MP.removeCollected(btn.dataset.key);
        renderCollected();
        toast('Collected item hata diya', 'ok');
      };
    });
  }

  async function copyCollected() {
    const list = S.collected || [];
    if (!list.length) return toast('Abhi kuch collect nahi hua', 'err');
    const ok = await MP.copyText(MP.collectedLines(list));
    toast(ok ? list.length + ' share codes copied' : 'Copy fail', ok ? 'ok' : 'err');
    if (ok) setLog($('collectLog'), 'Saare codes copy \u2014 data/shares.txt me paste karo.', 'ok');
  }

  function downloadCollected() {
    const list = S.collected || [];
    if (!list.length) return toast('Abhi kuch collect nahi hua', 'err');
    const header = [
      '# Meesho Product Pro - auto collected share codes',
      '# ' + new Date().toISOString(),
      '# ' + list.length + ' products',
      ''
    ].join('\n');
    const blob = new Blob([header + MP.collectedLines(list) + '\n'], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shares.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setLog($('collectLog'), list.length + ' products ka shares.txt download ho gaya.', 'ok');
    toast('shares.txt download ho gaya', 'ok');
  }

  async function clearCollectedNow() {
    S.collected = await MP.clearCollected();
    renderCollected();
    setLog($('collectLog'), 'Collected queue clear ho gayi.', 'ok');
    toast('Collected queue clear', 'ok');
  }

  function renderShare() {
    const pill = $('sharePill');
    const out = $('shareLinkOut');
    const box = $('shareContents');
    const pre = $('listingText');
    if (!pill || !out || !box || !pre) return;

    if (!S.product) {
      out.value = '';
      pill.textContent = 'No data';
      pill.className = 'badge soft';
      box.innerHTML = '';
      pre.textContent = 'Product capture karo...';
      renderCollected();
      return;
    }

    const profile = currentProfile();
    pre.textContent = MP.formatListingText(S.product, profile, S.settings);
    box.innerHTML = MP.shareContents(S.product, profile, S.settings)
      .map((c) => {
        const ok = !/missing|^0 /.test(c.value);
        return (
          '<div class="shareItem' + (ok ? ' good' : '') + '"><span>' + esc(c.label) + '</span><b>' + esc(c.value) + '</b></div>'
        );
      })
      .join('');

    const token = ++S.shareToken;
    ensureShare()
      .then((data) => {
        if (!data || token !== S.shareToken) return;
        out.value = data.link;
        pill.textContent = 'Ready';
        pill.className = 'badge good';
        const specs = Object.keys(S.product.specifications || {}).length;
        setLog(
          $('shareLog'),
          'Full link ready \u00b7 ' + (S.product.images || []).length + ' photos \u00b7 ' + specs + ' specs \u00b7 settings + listing included',
          'ok'
        );
      })
      .catch((e) => {
        pill.textContent = 'Error';
        pill.className = 'badge bad';
        setLog($('shareLog'), 'Share error: ' + e.message, 'err');
      });
  }

  async function copyShare() {
    if (!S.product) return toast('Pehle product capture karo', 'err');
    cacheImagesMessage(S.product.images || []);
    try {
      const data = await ensureShare();
      const ok = await MP.copyText(data.link);
      const n = (S.product.images || []).length;
      toast(ok ? 'Full share link copied (' + n + ' photos)' : 'Copy fail', ok ? 'ok' : 'err');
      if (ok) {
        setLog(
          $('shareLog'),
          'Full share link copy ho gaya \u2014 ' + n + ' photos + specs + settings + listing. Import karte hi form auto-fill hoga.',
          'ok'
        );
        switchTab('share');
      }
      S.history = await MP.addHistory(S.product);
      renderLibrary();
    } catch (e) {
      toast('Share link error: ' + e.message, 'err');
    }
  }

  async function copyShareCode() {
    if (!S.product) return toast('Pehle product capture karo', 'err');
    try {
      const data = await ensureShare();
      const ok = await MP.copyText(data.code);
      toast(ok ? 'Share code copied' : 'Copy fail', ok ? 'ok' : 'err');
    } catch (e) {
      toast('Share error: ' + e.message, 'err');
    }
  }

  async function copyViewerLink() {
    if (!S.product) return toast('Pehle product capture karo', 'err');
    if (!String(S.settings.viewerBase || '').trim()) {
      switchTab('settings');
      toast('Pehle Settings me public viewer URL daalo', 'err');
      return;
    }
    try {
      const data = await ensureShare();
      const ok = await MP.copyText(data.viewerLink);
      toast(ok ? 'Viewer link copied' : 'Copy fail', ok ? 'ok' : 'err');
    } catch (e) {
      toast('Viewer link error: ' + e.message, 'err');
    }
  }

  async function openViewer() {
    if (!S.product) return toast('Pehle product capture karo', 'err');
    try {
      const data = await ensureShare();
      cacheImagesMessage(S.product.images || []);
      const url = chrome.runtime.getURL('viewer.html') + '#mp=' + encodeURIComponent(data.code);
      await chrome.tabs.create({ url });
      toast('Full data viewer khul gaya', 'ok');
    } catch (e) {
      toast('Viewer error: ' + e.message, 'err');
    }
  }

  async function downloadShare() {
    if (!S.product) return toast('Pehle product capture karo', 'err');
    try {
      const data = await ensureShare();
      const payload = {
        app: 'Meesho Product Pro',
        version: 5,
        createdAt: new Date().toISOString(),
        shareCode: data.code,
        shareLink: data.link,
        viewerLink: data.viewerLink,
        product: S.product,
        profile: data.profile,
        settings: S.settings
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = MP.safeFolder(S.product.productId || S.product.title) + '-share.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Share JSON download ho gaya', 'ok');
    } catch (e) {
      toast('Download error: ' + e.message, 'err');
    }
  }

  async function copyListingText() {
    if (!S.product) return toast('Pehle product capture karo', 'err');
    const text = MP.formatListingText(S.product, currentProfile(), S.settings);
    const ok = await MP.copyText(text);
    toast(ok ? 'Full listing text copied' : 'Copy fail', ok ? 'ok' : 'err');
  }

  async function quickCopy(kind) {
    if (!S.product) return toast('Pehle product capture karo', 'err');
    const value = quickValue(kind);
    if (!value) return toast('Yeh detail available nahi hai', 'err');
    const ok = await MP.copyText(value);
    toast(ok ? kind.charAt(0).toUpperCase() + kind.slice(1) + ' copied' : 'Copy fail', ok ? 'ok' : 'err');
  }

  function showFillResult(res) {
    if (!res) {
      setLog($('fillLog'), 'Seller page se connection nahi bana. Page reload karke try karo.', 'err');
      toast('Seller page se connection nahi bana', 'err');
      return;
    }
    let msg = 'Filled ' + ((res.filled && res.filled.length) || 0) + ' fields \u2713';
    if (res.missed && res.missed.length) msg += '\nMissed: ' + res.missed.join(', ');
    if (res.attach) {
      msg += res.attach.ok
        ? '\nPhotos attach: ' + res.attach.count + ' \u2713'
        : res.attach.queued
        ? '\nPhotos ka wait: seller form ka Images step kholo, khud attach ho jayengi.'
        : '\nPhotos: ' + res.attach.error;
    }
    if (res.pending) {
      msg += '\nForm ready hote hi auto-fill hoga (Add Product page kholo).';
    }
    setLog($('fillLog'), msg, (res.filled && res.filled.length) || res.pending ? 'ok' : 'err');
    toast(
      (res.filled && res.filled.length ? res.filled.length + ' fields filled' : res.pending ? 'Form ready hote hi fill hoga' : 'Fill fail'),
      (res.filled && res.filled.length) || res.pending ? 'ok' : 'err'
    );
  }

  async function doFill(attach) {
    const profile = currentProfile();
    if (!profile) {
      setLog($('fillLog'), 'Pehle Meesho product capture karo ya share link import karo.', 'err');
      toast('Pehle product capture ya import karo', 'err');
      return;
    }
    if (S.product) await setStorage({ mpProduct: S.product });

    if (attach && profile.images && profile.images.length) {
      cacheImagesMessage(profile.images);
    }

    if (isSeller(S.tab)) {
      setLog($('fillLog'), 'Form fill ho raha hai...', '');
      const res = await sendToTab(S.tab, {
        type: 'mp-fill',
        profile,
        product: S.product,
        attachImages: !!attach
      });
      showFillResult(res);
      return;
    }

    await setStorage({ mpPendingFill: true });
    try {
      await chrome.runtime.sendMessage({ type: 'open-seller' });
    } catch (e) {
      /* ignore */
    }
    setLog(
      $('fillLog'),
      'Supplier tab khul gaya. Add Product page par form milte hi data' +
        (attach ? ' + photos' : '') +
        ' auto-fill ho jayenge.',
      'ok'
    );
    toast('Supplier tab khul gaya \u2014 Add Product kholo', 'ok');
  }

  async function autoList() {
    const profile = currentProfile();
    if (!profile) {
      setLog($('autoListLog'), 'Pehle Meesho product capture karo ya share link import karo.', 'err');
      toast('Pehle product capture karo', 'err');
      return;
    }
    if (S.product) await setStorage({ mpProduct: S.product });
    cacheImagesMessage(profile.images || []);

    if (!isSeller(S.tab)) {
      await setStorage({ mpPendingFill: true, mpPendingAuto: true });
      try {
        await chrome.runtime.sendMessage({ type: 'open-seller' });
      } catch (e) {
        /* ignore */
      }
      setLog(
        $('autoListLog'),
        'Supplier tab khul gaya. Add Product page kholte hi auto-list khud start hoga (fields + photos + Next).',
        'ok'
      );
      toast('Add Product page kholo \u2014 auto-list start hoga', 'ok');
      return;
    }

    setLog($('autoListLog'), 'Auto-list chalu... step by step form bh raha hai.', '');
    toast('Auto-list start', 'ok');
    const res = await sendToTab(S.tab, {
      type: 'mp-autolist',
      profile,
      product: S.product,
      submit: S.settings.autoSubmit === true,
      steps: Math.max(1, Math.min(30, Number(S.settings.autoSteps) || 12)),
      attachImages: S.settings.autoAttachImages !== false
    });
    if (!res) {
      setLog($('autoListLog'), 'Seller page se connection nahi bana. Page reload karke try karo.', 'err');
      toast('Seller page se connection nahi bana', 'err');
      return;
    }
    const lines = [];
    if (res.steps) lines.push(res.steps + ' steps complete');
    if (res.filled) lines.push(res.filled + ' fields filled');
    if (res.images) lines.push(res.images + ' photos attached');
    if (res.review) lines.push('Review step aa gaya \u2014 Submit aap dabao.');
    if (res.stopped) lines.push('Auto-list ruk gaya.');
    if (res.error) lines.push(res.error);
    setLog($('autoListLog'), lines.join(' \u00b7 ') || 'Auto-list complete.', res.ok ? 'ok' : 'err');
    toast(res.ok ? 'Auto-list complete \u2713' : 'Auto-list: ' + (res.error || 'check log'), res.ok ? 'ok' : 'err');
  }

  async function copyListing() {
    const profile = currentProfile();
    if (!profile) return toast('Pehle product capture karo', 'err');
    const ok = await MP.copyText(JSON.stringify(profile, null, 2));
    toast(ok ? 'Listing JSON copied' : 'Copy fail', ok ? 'ok' : 'err');
  }

  async function downloadSelected() {
    const urls = selectedUrls();
    if (!urls.length) return toast('Koi image select nahi hai', 'err');
    const p = S.product || {};
    const folder = 'Meesho-' + MP.safeFolder(p.productId || p.title);
    let done = 0;

    for (let i = 0; i < urls.length; i++) {
      setLog($('imgLog'), 'Downloading ' + (i + 1) + '/' + urls.length + '...', '');
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'download-image',
          url: urls[i],
          filename: folder + '/' + MP.imageFileName(urls[i], i)
        });
        if (res && res.ok) done++;
      } catch (e) {
        /* next image */
      }
    }
    setLog($('imgLog'), 'Downloaded ' + done + '/' + urls.length + ' images \u2713', done ? 'ok' : 'err');
    toast('Downloaded ' + done + '/' + urls.length + ' images', done ? 'ok' : 'err');
  }

  async function toPngBlob(blob) {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG convert fail'))), 'image/png');
    });
  }

  async function copyImage() {
    const urls = selectedUrls();
    if (!urls.length) return toast('Pehle koi image select karo', 'err');
    try {
      setLog($('imgLog'), 'Image clipboard me daal rahe hain...', '');
      const res = await chrome.runtime.sendMessage({
        type: 'fetch-image',
        url: urls[0],
        optimize: false
      });
      if (!res || !res.ok) throw new Error((res && res.error) || 'Image fetch fail');
      const blob = await (await fetch(res.dataUrl)).blob();
      const png = await toPngBlob(blob);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      setLog($('imgLog'), 'Image clipboard me copy ho gayi \u2713 Ab paste kar sakte ho.', 'ok');
      toast('Image copied to clipboard', 'ok');
    } catch (e) {
      setLog($('imgLog'), 'Image copy fail: ' + e.message, 'err');
      toast('Image copy fail', 'err');
    }
  }

  async function copyLinks(all) {
    const urls = all
      ? ((S.product && S.product.images) || []).slice()
      : selectedUrls();
    if (!urls.length) return toast(S.product ? 'Koi image nahi mili' : 'Pehle product capture karo', 'err');
    const ok = await MP.copyText(urls.join('\n'));
    toast(ok ? urls.length + ' image links copied' : 'Copy fail', ok ? 'ok' : 'err');
  }

  async function attachImages() {
    const urls = selectedUrls();
    if (!urls.length) return toast('Pehle koi image select karo', 'err');
    if (!isSeller(S.tab)) {
      setLog($('imgLog'), 'Supplier page khul raha hai \u2014 form milte hi data + photos auto-fill honge.', '');
      await doFill(true);
      return;
    }
    setLog($('imgLog'), 'Images attach ho rahi hain...', '');
    const res = await sendToTab(S.tab, {
      type: 'mp-attach',
      images: urls,
      profile: currentProfile()
    });
    if (res && res.ok) {
      setLog($('imgLog'), res.count + ' images attach ho gayi \u2713', 'ok');
      toast(res.count + ' images attached', 'ok');
    } else {
      setLog($('imgLog'), (res && res.error) || 'Attach fail. Seller page reload karo.', 'err');
      toast('Attach fail \u2014 seller page reload karo', 'err');
    }
  }

  async function setMainImage(url) {
    const p = S.product;
    if (!p || !url) return;
    const imgs = (p.images || []).slice();
    const at = imgs.indexOf(url);
    if (at < 0) return;
    imgs.splice(at, 1);
    imgs.unshift(url);
    p.images = imgs;
    p.mainImage = url;
    await setStorage({ mpProduct: p });
    renderDetails();
    renderImages();
    toast('Main image set', 'ok');
  }

  /* ---------------- share / import ---------------- */
  async function loadHistoryItem(item) {
    if (!item || !item.product) return;
    S.legacyProfile = null;
    S.product = MP.sanitizeProduct(item.product);
    S.productKey = MP.historyKey(S.product);
    await pruneOverrides();
    await setStorage({ mpProduct: S.product });
    autoSelect();
    renderAll();
    renderTools(true);
    switchTab('details');
    toast('Library se product load hua', 'ok');
  }

  async function applyImported(data) {
    if (!data || !data.product) throw new Error('Share data me product nahi mila.');
    S.product = MP.sanitizeProduct(data.product);
    S.productKey = MP.historyKey(S.product);
    if (data.settings) {
      S.settings = Object.assign({}, S.settings, data.settings);
      await MP.saveSettings(S.settings);
    }
    await pruneOverrides();
    const base = MP.buildProfile(S.product, S.settings);
    S.legacyProfile =
      data.profile && typeof data.profile === 'object' && (data.profile.title || data.profile.meeshoTitle)
        ? Object.assign({}, base, data.profile)
        : null;
    await setStorage({ mpProduct: S.product });
    autoSelect();
    cacheImagesMessage(Array.from(S.selected));
    S.history = await MP.addHistory(S.product);
    renderSettings();
    renderAll();
    renderTools(true);
    setLog($('importLog'), 'Imported \u2713 ' + (S.product.title || ''), 'ok');
    toast('Product imported', 'ok');
  }

  async function importShare(autoFill) {
    const input = $('shareInput');
    const text = (input.value || '').trim();
    if (!text) {
      setLog($('importLog'), 'Share link ya share code paste karo.', 'err');
      return toast('Share link ya code paste karo', 'err');
    }
    try {
      const data = await MP.decodeShare(text);
      await applyImported(data);
      if (autoFill) await doFill(true);
    } catch (e) {
      setLog($('importLog'), 'Import error: ' + e.message, 'err');
      toast('Import error: ' + e.message, 'err');
    }
  }

  function normalizeLegacy(j) {
    const colors = j.colorList || (j.colors ? MP.splitList(j.colors) : []);
    const sizes = Array.isArray(j.sizes) ? j.sizes : j.sizes ? MP.splitList(j.sizes) : [];
    return {
      source: 'legacy-json',
      title: j.meeshoTitle || j.title || j.productName || '',
      meeshoTitle: j.meeshoTitle || j.title || j.productName || '',
      brand: j.brand || j.biz || '',
      category: j.category || '',
      subcat: j.subcat || j.subcategory || '',
      fabric: j.fabric || '',
      pattern: j.pattern || '',
      colors: Array.isArray(j.colors) ? j.colors.join(', ') : j.colors || colors.join(', '),
      colorList: colors,
      sizes: Array.isArray(j.sizes) ? j.sizes.join(', ') : j.sizes || sizes.join(', '),
      sizeList: sizes,
      mrp: Number(j.mrp) || 0,
      selling: Number(j.selling) || Number(j.price) || 0,
      price: Number(j.selling) || Number(j.price) || 0,
      hsn: j.hsn || '',
      gst: j.gst || (j.gstNum ? j.gstNum + '%' : ''),
      gstNum: j.gstNum || String(j.gst || '').replace(/[^\d]/g, ''),
      weightGrams: Number(j.weightGrams) || 0,
      weightText: j.weightText || (Number(j.weightGrams) ? j.weightGrams + ' grams' : ''),
      length: Number(j.length) || 0,
      breadth: Number(j.breadth) || 0,
      height: Number(j.height) || 0,
      country: j.country || 'India',
      manufacturerName: j.manufacturerName || j.biz || j.brand || '',
      manufacturerAddress: j.manufacturerAddress || j.addr || '',
      description: j.description || '',
      keywords: j.keywords || '',
      care: j.care || '',
      pack: j.pack || '1',
      defaultStock: Number(j.defaultStock) || Number(S.settings.defaultStock) || 20,
      images: Array.isArray(j.images) ? j.images : []
    };
  }

  async function useLegacyJson() {
    try {
      const j = JSON.parse($('legacyJson').value || '');
      if (j.p && j.p.title) {
        await applyImported({ product: j.p, settings: j.s || null });
        return;
      }
      if (j.title && j.price != null && j.images) {
        await applyImported({ product: j, settings: null });
        return;
      }
      const profile = normalizeLegacy(j);
      if (!profile.meeshoTitle) throw new Error('Title nahi mila');
      S.legacyProfile = profile;
      renderFill();
      setLog($('legacyLog'), 'PRO JSON ready \u2713 Ab Fill tab se seller form bharo.', 'ok');
      toast('Legacy PRO JSON ready', 'ok');
    } catch (e) {
      setLog($('legacyLog'), 'JSON error: ' + e.message, 'err');
      toast('JSON error: ' + e.message, 'err');
    }
  }

  /* ---------------- settings ---------------- */
  async function saveSettings() {
    const num = (id, fallback) => {
      const v = Number($(id).value);
      return Number.isFinite(v) ? v : fallback;
    };
    const priceOverride = Math.max(0, num('setPriceOverride', 0));
    const next = Object.assign({}, S.settings, {
      brand: $('setBrand').value.trim(),
      manufacturerName: $('setManufacturer').value.trim(),
      manufacturerAddress: $('setAddress').value.trim(),
      country: $('setCountry').value.trim() || 'India',
      hsnDefault: $('setHsn').value.trim() || '6211',
      gstMode: $('setGst').value,
      titleLimit: Math.max(20, Math.min(200, num('setTitleLimit', 60))),
      priceAdjust: Math.max(-50, Math.min(200, num('setPriceAdjust', 0))),
      priceOverride,
      priceOverrideKey: priceOverride > 0 ? S.productKey || '' : '',
      defaultStock: Math.max(1, num('setStock', 20)),
      maxImages: Math.max(1, Math.min(20, num('setMaxImages', 8))),
      weightGrams: Math.max(0, num('setWeight', 0)),
      length: Math.max(0, num('setLength', 0)),
      breadth: Math.max(0, num('setBreadth', 0)),
      height: Math.max(0, num('setHeight', 0)),
      autoAttachImages: $('setAutoAttach').checked,
      watchSteps: $('setWatch').checked,
      autoCollect: $('setAutoCollect') ? $('setAutoCollect').checked : S.settings.autoCollect !== false,
      autoSubmit: $('setAutoSubmit') ? $('setAutoSubmit').checked : S.settings.autoSubmit === true,
      autoSteps: Math.max(1, Math.min(30, num('setAutoSteps', 12))),
      viewerBase: $('setViewerBase') ? $('setViewerBase').value.trim() : S.settings.viewerBase || ''
    });
    S.settings = await MP.saveSettings(next);
    renderSettings();
    renderFill();
    renderDetails();
    renderTitleMeter();
    renderShare();
    setLog($('settingsLog'), 'Settings save ho gayi \u2713', 'ok');
    toast('Settings saved', 'ok');
  }

  async function resetSettings() {
    S.settings = await MP.saveSettings(Object.assign({}, MP.DEFAULT_SETTINGS));
    renderSettings();
    renderFill();
    renderDetails();
    renderTools(true);
    renderShare();
    setLog($('settingsLog'), 'Settings reset ho gayi.', 'ok');
    toast('Settings reset', 'ok');
  }

  async function exportSettings() {
    const payload = {
      app: 'Meesho Product Pro',
      version: 4,
      settings: S.settings,
      profit: profitInputs(),
      theme: S.theme
    };
    const ok = await MP.copyText(JSON.stringify(payload, null, 2));
    toast(ok ? 'Settings JSON copied' : 'Copy fail', ok ? 'ok' : 'err');
  }

  async function importSettings() {
    try {
      const raw = ($('settingsImport').value || '').trim();
      if (!raw) return toast('Settings JSON paste karo', 'err');
      const parsed = JSON.parse(raw);
      const patch = parsed && parsed.settings ? parsed.settings : parsed;
      if (!patch || typeof patch !== 'object') throw new Error('JSON valid nahi hai');
      S.settings = await MP.saveSettings(Object.assign({}, S.settings, patch));
      if (parsed && parsed.profit && typeof parsed.profit === 'object') {
        S.profit = Object.assign({}, PROFIT_DEFAULT, parsed.profit);
        await setStorage({ mpProfit: S.profit });
      }
      if (parsed && (parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system')) {
        applyTheme(parsed.theme, true);
      }
      renderSettings();
      renderFill();
      renderDetails();
      renderTools(true);
      $('settingsImport').value = '';
      setLog($('dataInfo'), 'Settings import ho gayi \u2713', 'ok');
      toast('Settings imported', 'ok');
    } catch (e) {
      setLog($('dataInfo'), 'Import error: ' + e.message, 'err');
      toast('Settings import fail', 'err');
    }
  }

  /* ---------------- tools actions ---------------- */
  let profitTimer = null;

  function persistProfit() {
    const v = profitInputs();
    S.profit = v;
    setStorage({ mpProfit: v });
    updateCacheInfo();
  }

  function scheduleProfitSave() {
    clearTimeout(profitTimer);
    profitTimer = setTimeout(persistProfit, 350);
  }

  async function useRecommended() {
    const rec = S.lastProfit && S.lastProfit.recommended;
    if (!rec) return toast('Pehle cost price daalo', 'err');
    S.settings = await MP.saveSettings({ priceOverride: rec, priceOverrideKey: S.productKey || '' });
    renderSettings();
    renderFill();
    renderDetails();
    toast('Listing price set: ' + MP.inr(rec), 'ok');
  }

  async function copyRecommended() {
    const r = S.lastProfit;
    if (!r || !r.recommended) return toast('Pehle cost price daalo', 'err');
    const text =
      'Recommended price: ' + MP.inr(r.recommended) + '\n' +
      'Break-even: ' + MP.inr(r.breakEven) + '\n' +
      'Profit @ ' + MP.inr(r.selling) + ': ' + MP.inr(Math.round(r.profit)) + '\n' +
      'Margin: ' + r.margin.toFixed(1) + '%';
    const ok = await MP.copyText(text);
    toast(ok ? 'Profit result copied' : 'Copy fail', ok ? 'ok' : 'err');
  }

  function titleLimit() {
    return Math.max(20, Number(S.settings.titleLimit) || 60);
  }

  function trimToLimit(text) {
    const limit = titleLimit();
    const s = MP.clean(text);
    if (s.length <= limit) return s;
    let cut = s.slice(0, limit + 1);
    const sp = cut.lastIndexOf(' ');
    if (sp > limit * 0.6) cut = cut.slice(0, sp);
    return cut.trim().replace(/[,;:\-\s]+$/, '');
  }

  function cleanTitle(text) {
    return MP.clean(
      String(text || '')
        .replace(/\s*[|\-\u2013\u2014]\s*(buy|meesho|online|shop).*$/i, '')
        .replace(/\bonline at best price\b.*$/i, '')
        .replace(/\b(buy|shop)\b[^.|]{0,32}\bonline\b/gi, '')
        .replace(/\bfree\s+delivery\b/gi, '')
        .replace(/\b(best price|low price|cod available)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/(?:\b(?:buy|shop|with|for|and|the)\b[\s,;:\-\u2013\u2014]*)+$/i, '')
    );
  }

  async function useTitle() {
    const text = $('toolsTitle').value.trim();
    if (!text) return toast('Title khali hai', 'err');
    S.settings = await MP.saveSettings({ titleOverride: text, titleOverrideKey: S.productKey || '' });
    renderFill();
    renderDetails();
    renderTitleMeter();
    toast('Listing title set', 'ok');
  }

  async function resetTitle() {
    S.settings = await MP.saveSettings({ titleOverride: '', titleOverrideKey: '' });
    $('toolsTitle').value = (S.product && S.product.title) || '';
    renderTitleMeter();
    renderFill();
    renderDetails();
    toast('Auto title restored', 'ok');
  }

  async function copyKeywords() {
    const words = keywordList();
    if (!words.length) return toast('Pehle product capture karo', 'err');
    const ok = await MP.copyText(words.join(', '));
    toast(ok ? words.length + ' keywords copied' : 'Copy fail', ok ? 'ok' : 'err');
  }

  async function updateCacheInfo() {
    let count = 0;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'image-cache-stats' });
      if (res && res.ok) count = res.count || 0;
    } catch (e) {
      /* ignore */
    }
    const badge = $('cacheInfo');
    if (badge) badge.textContent = count + ' photos';
    S.cacheCount = count;
    updateStats();
    const info = $('dataInfo');
    if (info && !info.classList.contains('err')) {
      info.className = 'log';
      info.textContent =
        S.history.length + ' products saved \u00b7 ' + count + ' photos cached \u00b7 theme ' + S.theme;
    }
  }

  async function warmCache() {
    const urls = (S.selected.size ? selectedUrls() : (S.product && S.product.images) || []).slice(0, 20);
    if (!urls.length) return toast('Pehle product capture karo', 'err');
    toast('Photo pack cache ho raha hai...', '');
    try {
      const res = await chrome.runtime.sendMessage({ type: 'cache-images', urls });
      toast(
        res && res.ok ? 'Cached ' + res.cached + '/' + res.total + ' photos' : 'Cache fail',
        res && res.ok ? 'ok' : 'err'
      );
    } catch (e) {
      toast('Cache fail', 'err');
    }
    updateCacheInfo();
  }

  async function clearCache() {
    try {
      await chrome.runtime.sendMessage({ type: 'clear-image-cache' });
      toast('Photo cache clear ho gaya', 'ok');
    } catch (e) {
      toast('Cache clear fail', 'err');
    }
    updateCacheInfo();
  }

  async function clearHistoryNow() {
    S.history = await MP.clearHistory();
    renderLibrary();
    updateCacheInfo();
    toast('Library clear ho gayi', 'ok');
  }

  /* ---------------- bind ---------------- */
  function bind() {
    $$('.tab').forEach((b) => {
      b.onclick = () => switchTab(b.dataset.tab);
    });

    $('btnTheme').onclick = cycleTheme;

    $('btnOpenMeesho').onclick = () => chrome.tabs.create({ url: 'https://www.meesho.com/' });
    $('btnCapture').onclick = captureNow;

    $('btnCopyAll').onclick = copyAll;
    $('btnCopyJson').onclick = copyJson;
    $('btnShare').onclick = copyShare;

    $$('.quick').forEach((b) => {
      b.onclick = () => quickCopy(b.dataset.copy);
    });

    $('selectAll').onchange = () => {
      const images = (S.product && S.product.images) || [];
      if ($('selectAll').checked) images.forEach((u) => S.selected.add(u));
      else S.selected.clear();
      renderImages();
      renderFill();
    };
    $('btnSelectNone').onclick = () => {
      S.selected.clear();
      renderImages();
      renderFill();
    };

    $('btnDownload').onclick = downloadSelected;
    $('btnCopyImg').onclick = copyImage;
    $('btnCopyLinks').onclick = () => copyLinks(false);
    $('btnAttach').onclick = attachImages;
    $('btnFillSeller').onclick = () => doFill(false);
    $('btnFillAttach').onclick = () => doFill(true);
    $('btnAutoList').onclick = autoList;
    $('btnCopyListing').onclick = copyListing;
    $('btnOpenSeller').onclick = async () => {
      if (S.product) await setStorage({ mpProduct: S.product, mpPendingFill: true });
      try {
        await chrome.runtime.sendMessage({ type: 'open-seller' });
      } catch (e) {
        /* ignore */
      }
      setLog($('fillLog'), 'Supplier tab khul gaya. Add Product page kholo.', 'ok');
      toast('Supplier tab khula', 'ok');
    };

    $('btnImportFill').onclick = () => importShare(true);
    $('btnImport').onclick = () => importShare(false);
    $('btnLegacy').onclick = useLegacyJson;

    /* share */
    $('btnCopyShareLink').onclick = copyShare;
    $('btnCopyShareCode').onclick = copyShareCode;
    $('btnCopyViewerLink').onclick = copyViewerLink;
    $('btnOpenViewer').onclick = openViewer;
    $('btnDownloadShare').onclick = downloadShare;
    $('btnCopyListingText').onclick = copyListingText;
    $('btnGoShare').onclick = () => switchTab('share');
    $('btnCopyCollected').onclick = copyCollected;
    $('btnDownloadCollected').onclick = downloadCollected;
    $('btnClearCollected').onclick = (e) => confirmTap(e.currentTarget, 'Clear queue', clearCollectedNow);

    /* tools */
    ['profitCost', 'profitSelling', 'profitCommission', 'profitShipping', 'profitTarget', 'profitGst'].forEach((id) => {
      $(id).addEventListener('input', () => {
        renderProfit();
        scheduleProfitSave();
      });
    });
    $('btnUseRecommended').onclick = useRecommended;
    $('btnCopyRecommended').onclick = copyRecommended;

    $('toolsTitle').addEventListener('input', renderTitleMeter);
    $('btnTitleTrim').onclick = () => {
      $('toolsTitle').value = trimToLimit($('toolsTitle').value);
      renderTitleMeter();
    };
    $('btnTitleClean').onclick = () => {
      $('toolsTitle').value = cleanTitle($('toolsTitle').value);
      renderTitleMeter();
    };
    $('btnTitleCase').onclick = () => {
      $('toolsTitle').value = MP.titleCase($('toolsTitle').value);
      renderTitleMeter();
    };
    $('btnTitleReset').onclick = resetTitle;
    $('btnTitleUse').onclick = useTitle;

    $('btnCopyKeywords').onclick = copyKeywords;
    $('btnCacheAll').onclick = warmCache;
    $('btnClearCache').onclick = clearCache;
    $('btnCopyImageLinks').onclick = () => copyLinks(true);

    /* library */
    $('btnClearHistory').onclick = (e) => confirmTap(e.currentTarget, 'Clear library', clearHistoryNow);
    $('btnClearHistory2').onclick = (e) => confirmTap(e.currentTarget, 'Clear library', clearHistoryNow);

    /* settings */
    $('btnSaveSettings').onclick = saveSettings;
    $('btnResetSettings').onclick = resetSettings;
    $('btnExportSettings').onclick = exportSettings;
    $('btnImportSettings').onclick = importSettings;
    $('btnClearCache2').onclick = clearCache;

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        doFill(true);
      }
    });

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.mpHistory) {
          S.history = Array.isArray(changes.mpHistory.newValue) ? changes.mpHistory.newValue : [];
          renderLibrary();
          updateCacheInfo();
        }
        if (changes.mpCollected) {
          S.collected = Array.isArray(changes.mpCollected.newValue) ? changes.mpCollected.newValue : [];
          renderCollected();
        }
        if (changes.mpProduct && changes.mpProduct.newValue) {
          const np = changes.mpProduct.newValue;
          const nk = MP.historyKey(np);
          if (nk && nk !== S.productKey) {
            S.product = np;
            S.productKey = nk;
            (async () => {
              await pruneOverrides();
              autoSelect();
              renderAll();
              renderTools(true);
            })();
          }
        }
      });
    } catch (e) {
      /* ignore */
    }

    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (S.theme === 'system') applyTheme('system', false);
      });
    } catch (e) {
      /* ignore */
    }
  }

  /* ---------------- boot ---------------- */
  document.addEventListener('DOMContentLoaded', async () => {
    let stored = {};
    try {
      stored = await chrome.storage.local.get(['mpSettings', 'mpHistory', 'mpProfit', 'mpTheme', 'mpCollected']);
    } catch (e) {
      stored = {};
    }

    S.settings = Object.assign({}, MP.DEFAULT_SETTINGS, stored.mpSettings || {});
    S.profit = Object.assign({}, PROFIT_DEFAULT, stored.mpProfit || {});
    S.history = Array.isArray(stored.mpHistory) ? stored.mpHistory : [];
    S.collected = Array.isArray(stored.mpCollected) ? stored.mpCollected : [];
    S.theme = stored.mpTheme || 'system';

    applyTheme(S.theme, false);
    bind();
    renderSettings();
    renderLibrary();

    await refresh();

    if (S.tab && isProductTab(S.tab)) {
      setLog($('captureLog'), 'Product auto-capture ho gaya.', 'ok');
    }
  });
})();
