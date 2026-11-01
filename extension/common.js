/* ============================================================
   Meesho Product Pro - shared helpers
   Loaded by both content scripts and by popup.html
   ============================================================ */
(function () {
  if (window.MP) return;
  const MP = {};

  /* ---------- tiny utils ---------- */
  MP.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  MP.norm = (s) =>
    String(s == null ? '' : s)
      .toLowerCase()
      .replace(/\u00a0/g, ' ')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

  MP.clean = (s) =>
    String(s == null ? '' : s)
      .replace(/\u00a0/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  MP.unique = (arr) => {
    const seen = new Set();
    const out = [];
    for (const raw of arr || []) {
      const v = typeof raw === 'string' ? raw.trim() : raw;
      if (!v) continue;
      const key = typeof v === 'string' ? v.toLowerCase() : JSON.stringify(v);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  };

  MP.escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  MP.parsePrice = (t) => {
    const m = String(t == null ? '' : t)
      .replace(/,/g, '')
      .match(/(\d{2,7}(?:\.\d{1,2})?)/);
    return m ? Math.round(Number(m[1])) : 0;
  };

  MP.inr = (n) => '\u20B9' + (Number(n) || 0).toLocaleString('en-IN');

  MP.discount = (mrp, price) =>
    Number(mrp) > Number(price) && Number(mrp) > 0
      ? Math.round((1 - Number(price) / Number(mrp)) * 100)
      : 0;

  MP.round9 = (n) => {
    const v = Number(n) || 0;
    if (!v) return 0;
    return Math.max(9, Math.round(v / 10) * 10 - 1);
  };

  MP.titleCase = (s) =>
    String(s || '')
      .toLowerCase()
      .split(/\s+/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');

  /* ---------- clipboard ---------- */
  MP.copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(String(text));
      return true;
    } catch (e) {
      try {
        const prevFocus = document.activeElement;
        const ta = document.createElement('textarea');
        ta.value = String(text);
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.focus({ preventScroll: true });
        ta.select();
        try {
          ta.setSelectionRange(0, ta.value.length);
        } catch (e3) {
          /* some browsers block setSelectionRange on hidden fields */
        }
        const ok = document.execCommand('copy');
        ta.remove();
        try {
          if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
        } catch (e4) {
          /* focus restore is best effort */
        }
        return ok;
      } catch (e2) {
        return false;
      }
    }
  };

  /* ---------- colours / sizes / category ---------- */
  MP.COLORS = [
    'Red', 'Maroon', 'Green', 'Olive', 'Blue', 'Navy Blue', 'Sky Blue', 'Teal',
    'Black', 'White', 'Off White', 'Cream', 'Beige', 'Brown', 'Coffee', 'Grey',
    'Charcoal', 'Pink', 'Baby Pink', 'Peach', 'Orange', 'Mustard', 'Yellow',
    'Purple', 'Lavender', 'Magenta', 'Wine', 'Gold', 'Golden', 'Silver',
    'Rose Gold', 'Multicolour', 'Multi', 'Turquoise', 'Coral', 'Rust'
  ];

  MP.SIZES = ['Free Size', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];

  MP.guessColors = (text) => {
    const t = ' ' + MP.norm(text) + ' ';
    const found = [];
    for (const c of MP.COLORS) {
      const n = MP.norm(c);
      if (new RegExp('(^|[^a-z])' + MP.escapeRe(n) + '([^a-z]|$)').test(t)) found.push(c);
    }
    // "&" separated colour names (e.g. red & gold)
    return MP.unique(found);
  };

  MP.splitList = (v) => {
    if (v == null) return [];
    if (Array.isArray(v)) return MP.unique(v.map((x) => MP.clean(String(x)))).filter(Boolean);
    return MP.unique(
      String(v)
        .split(/\s*(?:,|\/|&|\||;|\band\b)\s*/i)
        .map((s) => MP.clean(s))
        .filter((s) => s && s.length < 40)
    );
  };

  MP.guessSizes = (text) => {
    const raw = String(text || '');
    if (/\bfree\s*size\b/i.test(raw)) return ['Free Size'];
    const found = [];
    for (const s of MP.SIZES) {
      if (s === 'Free Size') continue;
      if (new RegExp('(^|[^A-Za-z])' + MP.escapeRe(s) + '([^A-Za-z]|$)', 'i').test(raw)) found.push(s);
    }
    return MP.unique(found);
  };

  MP.CATEGORY_RULES = [
    { re: /\b(saree|sari)\b/i, name: 'Saree' },
    { re: /\b(lehenga|lehenga choli|ghagra)\b/i, name: 'Lehenga' },
    { re: /\b(kurti|kurta|kurtis)\b/i, name: 'Kurti' },
    { re: /\b(salwar|palazzo suit|suit set|dress material)\b/i, name: 'Suit' },
    { re: /\b(blouse)\b/i, name: 'Blouse' },
    { re: /\b(dupatta|stole)\b/i, name: 'Dupatta' },
    { re: /\b(t-shirt|tshirt|tee)\b/i, name: 'T-Shirt' },
    { re: /\b(shirt)\b/i, name: 'Shirt' },
    { re: /\b(gown)\b/i, name: 'Gown' },
    { re: /\b(dress|frock)\b/i, name: 'Dress' },
    { re: /\b(top|tunic)\b/i, name: 'Top' },
    { re: /\b(night\s*suit|nightwear|nighty)\b/i, name: 'Nightwear' },
    { re: /\b(jeans|trouser|pant)\b/i, name: 'Bottom Wear' },
    { re: /\b(kids|boy|girl|baby)\b/i, name: 'Kids Wear' },
    { re: /\b(shoe|shoes|sneaker|sneakers|sandal|slipper|footwear)\b/i, name: 'Footwear' },
    { re: /\b(handbag|backpack|wallet|clutch|bag)\b/i, name: 'Bags' },
    { re: /\b(watch|smartwatch)\b/i, name: 'Watches' },
    { re: /\b(headphone|earphone|earbuds?|speaker)\b/i, name: 'Audio' },
    { re: /\b(mobile|smartphone)\b/i, name: 'Mobiles' },
    { re: /\b(laptop|tablet)\b/i, name: 'Electronics' },
    { re: /\b(trimmer|shaver|grooming|hair dryer)\b/i, name: 'Grooming' },
    { re: /\b(beauty|makeup|lipstick|serum|face cream)\b/i, name: 'Beauty' },
    { re: /\b(bedsheet|curtain|cushion|kitchen|home decor)\b/i, name: 'Home' }
  ];

  MP.guessCategory = (text) => {
    const t = MP.norm(text);
    for (const r of MP.CATEGORY_RULES) if (r.re.test(t)) return r.name;
    return '';
  };

  MP.defaultsFor = (category) => {
    const t = MP.norm(category);
    if (/saree|sari/.test(t)) return { weightGrams: 400, length: 28, breadth: 22, height: 4 };
    if (/lehenga|gown/.test(t)) return { weightGrams: 800, length: 35, breadth: 28, height: 6 };
    if (/kurti|kurta|suit|salwar/.test(t)) return { weightGrams: 300, length: 26, breadth: 20, height: 3 };
    if (/t-shirt|tshirt|shirt|top|blouse/.test(t)) return { weightGrams: 220, length: 24, breadth: 18, height: 3 };
    if (/dress|frock/.test(t)) return { weightGrams: 350, length: 26, breadth: 20, height: 3 };
    return { weightGrams: 300, length: 25, breadth: 20, height: 3 };
  };

  MP.hsnFor = (text, fabric, fallback) => {
    const t = MP.norm(text + ' ' + (fabric || ''));
    if (/saree|sari/.test(t)) {
      if (/cotton/.test(t)) return '5208';
      if (/silk/.test(t)) return '5007';
      return '5407';
    }
    if (/blouse/.test(t)) return '6206';
    if (/lehenga|gown|dress|kurti|kurta|suit/.test(t)) return '6204';
    if (/t-shirt|tshirt|tee/.test(t)) return '6109';
    if (/shirt/.test(t)) return '6205';
    if (/jeans|trouser|pant|bottom/.test(t)) return '6203';
    if (/dupatta|stole/.test(t)) return '6214';
    if (/kids|baby/.test(t)) return '6111';
    return fallback || '6211';
  };

  /* ---------- settings ---------- */
  MP.DEFAULT_SETTINGS = {
    brand: '',
    manufacturerName: '',
    manufacturerAddress: '',
    country: 'India',
    hsnDefault: '6211',
    gstMode: 'auto', // auto | 5 | 12 | 18
    titleLimit: 60,
    priceAdjust: 0, // percent, can be negative
    priceOverride: 0, // fixed selling price, 0 = auto
    priceOverrideKey: '', // product key for which override applies
    titleOverride: '', // custom listing title, empty = auto
    titleOverrideKey: '', // product key for which override applies
    maxImages: 8,
    defaultStock: 20,
    weightGrams: 0, // 0 = auto from category
    length: 0,
    breadth: 0,
    height: 0,
    autoAttachImages: true,
    watchSteps: true,
    autoCollect: true, // har capture ka share code catalog queue me save karo
    autoSubmit: false, // auto-list review step par Submit khud na dabaye
    autoSteps: 12, // auto-list max steps
    viewerBase: '' // public share viewer URL (GitHub Pages) for sharing outside the extension
  };

  MP.getSettings = async () => {
    try {
      const r = await chrome.storage.local.get('mpSettings');
      return Object.assign({}, MP.DEFAULT_SETTINGS, r.mpSettings || {});
    } catch (e) {
      return Object.assign({}, MP.DEFAULT_SETTINGS);
    }
  };

  MP.saveSettings = async (patch) => {
    const cur = await MP.getSettings();
    const next = Object.assign({}, cur, patch || {});
    await chrome.storage.local.set({ mpSettings: next });
    return next;
  };

  /* ---------- description builder ---------- */
  MP.buildDescription = (p, s) => {
    const specs = p.specifications || {};
    const fabric = specs.Fabric || specs.Material || p.fabric || '';
    const category = p.category || MP.guessCategory(p.title) || 'product';
    const colors = (p.colors && p.colors.length ? p.colors : MP.guessColors((p.title || '') + ' ' + fabric)).slice(0, 4);
    const occasion = specs.Occasion || 'daily wear, office and festive occasions';
    let desc = MP.clean(p.description || '');

    if (desc.length < 90 || /^shop for |^buy .* at best price/i.test(desc)) {
      desc =
        (p.title ? p.title.replace(/\s*[|\-].*$/, '') + '. ' : '') +
        'Made from soft and breathable ' + (fabric ? fabric.toLowerCase() + ' ' : '') + category.toLowerCase() +
        ', this piece offers a comfortable fit and an elegant look.' +
        (colors.length ? ' Available in ' + colors.join(', ') + '.' : '') +
        ' Perfect for ' + occasion + '. Lightweight, easy to maintain and thoughtfully finished for all-day comfort.';
    }

    const extras = [];
    const highlights = (p.highlights || []).filter((h) => h && h.length > 4 && h.length < 160).slice(0, 8);
    if (highlights.length) {
      extras.push('Highlights:\n' + highlights.map((h) => '\u2022 ' + h).join('\n'));
    }

    const specLines = Object.entries(specs)
      .filter(([k, v]) => k && v && !/^description$/i.test(k) && !/^country of origin$/i.test(k))
      .slice(0, 24)
      .map(([k, v]) => '\u2022 ' + k + ': ' + v);
    if (specLines.length) extras.push('Specifications:\n' + specLines.join('\n'));

    const country = s.country || 'India';
    if (!/country of origin/i.test(desc)) extras.push('Country of Origin: ' + country);

    const mfg = s.manufacturerName || s.brand || '';
    if (mfg) {
      const addr = s.manufacturerAddress ? ', ' + s.manufacturerAddress : '';
      extras.push('Manufactured by: ' + mfg + addr + ', ' + country);
    }

    return MP.clean([desc].concat(extras).join('\n\n')).slice(0, 5000);
  };

  /* ---------- product -> listing profile ---------- */
  MP.buildProfile = (p, settings) => {
    const s = Object.assign({}, MP.DEFAULT_SETTINGS, settings || {});
    const pkey = String(p.productId || p.url || p.title || '').trim();
    const overrideOk = (key) => !key || String(key) === pkey;
    const specs = p.specifications || {};
    const category = p.category || MP.guessCategory((p.title || '') + ' ' + (p.subcategory || '')) || '';
    const fabric = specs.Fabric || specs.Material || p.fabric || '';
    const pattern = specs.Pattern || specs.Print || p.pattern || '';

    let colors = (p.colors && p.colors.length ? p.colors : []).map((c) => MP.titleCase(String(c)));
    if (!colors.length) colors = MP.guessColors((p.title || '') + ' ' + (specs.Colour || specs.Color || '') + ' ' + fabric);
    colors = MP.unique(colors).slice(0, 12);

    let sizes = (p.sizes && p.sizes.length ? p.sizes : []).map((x) => String(x).trim());
    if (!sizes.length) sizes = MP.guessSizes((specs.Size || '') + ' ' + (p.title || ''));
    sizes = MP.unique(sizes);
    if (!sizes.length && /saree|dupatta|stole/i.test(category + ' ' + (p.title || ''))) sizes = ['Free Size'];

    const basePrice = Number(p.price) || 0;
    const fixedPrice = overrideOk(s.priceOverrideKey) ? Number(s.priceOverride) || 0 : 0;
    let selling = basePrice;
    if (fixedPrice > 0) {
      selling = Math.round(fixedPrice);
    } else if (basePrice && Number(s.priceAdjust)) {
      selling = MP.round9(basePrice * (1 + Number(s.priceAdjust) / 100));
    }
    let mrp = Number(p.mrp) || 0;
    if (basePrice && mrp < basePrice) mrp = MP.round9(basePrice * 1.9);
    else if (basePrice && Number(s.priceAdjust) && mrp && !fixedPrice) mrp = MP.round9(mrp * (1 + Number(s.priceAdjust) / 100));
    if (fixedPrice > 0 && mrp <= selling) mrp = MP.round9(selling * 1.8);
    if (selling && mrp < selling) mrp = MP.round9(selling * 1.6);
    if (!mrp) mrp = selling;

    const gst =
      String(s.gstMode) === 'auto' || !s.gstMode
        ? (selling && selling <= 2500 ? 5 : 18)
        : Number(s.gstMode) || 5;

    const dims = MP.defaultsFor(category || p.title || '');
    const weightGrams = Number(s.weightGrams) || dims.weightGrams;
    const length = Number(s.length) || dims.length;
    const breadth = Number(s.breadth) || dims.breadth;
    const height = Number(s.height) || dims.height;

    const limit = Math.max(20, Number(s.titleLimit) || 60);
    const titleOverrideActive = overrideOk(s.titleOverrideKey) && !!s.titleOverride;
    let title = titleOverrideActive ? MP.clean(s.titleOverride) : MP.clean(p.title || '');
    if (!titleOverrideActive) {
      title = title
        .replace(/\s*[|\-]\s*(buy|meesho|online|shop).*$/i, '')
        .replace(/\s*online at best price.*$/i, '')
        .trim();
    }
    if (!title) title = 'New Product';
    if (title.length > limit) {
      const cut = title.slice(0, limit + 1);
      title = cut.slice(0, cut.lastIndexOf(' ') > limit * 0.6 ? cut.lastIndexOf(' ') : limit).trim();
    }
    title = title.replace(/[\s,;:.\-|/\\]+$/, '').trim();
    if (!title) title = 'New Product';

    const description = MP.buildDescription(Object.assign({}, p, { colors }), s);

    const brand = s.brand || p.brand || 'Generic';
    const manufacturerName = s.manufacturerName || brand;
    const manufacturer = s.manufacturerName
      ? 'Manufactured by: ' + s.manufacturerName + (s.manufacturerAddress ? ', ' + s.manufacturerAddress : '') + ', ' + (s.country || 'India')
      : '';

    const keywords = MP.unique(
      []
        .concat(colors.map((c) => c.toLowerCase()))
        .concat(
          String(title)
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 2)
        )
        .concat([MP.norm(category), MP.norm(fabric), 'meesho', 'daily wear'])
        .filter(Boolean)
    ).slice(0, 18);

    return {
      source: String(p.source || 'meesho') === 'flipkart' ? 'flipkart-product' : 'meesho-product',
      sourceUrl: p.url || '',
      productId: p.productId || '',
      title,
      meeshoTitle: title,
      flipkartTitle: (brand + ' ' + title + (colors.length ? ', ' + colors.slice(0, 3).join(', ') : '')).slice(0, 200),
      brand,
      category: category || 'Ethnic Wear',
      subcat: p.subcategory || p.subcat || specs.Type || pattern || category || '',
      fabric,
      pattern,
      occasion: specs.Occasion || '',
      colors: colors.join(', '),
      colorList: colors,
      sizes: sizes.join(', '),
      sizeList: sizes,
      mrp,
      selling: selling,
      price: selling,
      discount: MP.discount(mrp, selling),
      hsn: MP.hsnFor((category || '') + ' ' + (p.title || ''), fabric, s.hsnDefault),
      gst: gst + '%',
      gstNum: String(gst),
      weightText: weightGrams + ' grams',
      weightGrams,
      length,
      breadth,
      height,
      dimText: length + ' x ' + breadth + ' x ' + height + ' cm',
      pack: specs['Pack of'] || specs['Number of Items'] || '1',
      country: s.country || 'India',
      biz: brand,
      manufacturer,
      manufacturerName,
      manufacturerAddress: s.manufacturerAddress || '',
      care: specs['Care Instructions'] || specs['Wash Care'] || specs['Fabric Care'] || MP.clean(p.care || ''),
      description,
      highlights: p.highlights || [],
      specifications: specs,
      keywords: keywords.join(', '),
      defaultStock: Number(s.defaultStock) || 20,
      sku:
        (String(brand || 'MP').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'MP') +
        '-' +
        (String(p.productId || Date.now().toString().slice(-5)).slice(-6).toUpperCase()),
      images: (p.images || []).slice(0, Math.max(1, Number(s.maxImages) || 8)),
      imageCount: (p.images || []).length,
      rating: p.rating || '',
      ratingCount: p.ratingCount || ''
    };
  };

  /* ---------- pretty text for "copy everything" ---------- */
  MP.formatProductText = (p) => {
    if (!p) return '';
    const lines = [];
    lines.push('\uD83D\uDECD\uFE0F PRODUCT DETAILS - ' + String(p.source || 'meesho').toUpperCase());
    lines.push('Title: ' + (p.title || ''));
    if (p.productId) lines.push('Product ID: ' + p.productId);
    if (p.category) lines.push('Category: ' + p.category);
    if (p.brand) lines.push('Brand: ' + p.brand);
    if (p.price) {
      let price = 'Price: ' + MP.inr(p.price);
      if (p.mrp && Number(p.mrp) > Number(p.price)) {
        price += '  (MRP ' + MP.inr(p.mrp) + ', ' + (p.discount || MP.discount(p.mrp, p.price)) + '% OFF)';
      }
      lines.push(price);
    }
    if (p.rating) lines.push('Rating: ' + p.rating + (p.ratingCount ? ' (' + p.ratingCount + ' ratings)' : ''));
    if (p.colors && p.colors.length) lines.push('Colours: ' + p.colors.join(', '));
    if (p.sizes && p.sizes.length) lines.push('Sizes: ' + p.sizes.join(', '));
    if (p.seller) lines.push('Seller: ' + p.seller);
    if (p.returnPolicy) lines.push('Return: ' + p.returnPolicy);
    if (p.cod) lines.push('COD: ' + p.cod);

    const specs = Object.entries(p.specifications || {});
    if (specs.length) {
      lines.push('');
      lines.push('\uD83D\uDCCB SPECIFICATIONS');
      specs.forEach(([k, v]) => lines.push(k + ': ' + v));
    }

    if (p.highlights && p.highlights.length) {
      lines.push('');
      lines.push('\u2728 HIGHLIGHTS');
      p.highlights.forEach((h) => lines.push('\u2022 ' + h));
    }

    if (p.description) {
      lines.push('');
      lines.push('\uD83D\uDCDD DESCRIPTION');
      lines.push(p.description);
    }

    if (p.images && p.images.length) {
      lines.push('');
      lines.push('\uD83D\uDDBC\uFE0F IMAGES (' + p.images.length + ')');
      p.images.forEach((u, i) => lines.push(i + 1 + '. ' + u));
    }

    if (p.url) {
      lines.push('');
      lines.push('\uD83D\uDD17 ' + p.url);
    }
    return lines.join('\n');
  };

  MP.imageFileName = (url, index) => {
    const path = String(url || '').split('?')[0];
    const m = path.match(/\.(jpe?g|png|webp|gif|avif)$/i);
    let ext = m ? m[1].toLowerCase() : 'jpg';
    if (ext === 'jpeg') ext = 'jpg';
    return String(index + 1).padStart(2, '0') + '.' + ext;
  };

  MP.safeFolder = (s) =>
    String(s || 'product')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'product';

  /* ---------- share link / share code ---------- */
  function bytesToB64url(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function b64urlToBytes(b64) {
    let s = String(b64 || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  MP.SHARE_VERSION = 2;

  MP.encodeShare = async (product, settings, extra) => {
    const slim = MP.sanitizeProduct(Object.assign({}, product || {}));
    delete slim.extractedAt;
    const ex = extra || {};
    const data = {
      v: MP.SHARE_VERSION,
      app: 'meesho-product-pro',
      t: Date.now(),
      p: slim,
      s: settings || null,
      l: ex.profile || null,
      m: {
        title: slim.title || '',
        url: slim.url || '',
        images: (slim.images || []).length,
        specs: Object.keys(slim.specifications || {}).length,
        colors: (slim.colors || []).length,
        sizes: (slim.sizes || []).length
      }
    };
    const json = JSON.stringify(data);
    let bytes = new TextEncoder().encode(json);
    let kind = 'j1';
    try {
      if (typeof CompressionStream !== 'undefined') {
        const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
        const buf = await new Response(stream).arrayBuffer();
        bytes = new Uint8Array(buf);
        kind = 'g1';
      }
    } catch (e) {
      /* plain json fallback */
    }
    return kind + '.' + bytesToB64url(bytes);
  };

  MP.shareLink = (code) => 'https://supplier.meesho.com/#mp=' + encodeURIComponent(code || '');

  MP.viewerLink = (base, code) => {
    const clean = String(base || '').trim().replace(/[#?].*$/, '').replace(/\/+$/, '');
    if (!clean) return '';
    return clean + '/#mp=' + encodeURIComponent(code || '');
  };

  MP.shareContents = (product, profile, settings) => {
    const p = product || {};
    const specs = Object.keys(p.specifications || {}).length;
    return [
      { label: 'Product', value: p.title ? 'included' : 'missing' },
      { label: 'Specs', value: specs + ' fields' },
      { label: 'Images', value: (p.images || []).length + ' photos' },
      { label: 'Description', value: String(p.description || '').length + ' chars' },
      { label: 'Listing', value: profile ? 'ready' : 'missing' },
      { label: 'Settings', value: settings ? 'included' : 'default' }
    ];
  };

  MP.formatListingText = (p, profile, settings) => {
    if (!p) return '';
    const s = Object.assign({}, MP.DEFAULT_SETTINGS, settings || {});
    const pr = profile || MP.buildProfile(p, s);
    const limit = Math.max(20, Number(s.titleLimit) || 60);
    const title = pr.title || pr.meeshoTitle || '';
    const lines = [];
    const rule = '--------------------------------------------';

    lines.push('MEESHO LISTING - ' + (title || 'Untitled product'));
    lines.push(rule);
    lines.push('');
    lines.push('TITLE (' + String(title).length + '/' + limit + ')');
    lines.push(title || '-');
    lines.push('');
    lines.push('PRICE');
    lines.push('Selling: ' + MP.inr(pr.selling) + '   MRP: ' + MP.inr(pr.mrp) + '   Discount: ' + (pr.discount || 0) + '% OFF');
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
      (pr.highlights || []).forEach((h) => lines.push('- ' + h));
    }
    const specs = Object.entries(pr.specifications || p.specifications || {});
    if (specs.length) {
      lines.push('');
      lines.push('SPECIFICATIONS');
      specs.forEach(([k, v]) => lines.push(k + ': ' + v));
    }
    if (pr.care) {
      lines.push('');
      lines.push('CARE');
      lines.push(pr.care);
    }
    if (pr.manufacturer || pr.manufacturerName) {
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
    const images = pr.images || p.images || [];
    if (images.length) {
      lines.push('');
      lines.push('IMAGES (' + images.length + ')');
      images.forEach((u, i) => lines.push(i + 1 + '. ' + u));
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
  };

  function extractSharePayload(text) {
    const t = String(text || '').trim();
    if (!t) return '';
    if (/^[gj]1\./.test(t)) return t;
    if (t[0] === '{') return 'RAW:' + t;
    try {
      const u = new URL(t, location.href);
      const hash = u.hash.replace(/^#/, '');
      if (hash) {
        const hp = new URLSearchParams(hash);
        const hpv = hp.get('mp') || hp.get('mpdata');
        if (hpv) return hpv;
        if (/^[gj]1\./.test(hash)) return hash;
      }
      const sp = u.searchParams.get('mp') || u.searchParams.get('mpdata');
      if (sp) return sp;
    } catch (e) {
      /* not a url */
    }
    const m = t.match(/[#?&](?:mp|mpdata)=([^&\s]+)/);
    if (m) {
      try {
        return decodeURIComponent(m[1]);
      } catch (e) {
        return m[1];
      }
    }
    return '';
  }

  MP.sanitizeProduct = (p) => {
    const out = Object.assign({}, p || {});
    out.title = String(out.title || '').slice(0, 300);
    out.brand = String(out.brand || '').slice(0, 120);
    out.category = String(out.category || '').slice(0, 120);
    out.subcategory = String(out.subcategory || '').slice(0, 120);
    out.description = String(out.description || '').slice(0, 12000);
    out.price = Math.max(0, Number(out.price) || 0);
    out.mrp = Math.max(0, Number(out.mrp) || 0);
    out.rating = String(out.rating || '').slice(0, 20);
    out.ratingCount = String(out.ratingCount || '').slice(0, 20);
    out.productId = String(out.productId || '').slice(0, 80);
    out.url = /^https?:\/\//i.test(out.url || '') ? String(out.url).slice(0, 500) : '';
    out.colors = (Array.isArray(out.colors) ? out.colors : []).slice(0, 20).map((x) => String(x).slice(0, 40));
    out.sizes = (Array.isArray(out.sizes) ? out.sizes : []).slice(0, 20).map((x) => String(x).slice(0, 40));
    out.highlights = (Array.isArray(out.highlights) ? out.highlights : []).slice(0, 20).map((x) => String(x).slice(0, 300));
    out.images = (Array.isArray(out.images) ? out.images : [])
      .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
      .slice(0, 80);
    out.mainImage = /^https?:\/\//i.test(out.mainImage || '') ? out.mainImage : out.images[0] || '';
    if (out.specifications && typeof out.specifications === 'object') {
      const specs = {};
      Object.entries(out.specifications).slice(0, 60).forEach(([k, v]) => {
        const key = String(k || '').slice(0, 80);
        const val = String(v == null ? '' : v).slice(0, 500);
        if (key && val) specs[key] = val;
      });
      out.specifications = specs;
    } else {
      out.specifications = {};
    }
    return out;
  };

  MP.decodeShare = async (text) => {
    const payload = extractSharePayload(text);
    if (!payload) throw new Error('Share link ya code valid nahi hai.');

    let json = '';
    if (payload.indexOf('RAW:') === 0) {
      json = payload.slice(4);
    } else {
      const dot = payload.indexOf('.');
      const kind = payload.slice(0, dot);
      const b64 = payload.slice(dot + 1);
      const bytes = b64urlToBytes(b64);
      if (kind === 'g1') {
        if (typeof DecompressionStream === 'undefined') {
          throw new Error('Browser purana hai. Chrome update karo.');
        }
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        json = await new Response(stream).text();
      } else {
        json = new TextDecoder().decode(bytes);
      }
    }

    if (!json || json.length > 2000000) throw new Error('Share data bahut bada hai.');
    const data = JSON.parse(json);
    const pack = (obj, version) => ({
      version: Number(version) || 1,
      createdAt: Number(obj.t) || 0,
      product: MP.sanitizeProduct(obj.p),
      settings: obj.s && typeof obj.s === 'object' ? obj.s : null,
      profile: obj.l && typeof obj.l === 'object' ? obj.l : null,
      meta: obj.m && typeof obj.m === 'object' ? obj.m : null
    });
    if (data && data.p && data.p.title) return pack(data, data.v);
    if (data && data.title) return pack({ p: data }, 1);
    throw new Error('Share data me product nahi mila.');
  };

  /* ---------- capture library (history) ---------- */
  MP.HISTORY_MAX = 25;

  MP.historyKey = (p) => {
    if (!p) return '';
    return String(p.productId || p.url || p.title || '').trim();
  };

  MP.relativeTime = (ts) => {
    const diff = Date.now() - Number(ts || 0);
    if (!ts || diff < 0) return '';
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + 'm ago';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    const day = Math.floor(hr / 24);
    if (day < 7) return day + 'd ago';
    try {
      return new Date(Number(ts)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch (e) {
      return '';
    }
  };

  MP.getHistory = async () => {
    try {
      const r = await chrome.storage.local.get('mpHistory');
      return Array.isArray(r.mpHistory) ? r.mpHistory : [];
    } catch (e) {
      return [];
    }
  };

  MP.addHistory = async (product) => {
    const p = product && product.title ? product : null;
    if (!p) return MP.getHistory();
    const key = MP.historyKey(p);
    if (!key) return MP.getHistory();

    const images = (p.images || []).filter((u) => /^https?:\/\//i.test(String(u || ''))).slice(0, 16);
    const slim = Object.assign({}, p, {
      description: String(p.description || '').slice(0, 4000),
      images,
      extractedAt: p.extractedAt || Date.now()
    });

    const item = {
      key,
      at: Date.now(),
      title: String(p.title || '').slice(0, 200),
      price: Math.max(0, Number(p.price) || 0),
      mrp: Math.max(0, Number(p.mrp) || 0),
      rating: String(p.rating || ''),
      image: p.mainImage || images[0] || '',
      imageCount: images.length,
      url: String(p.url || ''),
      productId: String(p.productId || ''),
      product: slim
    };

    try {
      const list = await MP.getHistory();
      const next = [item].concat(list.filter((x) => x && x.key !== key)).slice(0, MP.HISTORY_MAX);
      await chrome.storage.local.set({ mpHistory: next });
      return next;
    } catch (e) {
      return MP.getHistory();
    }
  };

  MP.removeHistory = async (key) => {
    try {
      const list = await MP.getHistory();
      const next = list.filter((x) => x && x.key !== key);
      await chrome.storage.local.set({ mpHistory: next });
      return next;
    } catch (e) {
      return MP.getHistory();
    }
  };

  MP.clearHistory = async () => {
    try {
      await chrome.storage.local.remove('mpHistory');
    } catch (e) {
      /* ignore */
    }
    return [];
  };

  /* ---------- auto collected share data (for the public catalog) ---------- */
  MP.COLLECT_MAX = 200;

  MP.getCollected = async () => {
    try {
      const r = await chrome.storage.local.get('mpCollected');
      return Array.isArray(r.mpCollected) ? r.mpCollected : [];
    } catch (e) {
      return [];
    }
  };

  MP.collectShare = async (entry) => {
    const e = entry || {};
    const code = String(e.code || '').trim();
    if (!code) return MP.getCollected();
    const key = String(e.key || e.productId || e.url || e.title || code).trim();
    const item = {
      key,
      code,
      at: Date.now(),
      title: String(e.title || '').slice(0, 200),
      price: Math.max(0, Number(e.price) || 0),
      mrp: Math.max(0, Number(e.mrp) || 0),
      image: /^https?:\/\//i.test(e.image || '') ? String(e.image) : '',
      images: Math.max(0, Number(e.images) || 0),
      category: String(e.category || '').slice(0, 80)
    };
    try {
      const list = await MP.getCollected();
      const next = [item].concat(list.filter((x) => x && x.key !== key)).slice(0, MP.COLLECT_MAX);
      await chrome.storage.local.set({ mpCollected: next });
      return next;
    } catch (err) {
      return MP.getCollected();
    }
  };

  MP.removeCollected = async (key) => {
    try {
      const list = await MP.getCollected();
      const next = list.filter((x) => x && x.key !== key);
      await chrome.storage.local.set({ mpCollected: next });
      return next;
    } catch (e) {
      return MP.getCollected();
    }
  };

  MP.clearCollected = async () => {
    try {
      await chrome.storage.local.remove('mpCollected');
    } catch (e) {
      /* ignore */
    }
    return [];
  };

  /* ready-to-paste lines for data/shares.txt (newest first) */
  MP.collectedLines = (list) => {
    const rows = (list || []).filter((x) => x && x.code);
    return rows
      .map((x) => '# ' + (x.title || 'product') + (x.price ? ' | ' + MP.inr(x.price) : '') + '\n' + x.code)
      .join('\n');
  };

  window.MP = MP;
})();
