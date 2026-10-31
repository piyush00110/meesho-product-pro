/* ============================================================
   Meesho Product Pro - seller form auto-fill
   Runs on https://supplier.meesho.com/* and seller.flipkart.com/*
   Fills Add Product / listing forms from the captured Meesho
   product, attaches images and reports missed fields.
   ============================================================ */
(function () {
  if (window.__MP_SELLER__) return;
  window.__MP_SELLER__ = true;
  const MP = window.MP;
  if (!MP) return;

  const state = {
    product: null,
    profile: null,
    settings: Object.assign({}, MP.DEFAULT_SETTINGS),
    auto: true,
    lastControlCount: 0
  };

  let host = null;
  let shadow = null;
  let panelOpen = false;
  let watchTimer = null;
  let attachTimer = null;
  let attachObserver = null;
  let pendingImages = null;
  let lastAttachTryAt = 0;
  let waitingForForm = false;
  let autoStop = false;
  let autoRunning = false;

  const GLOBAL_NEG = [
    'search', 'pincode', 'pin code', 'otp', 'password', 'coupon', 'referral',
    'email', 'mobile number', 'gstin', 'ifsc', 'account number', 'captcha'
  ];

  const FIELDS = [
    {
      key: 'title', label: 'Product name', type: 'text', prio: 1,
      labels: ['product name', 'product title', 'listing title', 'item name', 'title'],
      neg: ['search', 'brand name', 'store name', 'seller name'],
      get: (p) => p.meeshoTitle || p.title
    },
    {
      key: 'brand', label: 'Brand', type: 'text', prio: 2,
      labels: ['brand name', 'brand'],
      neg: ['search', 'seller', 'store'],
      get: (p) => p.brand || p.biz
    },
    {
      key: 'category', label: 'Category', type: 'select', prio: 3,
      labels: ['product category', 'select category', 'main category', 'category'],
      neg: ['sub category', 'search'],
      get: (p) => p.category
    },
    {
      key: 'subcategory', label: 'Sub category', type: 'select', prio: 4,
      labels: ['sub category', 'subcategory', 'product type', 'sub type'],
      neg: ['search'],
      get: (p) => p.subcat
    },
    {
      key: 'fabric', label: 'Fabric', type: 'select', prio: 5,
      labels: ['fabric', 'material'],
      get: (p) => p.fabric
    },
    {
      key: 'pattern', label: 'Pattern', type: 'select', prio: 6,
      labels: ['pattern', 'print', 'design'],
      get: (p) => p.pattern
    },
    {
      key: 'occasion', label: 'Occasion', type: 'select', prio: 7,
      labels: ['occasion'],
      get: (p) => p.occasion
    },
    {
      key: 'color', label: 'Colour', type: 'select', prio: 8,
      labels: ['colour family', 'color family', 'main colour', 'main color', 'colour', 'color'],
      neg: ['search'],
      get: (p) => (p.colorList && p.colorList[0]) || p.colors
    },
    {
      key: 'sizes', label: 'Size', type: 'select', prio: 9,
      labels: ['available sizes', 'size options', 'sizes', 'size'],
      neg: ['size chart', 'search'],
      get: (p) => p.sizes
    },
    {
      key: 'pack', label: 'Pack of', type: 'select', prio: 10,
      labels: ['pack of', 'pack size', 'number of items'],
      get: (p) => p.pack
    },
    {
      key: 'mrp', label: 'MRP', type: 'price', prio: 11,
      labels: ['maximum retail price', 'mrp', 'list price', 'original price'],
      neg: ['selling', 'sale price', 'discount', 'cost price'],
      get: (p) => p.mrp
    },
    {
      key: 'price', label: 'Selling price', type: 'price', prio: 12,
      labels: ['selling price', 'sale price', 'your selling price', 'retail price', 'price'],
      neg: ['mrp', 'maximum retail', 'cost price', 'discount', 'original price'],
      get: (p) => p.selling || p.price
    },
    {
      key: 'stock', label: 'Stock', type: 'number', prio: 13,
      labels: ['available stock', 'stock quantity', 'stock', 'quantity', 'inventory'],
      neg: ['search'],
      get: (p) => p.stock || p.defaultStock || 20
    },
    {
      key: 'hsn', label: 'HSN code', type: 'number', prio: 14,
      labels: ['hsn code', 'hsn number', 'hsn'],
      get: (p) => p.hsn
    },
    {
      key: 'gst', label: 'GST', type: 'number', prio: 15,
      labels: ['gst rate', 'gst percentage', 'tax rate', 'gst %', 'gst'],
      neg: ['gstin', 'gst number', 'tax id'],
      get: (p) => p.gstNum || p.gst
    },
    {
      key: 'weight', label: 'Weight', type: 'number', prio: 16,
      labels: ['package weight', 'product weight', 'dead weight', 'weight (grams)', 'weight'],
      neg: ['dimension', 'length', 'width', 'height'],
      get: (p) => p.weightGrams
    },
    {
      key: 'length', label: 'Length', type: 'number', prio: 17,
      labels: ['package length', 'length (cm)', 'length'],
      neg: ['width', 'height', 'weight'],
      get: (p) => p.length
    },
    {
      key: 'breadth', label: 'Breadth', type: 'number', prio: 18,
      labels: ['package breadth', 'breadth (cm)', 'breadth', 'width (cm)', 'width'],
      neg: ['length', 'height', 'weight'],
      get: (p) => p.breadth
    },
    {
      key: 'height', label: 'Height', type: 'number', prio: 19,
      labels: ['package height', 'height (cm)', 'height'],
      neg: ['length', 'width', 'weight'],
      get: (p) => p.height
    },
    {
      key: 'country', label: 'Country of origin', type: 'select', prio: 20,
      labels: ['country of origin', 'country'],
      get: (p) => p.country
    },
    {
      key: 'manufacturer', label: 'Manufacturer', type: 'text', prio: 21,
      labels: ['manufacturer name', 'manufactured by', 'manufacturer'],
      neg: ['address'],
      get: (p) => p.manufacturerName || p.biz || p.brand
    },
    {
      key: 'address', label: 'Manufacturer address', type: 'text', prio: 22,
      labels: ['manufacturer address', 'manufactured at', 'address'],
      get: (p) => p.manufacturerAddress || ''
    },
    {
      key: 'care', label: 'Care instructions', type: 'long', prio: 23,
      labels: ['wash care', 'care instructions', 'care'],
      get: (p) => p.care
    },
    {
      key: 'keywords', label: 'Keywords', type: 'text', prio: 24,
      labels: ['search keywords', 'search terms', 'keywords', 'tags'],
      get: (p) => p.keywords
    },
    {
      key: 'sku', label: 'SKU', type: 'text', prio: 25,
      labels: ['seller sku', 'sku code', 'sku'],
      get: (p) => p.sku
    },
    {
      key: 'description', label: 'Description', type: 'long', prio: 30,
      labels: ['product description', 'about the product', 'about product', 'description'],
      neg: ['meta description', 'short description'],
      get: (p) => p.description
    }
  ];

  /* ---------------- visibility / labels ---------------- */
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0;
  }

  function humanize(v) {
    return String(v == null ? '' : v)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_\-:.]+/g, ' ');
  }

  function labelOf(el) {
    const chunks = [];
    try {
      if (el.labels) Array.from(el.labels).forEach((l) => chunks.push(l.innerText || ''));
    } catch (e) {
      /* no labels */
    }
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      by.split(/\s+/).forEach((id) => {
        const n = document.getElementById(id);
        if (n) chunks.push(n.innerText || '');
      });
    }
    chunks.push(
      el.getAttribute('aria-label') || '',
      el.getAttribute('placeholder') || '',
      humanize(el.getAttribute('name')),
      humanize(el.getAttribute('id')),
      humanize(el.getAttribute('data-testid')),
      humanize(el.getAttribute('data-field'))
    );

    const closestLabel = el.closest('label');
    if (closestLabel) chunks.push(closestLabel.innerText || '');

    const prev = el.previousElementSibling;
    if (prev && prev.innerText && prev.innerText.length < 90) chunks.push(prev.innerText);

    let parent = el.parentElement;
    for (let i = 0; i < 3 && parent; i++, parent = parent.parentElement) {
      const t = parent.innerText || '';
      const controls = parent.querySelectorAll(
        'input:not([type="hidden"]):not([type="file"]),textarea,select,[contenteditable="true"],[role="combobox"]'
      ).length;
      // Only use text from a small field-wrapper, never from the whole form.
      if (controls <= 1 && t.length > 1 && t.length < 220) chunks.push(t);
      const head = parent.querySelector ? parent.querySelector('h1,h2,h3,h4,h5,legend') : null;
      if (head && head !== el) {
        const ht = head.innerText || '';
        if (ht.length > 1 && ht.length < 90) chunks.push(ht);
      }
    }

    return MP.norm(chunks.join(' | ')).slice(0, 700);
  }

  function collectControls() {
    return Array.from(
      document.querySelectorAll('input,textarea,select,[contenteditable="true"],[role="combobox"]')
    ).filter((el) => {
      if (el.tagName === 'INPUT') {
        const t = String(el.type || 'text').toLowerCase();
        if (
          ['hidden', 'file', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'range', 'color'].indexOf(t) !== -1
        ) {
          return false;
        }
      }
      if (el.disabled) return false;
      const combo =
        el.getAttribute('role') === 'combobox' ||
        el.getAttribute('aria-haspopup') === 'listbox' ||
        (el.tagName === 'BUTTON' && el.getAttribute('aria-expanded') !== null);
      if (el.readOnly && !combo) return false;
      if (el.getAttribute('aria-readonly') === 'true' && !combo) return false;
      if (el.getAttribute('aria-disabled') === 'true') return false;
      if (el.closest('header,nav,[role="search"]')) return false;
      return visible(el);
    });
  }

  function scoreControl(el, def) {
    const hay = labelOf(el);
    if (!hay) return 0;
    let score = 0;
    let hits = 0;

    for (const label of def.labels) {
      const n = MP.norm(label);
      if (!n) continue;
      if (hay === n) {
        score += 15;
        hits++;
      } else if (new RegExp('(^|\\|\\s*)' + MP.escapeRe(n) + '(\\s*\\||$)').test(hay)) {
        score += 11;
        hits++;
      } else if (hay.indexOf(n) !== -1) {
        score += 6;
        hits++;
      }
    }
    if (!hits) return 0;

    const attrs = MP.norm(
      [
        el.getAttribute('placeholder') || '',
        el.getAttribute('aria-label') || '',
        humanize(el.getAttribute('name')),
        humanize(el.getAttribute('id')),
        humanize(el.getAttribute('data-testid')),
        humanize(el.getAttribute('data-field'))
      ].join(' ')
    );
    for (const label of def.labels) {
      const n = MP.norm(label);
      if (n && attrs.indexOf(n) !== -1) {
        score += 3;
        break;
      }
    }

    const negatives = (def.neg || []).concat(GLOBAL_NEG);
    for (const neg of negatives) {
      const n = MP.norm(neg);
      if (n && hay.indexOf(n) !== -1) score -= 10;
    }

    if (def.type === 'long') {
      if (el.tagName === 'TEXTAREA' || el.isContentEditable) score += 7;
      else score -= 3;
    } else if (def.type === 'select') {
      if (el.tagName === 'SELECT' || el.getAttribute('role') === 'combobox') score += 4;
      else score -= 6;
    } else if (def.type === 'number' || def.type === 'price') {
      if (el.type === 'number' || el.inputMode === 'numeric' || el.type === 'tel') score += 2;
    }

    if (el.type === 'search') score -= 10;
    return score;
  }

  function bestControl(def, used, onlyEmpty) {
    const controls = collectControls();
    let best = null;
    let bestScore = 0;
    for (const el of controls) {
      if (used && used.has(el)) continue;
      if (onlyEmpty) {
        const cur = el.isContentEditable ? el.innerText : el.value;
        if (MP.clean(cur || '').length) continue;
      }
      const s = scoreControl(el, def);
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    }
    return bestScore >= 7 ? best : null;
  }

  /* ---------------- setters ---------------- */
  function nativeSet(el, value) {
    const proto =
      el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : el.tagName === 'SELECT'
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    try {
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;
    } catch (e) {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function matchSelectOption(opts, wanted) {
    const n = MP.norm(wanted);
    if (!n) return null;
    let best = null;
    let bestScore = 0;
    for (const o of opts) {
      const text = MP.norm(o.text || '');
      const val = MP.norm(o.value || '');
      if (!text && !val) continue;
      if (/^(select|choose|please select|--)/i.test(text)) continue;
      let s = 0;
      if (text === n || val === n) s = 12;
      else if (text.indexOf(n) === 0 || val.indexOf(n) === 0) s = 9;
      else if (text.indexOf(n) !== -1 || n.indexOf(text) !== -1) s = 8;
      else if (val.indexOf(n) !== -1) s = 6;
      if (s > bestScore) {
        bestScore = s;
        best = o;
      }
    }
    return bestScore >= 6 ? { option: best, score: bestScore } : null;
  }

  function fireChange(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setSelect(el, value) {
    const opts = Array.from(el.options || []).filter((o) => String(o.value || '').length > 0);
    if (!opts.length) return false;
    const parts = MP.splitList(value).filter(Boolean);
    const list = parts.length ? parts : [value];

    if (el.multiple) {
      let any = false;
      for (const part of list) {
        const m = matchSelectOption(opts, part);
        if (m && m.score >= 8) {
          m.option.selected = true;
          any = true;
        }
      }
      if (any) {
        fireChange(el);
        return true;
      }
    }

    const whole = matchSelectOption(opts, value);
    if (whole && whole.score >= 8) {
      el.focus({ preventScroll: true });
      el.value = whole.option.value;
      fireChange(el);
      return true;
    }

    for (const part of list) {
      const m = matchSelectOption(opts, part);
      if (m && m.score >= 7) {
        el.focus({ preventScroll: true });
        el.value = m.option.value;
        fireChange(el);
        return true;
      }
    }

    if (whole) {
      el.focus({ preventScroll: true });
      el.value = whole.option.value;
      fireChange(el);
      return true;
    }
    return false;
  }

  function findOption(value) {
    const wanted = MP.norm(value);
    const tokens = MP.splitList(value).map((t) => MP.norm(t));
    const roots = Array.from(
      document.querySelectorAll(
        '[role="listbox"],[role="menu"],[class*="dropdown" i],[class*="Dropdown"],[class*="options" i],[class*="Options"]'
      )
    ).filter(visible);

    let nodes = [];
    roots.forEach((root) => {
      nodes.push.apply(
        nodes,
        Array.from(root.querySelectorAll('[role="option"],[role="menuitem"],li,div'))
      );
    });
    if (!nodes.length) {
      nodes = Array.from(document.querySelectorAll('[role="option"],[role="menuitem"]')).filter(visible);
    }
    nodes = Array.from(new Set(nodes)).filter(visible);

    let best = null;
    let bestScore = 0;
    for (const el of nodes) {
      if (el.querySelector && el.querySelector('input,select,textarea')) continue;
      const text = MP.norm(el.innerText || '');
      if (!text || text.length > 90) continue;
      if (/^(select|choose|please select|--)/i.test(text)) continue;
      let s = 0;
      if (text === wanted) s = 12;
      else if (text.indexOf(wanted) === 0) s = 9;
      else if (text.indexOf(wanted) !== -1) s = 7;
      else if (tokens.some((t) => t && text.indexOf(t) !== -1)) s = 5;
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    }
    return bestScore >= 5 ? best : null;
  }

  function dropdownSearchInput() {
    const inputs = Array.from(
      document.querySelectorAll(
        '[role="listbox"] input,[role="dialog"] input,[class*="dropdown" i] input,[class*="select" i] input'
      )
    ).filter(visible);
    return inputs.find((el) => !el.value) || inputs[0] || null;
  }

  /* Custom dropdowns re-render asynchronously. Confirm the pick stuck before
     telling the caller the field is done. */
  async function dropdownAccepted(el, value, option) {
    const before = MP.clean(el.innerText || el.value || '');
    await MP.sleep(200);
    const after = MP.clean(el.innerText || el.value || '');
    const want = MP.norm(value);
    if (want && MP.norm(after).indexOf(want) !== -1) return true;
    if (after && after !== before) return true;
    if (el.getAttribute('aria-expanded') === 'false') return true;
    const stillListed =
      option &&
      option.isConnected &&
      visible(option) &&
      el.getAttribute('aria-expanded') !== 'false';
    return !stillListed;
  }

  async function setDropdown(el, value) {
    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });
    try {
      el.click();
    } catch (e) {
      /* ignore */
    }
    await MP.sleep(350);

    let option = findOption(value);
    if (option) {
      option.click();
      await MP.sleep(250);
      return dropdownAccepted(el, value, option);
    }

    /* Some pickers open a searchable popup - type the value to filter. */
    const search = dropdownSearchInput();
    if (search && search !== el) {
      nativeSet(search, value);
      await MP.sleep(550);
      option = findOption(value);
      if (option) {
        option.click();
        await MP.sleep(250);
        return dropdownAccepted(el, value, option);
      }
    }

    if (el.tagName === 'INPUT') {
      nativeSet(el, value);
      await MP.sleep(500);
      option = findOption(value);
      if (option) {
        option.click();
        await MP.sleep(250);
        return dropdownAccepted(el, value, option);
      }
    }
    try {
      document.body.click();
    } catch (e) {
      /* ignore */
    }
    return false;
  }

  function setEditable(el, value) {
    el.scrollIntoView({ block: 'center' });
    el.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand('insertText', false, value);
      if (!ok) el.innerText = value;
    } catch (e) {
      el.innerText = value;
    }
    el.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value })
    );
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const got = MP.clean(el.innerText || '');
    if (got.length >= Math.min(10, MP.clean(value).length)) return true;
    try {
      el.innerText = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
      return false;
    }
    return MP.clean(el.innerText || '').length >= Math.min(10, MP.clean(value).length);
  }

  /* React-controlled fields sometimes silently reject a value. Never report
     success unless the control really holds the value now. */
  function controlHasValue(el, value, def) {
    if (!el) return false;
    const numeric = def && (def.type === 'price' || def.type === 'number');
    if (el.isContentEditable) {
      const txt = MP.clean(el.innerText || '');
      return !!txt && txt.length >= Math.min(3, MP.clean(value).length);
    }
    if (el.tagName === 'SELECT') {
      if (el.multiple) {
        if (el.selectedOptions.length > 0) return true;
        const chosen = el.options[el.selectedIndex];
        return !!chosen && !!String(chosen.value || '').trim();
      }
      const chosen = el.options[el.selectedIndex];
      const text = chosen ? String(chosen.text || '') : '';
      if (!String(el.value || '').trim()) return false;
      if (numeric) return String(el.value).replace(/[^\d.]/g, '') === String(value).replace(/[^\d.]/g, '');
      return !/^(select|choose|please select|--)/i.test(MP.clean(text));
    }
    const got = String(el.value == null ? '' : el.value);
    if (!MP.clean(got).length) return false;
    if (numeric) return got.replace(/[^\d.]/g, '') === String(value).replace(/[^\d.]/g, '');
    return true;
  }

  async function setControl(el, rawValue, def) {
    let value = String(rawValue);
    if (def.type === 'price' || def.type === 'number') {
      const numeric = value.replace(/[^\d.]/g, '');
      value = numeric || (el.type === 'number' ? '0' : value);
    }

    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });

    if (el.tagName === 'SELECT') {
      const ok = setSelect(el, value);
      return ok && controlHasValue(el, value, def);
    }
    if (
      el.getAttribute('role') === 'combobox' ||
      el.getAttribute('role') === 'button' ||
      el.getAttribute('aria-haspopup') === 'listbox' ||
      el.getAttribute('aria-expanded') !== null ||
      (el.tagName === 'BUTTON' && def.type === 'select')
    ) {
      return setDropdown(el, value);
    }
    if (el.isContentEditable) return setEditable(el, value);

    nativeSet(el, value);
    if (controlHasValue(el, value, def)) return true;

    /* Retry once with a real typing sequence for stubborn React inputs. */
    try {
      el.focus({ preventScroll: true });
      el.select();
      if (document.execCommand('insertText', false, value)) {
        fireChange(el);
        if (controlHasValue(el, value, def)) return true;
      }
    } catch (e) {
      /* ignore */
    }
    nativeSet(el, value);
    return controlHasValue(el, value, def);
  }

  async function tryPickChoices(def, value) {
    if (['brand', 'title', 'description', 'keywords'].indexOf(def.key) !== -1) return false;
    const parts = MP.splitList(value).filter(Boolean).slice(0, 8);
    if (!parts.length) return false;

    const labelNorms = def.labels.map((l) => MP.norm(l)).filter(Boolean);
    const sections = Array.from(
      document.querySelectorAll('fieldset,section,[class*="card" i],[class*="Card"],[class*="form" i],[class*="Form"]')
    ).filter((el) => {
      if (!visible(el)) return false;
      const t = el.innerText || '';
      return t.length > 0 && t.length < 2500;
    });

    let targets = [];
    for (const sec of sections) {
      const txt = MP.norm(sec.innerText || '');
      if (!labelNorms.some((n) => txt.indexOf(n) !== -1)) continue;
      if ((def.neg || []).some((n) => txt.indexOf(MP.norm(n)) !== -1)) continue;
      const found = Array.from(
        sec.querySelectorAll('[role="radio"],[role="checkbox"],[role="option"],button,label,span,div')
      ).filter((el) => {
        if (!visible(el)) return false;
        if (el.querySelector('select,textarea,button')) return false;
        if (el.tagName !== 'LABEL' && el.querySelector('input')) return false;
        const t = MP.norm(el.innerText || '');
        if (!t || t.length > 40) return false;
        if (/chart|guide|select all|choose|search/i.test(t)) return false;
        return true;
      });
      if (found.length) {
        targets = found;
        break;
      }
    }
    if (!targets.length) return false;

    let clicked = 0;
    for (const part of parts) {
      const n = MP.norm(part);
      if (!n) continue;
      const match = targets.find((el) => {
        const t = MP.norm(el.innerText || '');
        if (!t) return false;
        if (n.length <= 2) return t === n;
        return t === n || t.indexOf(n + ' ') === 0 || t.slice(-(n.length + 1)) === ' ' + n;
      });
      if (!match) continue;
      const cls = String(match.className || '');
      const already =
        match.getAttribute('aria-checked') === 'true' ||
        match.getAttribute('aria-selected') === 'true' ||
        /(^|\s)(selected|active|checked)(\s|$)/i.test(cls);
      if (already) {
        clicked++;
        continue;
      }
      try {
        match.click();
        clicked++;
        await MP.sleep(260);
      } catch (e) {
        /* ignore */
      }
    }
    return clicked > 0;
  }

  /* ---------------- images ---------------- */
  function dataUrlToFile(dataUrl, name) {
    const parts = String(dataUrl || '').split(',');
    const head = parts[0] || '';
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(parts[1] || '');
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name, { type: mime });
  }

  function fileExtForMime(mime) {
    if (/png/i.test(mime)) return 'png';
    if (/webp/i.test(mime)) return 'webp';
    return 'jpg';
  }

  function imageInputs() {
    return Array.from(document.querySelectorAll('input[type="file"]')).filter((el) => {
      if (el.disabled) return false;
      const accept = String(el.accept || '').toLowerCase();
      if (accept && accept.indexOf('image') === -1 && accept.indexOf('jpg') === -1 && accept.indexOf('png') === -1) return false;
      return true;
    });
  }

  function pickImageInput() {
    const inputs = imageInputs();
    if (!inputs.length) return null;
    let best = inputs[0];
    let bestScore = -1;
    for (const el of inputs) {
      let s = 0;
      const accept = String(el.accept || '').toLowerCase();
      if (accept.indexOf('image') !== -1) s += 4;
      if (el.multiple) s += 3;
      const zone = el.closest('[class*="upload" i],[class*="drop" i],[class*="image" i]');
      const hay = MP.norm((zone ? zone.innerText : '') + ' ' + labelOf(el));
      if (/image|photo|upload|product/.test(hay)) s += 2;
      if (!visible(el)) s -= 1;
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    }
    return best;
  }

  function queueImages(urls) {
    pendingImages = (urls || []).slice(0, Math.max(1, Number(state.settings.maxImages) || 8));
    if (!pendingImages.length) return;

    const tryNow = async () => {
      if (!pendingImages || !pendingImages.length) return;
      if (!imageInputs().length) return;
      if (Date.now() - lastAttachTryAt < 4000) return;
      lastAttachTryAt = Date.now();
      const list = pendingImages;
      pendingImages = null;
      const r = await attachImages(list);
      if (r.ok) {
        log('Photos attach ho gayi \u2713 (' + r.count + ')', 'ok');
        stopQueue();
      } else {
        pendingImages = list;
      }
    };

    if (!attachTimer) attachTimer = setInterval(tryNow, 3000);

    if (!attachObserver) {
      attachObserver = new MutationObserver(() => {
        if (pendingImages && imageInputs().length) tryNow();
      });
      try {
        attachObserver.observe(document.body, { childList: true, subtree: true });
      } catch (e) {
        /* ignore */
      }
    }

    // 5 minute tak wait - multi-step form me upload box late aata hai.
    setTimeout(stopQueue, 300000);
  }

  function stopQueue() {
    if (attachTimer) clearInterval(attachTimer);
    attachTimer = null;
    if (attachObserver) {
      try {
        attachObserver.disconnect();
      } catch (e) {
        /* ignore */
      }
      attachObserver = null;
    }
    pendingImages = null;
  }

  async function fileFromUrl(url, index) {
    const res = await chrome.runtime.sendMessage({
      type: 'fetch-image',
      url,
      optimize: true,
      maxDim: 1600,
      quality: 0.9
    });
    if (!res || !res.ok || !res.dataUrl) return null;
    const ext = fileExtForMime(res.mime || 'image/jpeg');
    return dataUrlToFile(res.dataUrl, 'product-' + (index + 1) + '.' + ext);
  }

  async function attachImages(urls) {
    const list = (urls || []).slice(0, Math.max(1, Number(state.settings.maxImages) || 8));
    if (!list.length) return { ok: false, error: 'Koi image select nahi hai.' };

    const input = pickImageInput();
    if (!input) {
      queueImages(list);
      return { ok: false, error: 'Image upload box nahi mila. Images step kholo - photos khud attach ho jayengi.' };
    }

    // Photo pack pehle se cache karwa lo (CDN slow/expire ho to bhi upload chalega).
    try {
      await chrome.runtime.sendMessage({ type: 'cache-images', urls: list });
    } catch (e) {
      /* cache optional */
    }

    const files = [];
    const failed = [];
    for (let i = 0; i < list.length; i++) {
      log('Image ' + (i + 1) + '/' + list.length + ' attach ho rahi hai...');
      try {
        const file = await fileFromUrl(list[i], i);
        if (file) files.push(file);
        else failed.push(list[i]);
      } catch (e) {
        failed.push(list[i]);
      }
    }

    // Ek retry - network hiccup / CDN slow ho sakta hai.
    for (const url of failed.slice()) {
      try {
        const file = await fileFromUrl(url, files.length);
        if (file) {
          files.push(file);
          failed.splice(failed.indexOf(url), 1);
        }
      } catch (e) {
        /* still failing */
      }
    }

    if (!files.length) return { ok: false, error: 'Images download nahi hui. Seller page refresh karke dobara try karo.' };

    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    try {
      input.files = dt.files;
    } catch (e) {
      try {
        Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
      } catch (e2) {
        return { ok: false, error: 'Image input me files set nahi hui.' };
      }
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    pendingImages = null;
    await MP.sleep(500);
    return { ok: true, count: files.length };
  }

  /* ---------------- share link import ---------------- */
  async function importShare(text) {
    try {
      log('Share data import ho raha hai...');
      const data = await MP.decodeShare(text);
      if (!data || !data.product) throw new Error('Share data me product nahi mila.');
      state.product = data.product;
      if (data.settings) state.settings = Object.assign({}, state.settings, data.settings);
      state.profile = Object.assign(
        {},
        MP.buildProfile(state.product, state.settings),
        normalizeProfile(data.profile) || {}
      );
      try {
        await chrome.storage.local.set({ mpProduct: state.product, mpSettings: state.settings });
      } catch (e) {
        /* ignore */
      }
      try {
        MP.addHistory(state.product);
      } catch (e) {
        /* library optional */
      }
      renderPanel();
      log('Data import ho gaya \u2713 ' + (state.profile.meeshoTitle || ''), 'ok');
      try {
        const cp = chrome.runtime.sendMessage({ type: 'cache-images', urls: state.profile.images || [] });
        if (cp && cp.catch) cp.catch(() => {});
      } catch (e) {
        /* cache optional */
      }

      const check = enoughForm();
      if (check.ready) {
        await fillAll(state.profile);
        const ir = await ensurePhotos(state.profile);
        if (ir && ir.ok) log('Photos attach ho gayi \u2713 (' + ir.count + ')', 'ok');
        else if (ir && ir.queued) log('Photo upload box ka wait ho raha hai - Images step kholo.', '');
        try {
          await chrome.storage.local.set({ mpPendingFill: false });
        } catch (e) {
          /* ignore */
        }
        startWatch();
      } else {
        try {
          await chrome.storage.local.set({ mpPendingFill: true });
        } catch (e) {
          /* ignore */
        }
        autoFillWhenReady();
      }
      return { ok: true };
    } catch (e) {
      log(e.message, 'err');
      return { ok: false, error: e.message };
    }
  }

  /* ---------------- fill engine ---------------- */
  function fieldValue(def, profile) {
    let value = def.get(profile);
    if (value == null) return '';
    if (Array.isArray(value)) value = value.join(', ');
    value = MP.clean(String(value));
    if (def.key === 'description') value = value.slice(0, 5000);
    return value;
  }

  async function fillOne(def, profile, used, onlyEmpty) {
    const value = fieldValue(def, profile);
    if (!value) return { ok: false, empty: true };
    const el = bestControl(def, used, !!onlyEmpty);
    if (el) {
      used.add(el);
      log('Filling ' + def.label + '...');
      try {
        const ok = await setControl(el, value, def);
        if (ok) return { ok: true };
      } catch (e) {
        /* fall through to chip picker */
      }
    }
    /* Custom Meesho pickers often are not real form controls, or the
       option list loads after the click. Try the chip / dropdown picker too. */
    if (def.type === 'select') {
      try {
        const picked = await tryPickChoices(def, value);
        if (picked) return { ok: true, picked: true };
      } catch (e) {
        /* ignore */
      }
    }
    return { ok: false };
  }

  async function fillAll(profile, opts) {
    const options = opts || {};
    state.profile = profile;
    const used = new Set();
    let filled = [];
    let missed = [];
    const defs = FIELDS.slice().sort((a, b) => a.prio - b.prio);

    for (const def of defs) {
      const r = await fillOne(def, profile, used, !!options.onlyEmpty);
      if (r.empty) continue;
      if (r.ok) filled.push(def.key);
      else missed.push(def.key);
      await MP.sleep(230);
    }

    /* Category / sub-category / fabric fields load after the previous
       dropdown is chosen. Retry the missed fields once the DOM settles. */
    if (!options.noRetry) {
      for (const wait of [800, 1800]) {
        if (!missed.length) break;
        await MP.sleep(wait);
        const still = [];
        for (const key of missed) {
          const def = defs.find((d) => d.key === key);
          if (!def) continue;
          const r = await fillOne(def, profile, new Set(), true);
          if (r.ok) filled.push(key);
          else still.push(key);
        }
        missed = still;
      }
    }

    const result = { ok: filled.length, filled, missed };
    if (filled.length) {
      log(
        'Filled ' + filled.length + ' fields \u2713' +
          (missed.length ? '  |  Missed: ' + missed.join(', ') : '')
      );
    } else {
      log('Koi matching field nahi mila. Sahi Add Product form kholo.', 'err');
    }
    return result;
  }

  function enoughForm() {
    const used = new Set();
    let n = 0;
    let hasTitle = false;
    for (const def of FIELDS) {
      if (def.key === 'description') continue;
      const el = bestControl(def, used, false);
      if (el) {
        n++;
        used.add(el);
        if (def.key === 'title' || def.key === 'price' || def.key === 'hsn') hasTitle = true;
      }
    }
    return { count: n, ready: n >= 3 && hasTitle };
  }

  async function ensurePhotos(profile) {
    if (!state.settings.autoAttachImages) return null;
    const images = (profile && profile.images) || [];
    if (!images.length) return null;
    try {
      const p = chrome.runtime.sendMessage({ type: 'cache-images', urls: images });
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* cache optional */
    }
    if (!imageInputs().length) {
      queueImages(images);
      return { ok: false, queued: true };
    }
    return attachImages(images);
  }

  async function autoFillWhenReady() {
    if (!state.profile || waitingForForm) return;
    waitingForForm = true;
    try {
      log('Form ka wait kar rahe hain... Add Product page kholo.', '');
      for (let i = 0; i < 80; i++) {
        if (!state.profile) return;
        const check = enoughForm();
        if (check.ready) {
          await fillAll(state.profile);
          await ensurePhotos(state.profile);
          try {
            await chrome.storage.local.set({ mpPendingFill: false });
          } catch (e) {
            /* ignore */
          }
          startWatch();
          return;
        }
        await MP.sleep(1500);
      }
      try {
        await chrome.storage.local.set({ mpPendingFill: false });
      } catch (e) {
        /* ignore */
      }
      log('Form nahi mila. Meesho Add Product page kholo aur panel se Fill dabao.', 'err');
    } finally {
      waitingForForm = false;
    }
  }

  function startWatch() {
    if (!state.settings.watchSteps) return;
    stopWatch();
    const end = Date.now() + 90000;
    state.lastControlCount = collectControls().length;
    watchTimer = setInterval(async () => {
      if (Date.now() > end || !state.profile) {
        stopWatch();
        return;
      }
      const n = collectControls().length;
      if (n && n !== state.lastControlCount) {
        state.lastControlCount = n;
        const r = await fillAll(state.profile, { onlyEmpty: true });
        if (r.filled.length) log('Naye step ke ' + r.filled.length + ' fields bhar diye \u2713');
      }
    }, 4000);
  }

  function stopWatch() {
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = null;
  }

  /* ---------------- full auto list (multi-step driver) ---------------- */
  const NEXT_RE = /^(next|continue|save\s*(?:&|and)?\s*next|next\s*step|proceed|aage|agla|save\s*(?:&|and)?\s*continue|next\b.*)$/i;
  const SUBMIT_RE = /^(submit|publish|save\s*(?:product|listing)|list\s*product|publish\s*product|submit\s*product|save\s*(?:&|and)?\s*publish)\b/i;

  function btnText(el) {
    if (!el) return '';
    return MP.norm(el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.title || '');
  }

  function actionNodes(scope) {
    const root = scope || document;
    const list = root.querySelectorAll(
      'button,[role="button"],a[href],div[tabindex],input[type="button"],input[type="submit"]'
    );
    return Array.from(list);
  }

  function findActionButton(re, scope) {
    const out = [];
    actionNodes(scope).forEach((el) => {
      if (!visible(el)) return;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
      const t = btnText(el);
      if (!t || t.length > 48) return;
      if (!re.test(t)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      /* header / nav / sticky footer ke andar wale buttons skip karo */
      if (el.closest('header,nav,footer')) return;
      out.push({ el, y: r.top, order: out.length });
    });
    if (!out.length) return null;
    out.sort((a, b) => b.y - a.y || a.order - b.order);
    return out[0].el;
  }

  function stepFingerprint() {
    const labels = collectControls()
      .slice(0, 40)
      .map((el) => MP.norm(labelOf(el) || el.name || el.id || '') + '=' + MP.norm(el.value || ''))
      .join('|');
    const heads = Array.from(document.querySelectorAll('h1,h2,h3,h4,[role="heading"]'))
      .filter(visible)
      .slice(0, 8)
      .map(btnText)
      .join('|');
    return labels.length + '#' + heads.length + '#' + collectControls().length;
  }

  function hudText(line) {
    if (!shadow) return;
    const box = shadow.getElementById('autoSteps');
    if (!box) return;
    const div = document.createElement('div');
    div.textContent = line;
    box.appendChild(div);
    while (box.childElementCount > 5) box.removeChild(box.firstElementChild);
    box.scrollTop = box.scrollHeight;
  }

  function setHud(open, title) {
    if (!shadow) return;
    const bar = shadow.getElementById('autoBar');
    if (!bar) return;
    bar.classList.toggle('show', !!open);
    const t = shadow.getElementById('autoTtl');
    if (t && title) t.textContent = title;
    const btn = shadow.getElementById('autoStop');
    if (btn) btn.style.display = open ? '' : 'none';
  }

  async function autoList(opts) {
    const o = opts || {};
    const profile = o.profile || state.profile;
    if (!profile) return { ok: false, error: 'Product data nahi hai. Pehle capture karo.' };
    if (autoRunning) return { ok: false, error: 'Auto list already chalu hai.' };

    autoRunning = true;
    autoStop = false;
    state.profile = profile;
    stopWatch();

    const maxSteps = Math.max(1, Math.min(30, Number(o.steps) || 12));
    const wantImages = o.attachImages !== false && state.settings.autoAttachImages !== false;
    let steps = 0;
    let fields = 0;
    let images = 0;
    let review = false;
    let stopped = false;
    let error = '';

    setHud(true, 'Auto list \u00b7 step 0');
    hudText('Form scan ho raha hai...');
    log('Auto list chalu \u2014 form scan ho raha hai...');

    try {
      const first = await fillAll(profile);
      fields += first.filled.length;
      if (wantImages) {
        const r = await ensurePhotos(profile);
        if (r && r.ok) images += r.count || 0;
      }
      await MP.sleep(900);

      for (let i = 0; i < maxSteps; i++) {
        if (autoStop) {
          stopped = true;
          break;
        }

        /* image step aa gaya to photos attach karo */
        if (wantImages && imageInputs().length) {
          const r = await attachImages(profile.images || []);
          if (r && r.ok) images += r.count || 0;
          await MP.sleep(600);
        }

        const next = findActionButton(NEXT_RE);
        if (!next) {
          const submit = findActionButton(SUBMIT_RE);
          review = !!submit;
          if (submit && o.submit) {
            hudText('Submit dab raha hai (auto-submit ON)...');
            await fillAll(profile, { onlyEmpty: true });
            submit.scrollIntoView({ block: 'center' });
            await MP.sleep(300);
            submit.click();
            review = false;
            hudText('Submit click ho gaya \u2713');
          }
          break;
        }

        const before = stepFingerprint();
        const more = await fillAll(profile, { onlyEmpty: true });
        fields += more.filled.length;

        const label = btnText(next).slice(0, 28);
        hudText('Step ' + (steps + 1) + ' \u2192 ' + (label || 'Next'));
        next.scrollIntoView({ block: 'center' });
        await MP.sleep(250);
        try {
          next.click();
        } catch (e) {
          error = 'Next button click fail: ' + e.message;
          break;
        }
        steps++;
        setHud(true, 'Auto list \u00b7 step ' + steps);

        /* naye step ka wait */
        const end = Date.now() + 16000;
        let changed = false;
        while (Date.now() < end) {
          await MP.sleep(800);
          if (autoStop) {
            stopped = true;
            break;
          }
          if (stepFingerprint() !== before && collectControls().length) {
            changed = true;
            break;
          }
        }
        if (stopped) break;
        if (!changed) {
          hudText('Naya step nahi khula \u2014 ruk rahe hain.');
          break;
        }
        await MP.sleep(800);
        const after = await fillAll(profile, { onlyEmpty: true });
        fields += after.filled.length;
        if (wantImages && imageInputs().length) {
          const r = await attachImages(profile.images || []);
          if (r && r.ok) images += r.count || 0;
        }
      }
    } catch (e) {
      error = e.message || 'Auto list error';
    }

    autoRunning = false;
    autoStop = false;
    setHud(true, 'Auto list \u00b7 done');
    const summary =
      (review ? 'Review step ready \u00b7 Submit aap dabao' : stopped ? 'Rok diya' : 'Done') +
      ' \u00b7 ' + steps + ' steps \u00b7 ' + fields + ' fields' +
      (images ? ' \u00b7 ' + images + ' photos' : '') +
      (error ? ' \u00b7 ' + error : '');
    hudText(summary);
    log(summary, error ? 'err' : 'ok');
    try {
      await chrome.storage.local.set({ mpPendingAuto: false, mpPendingFill: false });
    } catch (e) {
      /* ignore */
    }
    return { ok: !error, steps, filled: fields, images, review, stopped, error };
  }

  async function autoListWhenReady() {
    if (!state.profile || autoRunning) return;
    for (let i = 0; i < 120; i++) {
      if (autoRunning) return;
      if (enoughForm().ready) {
        await autoList({});
        return;
      }
      await MP.sleep(1500);
    }
    log('Auto list: Add Product form nahi mila.', 'err');
  }

  /* ---------------- panel ---------------- */
  const PANEL_CSS = `
    :host{all:initial}
    *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
    #fab{position:fixed;right:16px;bottom:18px;z-index:2147483646;height:48px;padding:0 17px 0 14px;border:0;border-radius:16px;
      background:linear-gradient(135deg,#6c1cff,#4b12c9 55%,#2d0a86);color:#fff;
      box-shadow:0 10px 26px rgba(90,25,220,.4),inset 0 -2px 0 rgba(0,0,0,.16);
      cursor:pointer;display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;
      transition:transform .18s cubic-bezier(.2,.8,.2,1),box-shadow .18s}
    #fab:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(90,25,220,.5)}
    #fab:active{transform:scale(.98)}
    #panel{position:fixed;right:16px;bottom:76px;z-index:2147483646;width:358px;max-height:72vh;display:none;
      flex-direction:column;background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(24,19,34,.34);
      overflow:hidden;color:#181322;animation:mpIn .2s cubic-bezier(.2,.8,.2,1)}
    @keyframes mpIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
    .head{background:radial-gradient(120% 130% at 95% -20%,rgba(255,255,255,.25),transparent 55%),
      linear-gradient(120deg,#7c2dff,#5a15d8 55%,#2d0a86);color:#fff;padding:12px 14px;display:flex;
      align-items:center;justify-content:space-between;gap:10px}
    .hb{display:flex;align-items:center;gap:9px;min-width:0}
    .logo{width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,.95);color:#5a15d8;
      display:flex;align-items:center;justify-content:center;font-weight:900;font-size:17px;flex:0 0 auto}
    .ttl{font-size:13px;font-weight:800;line-height:1.2;white-space:nowrap}
    .sub{font-size:10px;opacity:.82;margin-top:1px;white-space:nowrap}
    .head button{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.2);color:#fff;
      width:27px;height:27px;border-radius:9px;cursor:pointer;font-size:17px;line-height:1;flex:0 0 auto}
    .head button:hover{background:rgba(255,255,255,.3)}
    .body{padding:12px 14px 14px;overflow:auto}
    .body::-webkit-scrollbar{width:8px}
    .body::-webkit-scrollbar-thumb{background:#ddd6e8;border-radius:6px}
    .sum{font-size:11.5px;line-height:1.45;color:#3c3450;background:linear-gradient(135deg,#f7f3ff,#fdf0f8);
      border:1px solid #eee5ff;border-radius:11px;padding:9px 10px;margin-bottom:9px}
    .sum b{display:block;font-size:12px;margin-bottom:3px;color:#181322;line-height:1.3}
    .sum span{color:#7c748f;font-size:10.5px}
    .row{display:flex;gap:7px;margin-top:7px}
    .row button{flex:1;border:0;border-radius:10px;padding:9px 8px;font-size:11.5px;font-weight:750;cursor:pointer;
      background:#f0edfb;color:#4b1fa8;transition:filter .15s,transform .12s}
    .row button:hover{filter:brightness(.97)}
    .row button:active{transform:translateY(1px)}
    .row button.pri{background:linear-gradient(135deg,#7c2dff,#5a15d8);color:#fff;box-shadow:0 5px 14px rgba(108,28,255,.25)}
    .row button.dark{background:linear-gradient(135deg,#2a2338,#14101c);color:#fff}
    .log{font-size:10.5px;color:#6f6880;line-height:1.45;margin-top:10px;border-top:1px solid #eee9f6;padding-top:8px;
      max-height:76px;overflow:auto;white-space:pre-wrap}
    .log.err{color:#cf1f3f;font-weight:650}
    .log.ok{color:#0b8a57;font-weight:650}
    .hint{font-size:10px;color:#8b849c;line-height:1.45;margin-top:8px}
    .autoBar{display:none;margin-top:9px;border:1px solid #e6ddff;background:linear-gradient(135deg,#fbf8ff,#fff5fa);border-radius:11px;padding:8px 9px}
    .autoBar.show{display:block}
    .autoTop{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10.5px;font-weight:800;color:#2a1240}
    .autoTop button{background:#2a2338;border:0;color:#fff;border-radius:8px;padding:4px 9px;font-size:9.5px;font-weight:800;cursor:pointer}
    .autoSteps{margin-top:5px;font-size:9.5px;color:#6f6880;line-height:1.5;max-height:58px;overflow:auto;white-space:pre-wrap}
    .imp{display:flex;gap:6px;margin-top:8px}
    .imp input{flex:1;min-width:0;border:1px solid #ded6eb;border-radius:9px;padding:8px;font-size:10.5px;color:#181322;background:#fff}
    .imp input:focus{outline:none;border-color:#7c2dff;box-shadow:0 0 0 3px #efe8ff}
    .imp button{border:0;border-radius:9px;background:linear-gradient(135deg,#2a2338,#14101c);color:#fff;font-size:10.5px;font-weight:800;padding:8px 11px;cursor:pointer}
  `;

  function log(msg, kind) {
    if (!shadow) return;
    const el = shadow.getElementById('log');
    if (!el) return;
    el.innerText = msg;
    el.className = 'log' + (kind ? ' ' + kind : '');
    try {
      console.log('[Meesho Pro]', msg);
    } catch (e) {
      /* ignore */
    }
  }

  function renderPanel() {
    if (!shadow) return;
    const p = state.product;
    if (!p || !state.profile) {
      if (host) host.style.display = 'none';
      return;
    }
    if (host) host.style.display = '';
    const summary = shadow.getElementById('sum');
    const prof = state.profile;
    summary.innerHTML =
      '<b></b><span></span>';
    summary.querySelector('b').textContent = prof.meeshoTitle || prof.title || 'Product';
    summary.querySelector('span').textContent =
      (prof.selling ? MP.inr(prof.selling) + '  |  ' : '') +
      'HSN ' + (prof.hsn || '-') +
      '  |  GST ' + (prof.gst || '-') +
      '  |  ' + (prof.images ? prof.images.length : 0) + ' images';
  }

  function mountPanel() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'mp-pro-seller-host';
    host.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;z-index:2147483646';
    (document.body || document.documentElement).appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<style>' + PANEL_CSS + '</style>' +
      '<button id="fab" title="Fill this form">\u2B07\uFE0F Fill product</button>' +
      '<div id="panel">' +
      '<div class="head"><div class="hb"><div class="logo">M</div><div><div class="ttl">Meesho Pro AutoFill</div><div class="sub">Seller form \u00b7 photos \u00b7 share import</div></div></div><button id="close" title="Close">\u00d7</button></div>' +
      '<div class="body">' +
      '<div id="sum" class="sum"><b>No product captured</b><span>Meesho product page kholo pehle</span></div>' +
      '<div class="row"><button id="auto" class="pri" style="flex:1.6">\u26A1 Auto list full form</button><button id="autoStop">Stop</button></div>' +
      '<div class="row"><button id="fill" class="pri">Fill this page</button><button id="fillImg">Fill + images</button></div>' +
      '<div class="row"><button id="attach">Attach images</button><button id="copy">Copy details</button></div>' +
      '<div class="row"><button id="copyTitle">Copy title</button><button id="copyJson">Copy JSON</button></div>' +
      '<div class="imp"><input id="share" placeholder="Share link / share code paste karo"><button id="import">Import</button></div>' +
      '<div id="autoBar" class="autoBar"><div class="autoTop"><b id="autoTtl">Auto list</b><button id="autoStop2">Stop</button></div><div id="autoSteps" class="autoSteps"></div></div>' +
      '<div id="log" class="log">Ready.</div>' +
      '<div class="hint">Auto list khud step-by-step form bharta hai, photos upload karta hai aur Next dabata hai. Review par ruk jata hai \u2014 Submit aap dabao.</div>' +
      '</div></div>';

    const panel = shadow.getElementById('panel');
    shadow.getElementById('fab').onclick = () => {
      panelOpen = !panelOpen;
      panel.style.display = panelOpen ? 'flex' : 'none';
      if (panelOpen) renderPanel();
    };
    shadow.getElementById('close').onclick = () => {
      panelOpen = false;
      panel.style.display = 'none';
    };
    shadow.getElementById('fill').onclick = async () => {
      if (!state.profile) return log('Pehle Meesho product page se details capture karo.', 'err');
      await fillAll(state.profile);
      startWatch();
    };
    shadow.getElementById('fillImg').onclick = async () => {
      if (!state.profile) return log('Pehle Meesho product page se details capture karo.', 'err');
      await fillAll(state.profile);
      const r = await attachImages(state.profile.images || []);
      log(r.ok ? 'Images attach ho gayi \u2713 (' + r.count + ')' : r.error, r.ok ? 'ok' : 'err');
      startWatch();
    };
    shadow.getElementById('attach').onclick = async () => {
      if (!state.profile) return log('Pehle product capture karo.', 'err');
      const r = await attachImages(state.profile.images || []);
      log(r.ok ? 'Images attach ho gayi \u2713 (' + r.count + ')' : r.error, r.ok ? 'ok' : 'err');
    };
    shadow.getElementById('copy').onclick = async () => {
      if (!state.product) return log('Product nahi hai.', 'err');
      const ok = await MP.copyText(MP.formatProductText(state.product));
      log(ok ? 'Details copy ho gayi \u2713' : 'Copy fail.', ok ? 'ok' : 'err');
    };
    shadow.getElementById('copyTitle').onclick = async () => {
      const title =
        (state.profile && (state.profile.meeshoTitle || state.profile.title)) ||
        (state.product && state.product.title) ||
        '';
      if (!title) return log('Title nahi mila.', 'err');
      const ok = await MP.copyText(title);
      log(ok ? 'Title copy ho gaya \u2713' : 'Copy fail.', ok ? 'ok' : 'err');
    };
    shadow.getElementById('copyJson').onclick = async () => {
      const data = state.profile || state.product;
      if (!data) return log('Product nahi hai.', 'err');
      const ok = await MP.copyText(JSON.stringify(data, null, 2));
      log(ok ? 'Listing JSON copy ho gaya \u2713' : 'Copy fail.', ok ? 'ok' : 'err');
    };
    shadow.getElementById('import').onclick = async () => {
      const box = shadow.getElementById('share');
      const value = (box.value || '').trim();
      if (!value) return log('Share link ya share code paste karo.', 'err');
      await importShare(value);
      box.value = '';
    };
    const stopAuto = () => {
      autoStop = true;
      log('Auto list rok rahe hain...');
    };
    shadow.getElementById('autoStop').onclick = stopAuto;
    shadow.getElementById('autoStop2').onclick = stopAuto;
    shadow.getElementById('auto').onclick = async () => {
      if (!state.profile) return log('Pehle Meesho product capture karo ya share link import karo.', 'err');
      setHud(true, 'Auto list');
      await autoList({});
    };
  }

  /* ---------------- boot ---------------- */
  async function loadState() {
    try {
      const r = await chrome.storage.local.get(['mpProduct', 'mpSettings', 'mpPendingFill', 'mpPendingAuto']);
      if (r.mpProduct) state.product = r.mpProduct;
      state.settings = Object.assign({}, MP.DEFAULT_SETTINGS, r.mpSettings || {});
      if (state.product) state.profile = MP.buildProfile(state.product, state.settings);
      return r;
    } catch (e) {
      return {};
    }
  }

  function normalizeProfile(p) {
    if (!p) return null;
    const out = Object.assign({}, p);
    if (!out.meeshoTitle && out.title) out.meeshoTitle = out.title;
    if (!out.title && out.meeshoTitle) out.title = out.meeshoTitle;
    if (!Array.isArray(out.colorList)) {
      out.colorList = out.colors ? MP.splitList(out.colors) : [];
    }
    if (!Array.isArray(out.sizeList)) {
      out.sizeList = out.sizes ? MP.splitList(out.sizes) : [];
    }
    if (out.selling == null && out.price != null) out.selling = out.price;
    if (out.gstNum == null && out.gst) out.gstNum = String(out.gst).replace(/[^\d]/g, '');
    if (!out.labels && out.fit) out.labels = out.fit;
    return out;
  }

  async function boot() {
    if (!document.body) {
      setTimeout(boot, 500);
      return;
    }
    mountPanel();
    const stored = await loadState();
    renderPanel();

    try {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg) return false;
        if (msg.type === 'mp-fill') {
          (async () => {
            const profile = normalizeProfile(msg.profile) || state.profile;
            if (!profile) {
              sendResponse({ ok: 0, missed: FIELDS.map((f) => f.key), error: 'No product data' });
              return;
            }
            if (msg.product) state.product = msg.product;
            state.profile = profile;
            const res = await fillAll(profile);
            if (msg.attachImages) {
              const ir = await ensurePhotos(profile);
              if (ir) res.attach = ir;
            }
            if (!res.filled.length) {
              try {
                await chrome.storage.local.set({ mpPendingFill: true });
              } catch (e) {
                /* ignore */
              }
              autoFillWhenReady();
              res.pending = true;
            }
            startWatch();
            sendResponse(res);
          })();
          return true;
        }
        if (msg.type === 'mp-autolist') {
          (async () => {
            if (msg.profile) state.profile = normalizeProfile(msg.profile) || state.profile;
            if (msg.product) state.product = msg.product;
            if (!state.profile) {
              sendResponse({ ok: false, error: 'No product data' });
              return;
            }
            if (msg.attachImages != null) state.settings.autoAttachImages = !!msg.attachImages;
            const res = await autoList({
              profile: state.profile,
              steps: msg.steps,
              submit: !!msg.submit
            });
            sendResponse(res);
          })();
          return true;
        }
        if (msg.type === 'mp-attach') {          (async () => {
            if (!state.profile && msg.profile) state.profile = normalizeProfile(msg.profile);
            const res = await attachImages(msg.images || (state.profile && state.profile.images) || []);
            sendResponse(res);
          })();
          return true;
        }
        if (msg.type === 'mp-ping') {
          sendResponse({ ok: true, hasProduct: !!state.profile });
          return false;
        }
        return false;
      });
    } catch (e) {
      /* context invalidated */
    }

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.mpProduct && changes.mpProduct.newValue) {
          state.product = changes.mpProduct.newValue;
          state.profile = MP.buildProfile(state.product, state.settings);
          renderPanel();
        }
        if (changes.mpSettings && changes.mpSettings.newValue) {
          state.settings = Object.assign({}, MP.DEFAULT_SETTINGS, changes.mpSettings.newValue);
          if (state.product) state.profile = MP.buildProfile(state.product, state.settings);
          renderPanel();
        }
        if (changes.mpPendingFill && changes.mpPendingFill.newValue && state.profile) {
          setTimeout(() => autoFillWhenReady(), 800);
        }
        if (changes.mpPendingAuto && changes.mpPendingAuto.newValue && state.profile) {
          setTimeout(() => autoListWhenReady(), 1200);
        }
      });
    } catch (e) {
      /* ignore */
    }

    if (/[#&]mp(?:data)?=/.test(location.hash || '')) {
      try {
        await importShare(location.hash);
        history.replaceState(null, '', location.pathname + location.search);
      } catch (e) {
        /* importShare already logs */
      }
    } else if (stored.mpPendingFill && state.profile) {
      autoFillWhenReady();
    }

    if (stored.mpPendingAuto && state.profile) {
      autoListWhenReady();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
