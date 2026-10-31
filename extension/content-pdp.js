/* ============================================================
   Meesho Product Pro - product page scraper
   Runs on https://www.meesho.com/* and https://meesho.com/*
   Extracts every possible product detail and exposes a small
   floating panel for 1-click copy / download / fill.
   ============================================================ */
(function () {
  if (window.__MP_PDP__) return;
  window.__MP_PDP__ = true;
  const MP = window.MP;
  if (!MP) return;

  let lastProduct = null;
  let extracting = false;
  let lastExtractAt = 0;
  let host = null;
  let shadow = null;
  let panelOpen = false;

  const KNOWN_SPECS = [
    'Fabric', 'Material', 'Colour', 'Color', 'Pattern', 'Print', 'Occasion',
    'Sleeve', 'Sleeves', 'Neck', 'Neckline', 'Fit', 'Type', 'Size', 'Pack of',
    'Country of Origin', 'Manufacturer', 'Weight', 'Length', 'Width', 'Border',
    'Blouse', 'Dupatta', 'Care Instructions', 'Wash Care', 'Number of Items',
    'Net Quantity', 'Brand', 'Ideal For', 'Gender', 'Age Group', 'Closure',
    'Shape', 'Product Code', 'SKU', 'Sold By', 'Return Policy'
  ];

  /* ---------------- generic helpers ---------------- */
  const clean = MP.clean;
  const norm = MP.norm;

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0;
  }

  function isProductPage() {
    if (/\/p\/[a-z0-9_-]+/i.test(location.pathname)) return true;
    if (/\/(product|pdp)\//i.test(location.pathname)) return true;
    return false;
  }

  function hasStrike(el) {
    let n = el;
    for (let i = 0; i < 4 && n; i++, n = n.parentElement) {
      const cs = getComputedStyle(n);
      const line = (cs.textDecorationLine || '') + ' ' + (cs.textDecoration || '');
      if (line.indexOf('line-through') !== -1) return true;
      const before = getComputedStyle(n, '::before');
      if (before && before.textDecoration && before.textDecoration.indexOf('line-through') !== -1) return true;
    }
    return false;
  }

  /* ---------------- specs ---------------- */
  function canonicalSpecKey(k) {
    const n = norm(k).replace(/[^a-z0-9 ]/g, '');
    for (const known of KNOWN_SPECS) {
      if (norm(known).replace(/[^a-z0-9 ]/g, '') === n) return known;
    }
    return MP.titleCase(clean(k)).slice(0, 34);
  }

  function parseSpecs(text) {
    const out = {};
    if (!text) return out;
    const lines = clean(text)
      .split(/\n+/)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const knownNorm = KNOWN_SPECS.map((k) => norm(k));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 240) continue;
      if (/^(product details|specifications|description)$/i.test(line)) continue;

      let m = line.match(/^([A-Za-z][A-Za-z0-9 /&()'.\-]{1,34})\s*[:\-\u2013]\s*(.{1,200})$/);
      if (m) {
        const key = canonicalSpecKey(m[1]);
        if (key) {
          out[key] = clean(m[2]);
          continue;
        }
      }

      const idx = knownNorm.indexOf(norm(line));
      if (idx >= 0 && i + 1 < lines.length) {
        const nxt = lines[i + 1];
        if (nxt.length < 180 && knownNorm.indexOf(norm(nxt)) === -1) {
          out[KNOWN_SPECS[idx]] = clean(nxt);
          i++;
          continue;
        }
      }

      for (const known of KNOWN_SPECS) {
        const n = norm(known);
        if (norm(line).indexOf(n + ' ') === 0) {
          const val = line.slice(known.length).replace(/^[\s:\-]+/, '').trim();
          if (val && val.length < 180) out[known] = clean(val);
          break;
        }
      }
    }
    return out;
  }

  function findSectionText(headingRe) {
    const heads = Array.from(
      document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,strong,p')
    ).filter((el) => visible(el) && headingRe.test(clean(el.innerText)));

    for (const h of heads.slice(0, 6)) {
      let node = h.parentElement;
      for (let i = 0; i < 4 && node; i++, node = node.parentElement) {
        const t = node.innerText || '';
        if (t.length > 40 && t.length < 6000) return clean(t);
      }
    }
    return '';
  }

  function domDescription() {
    let t = findSectionText(/^(product description|description|about this product|about the product)$/i);
    t = t.replace(/^(product description|description|about this product|about the product)\s*/i, '').trim();
    if (t.length > 3000) t = t.slice(0, 3000);
    if (t.length > 50) return t;

    const meta =
      document.querySelector('meta[property="og:description"]') ||
      document.querySelector('meta[name="description"]');
    const md = meta ? clean(meta.getAttribute('content') || '') : '';
    if (md.length > 60 && !/^shop for |^buy .* at best price|flipkart|amazon/i.test(md)) {
      return md.slice(0, 2000);
    }
    return '';
  }

  /* ---------------- images ---------------- */
  function normalizeImage(u) {
    if (!u) return '';
    let s = String(u).trim().replace(/^['"]|['"]$/g, '');
    s = s.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
    if (!s || /^data:/i.test(s)) return '';
    if (s.indexOf('//') === 0) s = 'https:' + s;
    try {
      const url = new URL(s, location.href);
      if (!/(^|\.)meesho\.com$/i.test(url.hostname) && !/(^|\.)meeshogroup\.com$/i.test(url.hostname)) return '';
      const path = url.pathname.toLowerCase();
      if (/(logo|icon|sprite|placeholder|avatar|favicon|loader|spinner)/.test(path)) return '';
      const hasExt = /\.(jpe?g|png|webp|gif|avif)$/i.test(path);
      if (!hasExt && !/^images\./i.test(url.hostname)) return '';

      const names = Array.from(url.searchParams.keys());
      const signed = names.some((k) => /^(sig|signature|token|expires|policy|key|se|sp|sv)$/i.test(k));
      const onlyResize = names.every((k) =>
        /^(width|height|w|h|q|quality|resize|fit|crop|auto|format|dpr|bg|aspect_ratio|sharp|compress)$/i.test(k)
      );
      if (!signed && onlyResize) url.search = '';
      return url.toString();
    } catch (e) {
      return '';
    }
  }

  function dedupeImages(list) {
    const map = new Map();
    for (const raw of list || []) {
      const url = normalizeImage(raw);
      if (!url) continue;
      let key = url.toLowerCase();
      try {
        key = new URL(url).pathname.toLowerCase();
      } catch (e) {
        /* keep url */
      }
      if (!map.has(key) || url.length < map.get(key).length) map.set(key, url);
    }
    return Array.from(map.values());
  }

  function imageFromAny(v, out) {
    if (!v) return;
    if (typeof v === 'string') {
      if (/^https?:|^\/\//i.test(v)) out.push(v);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x) => imageFromAny(x, out));
      return;
    }
    if (typeof v === 'object') {
      const pick =
        v.url || v.src || v.image_url || v.imageUrl || v.image || v.link || v.path || v.original;
      if (pick) imageFromAny(pick, out);
    }
  }

  function pickLargestFromSrcset(img) {
    const ss = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
    if (!ss) return img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || '';
    let best = '';
    let bestW = -1;
    ss.split(',').forEach((part) => {
      const bits = part.trim().split(/\s+/);
      if (!bits[0]) return;
      const w = parseInt(bits[1], 10) || 0;
      if (w > bestW) {
        bestW = w;
        best = bits[0];
      }
    });
    return best || img.currentSrc || img.getAttribute('src') || '';
  }

  function domImages() {
    const out = [];
    document.querySelectorAll('img').forEach((img) => {
      const r = img.getBoundingClientRect();
      if (r.width && r.height && r.width < 45 && r.height < 45) return;
      const src = pickLargestFromSrcset(img);
      imageFromAny(src, out);
      imageFromAny(img.getAttribute('data-src'), out);
    });

    document.querySelectorAll('[style*="background-image"]').forEach((el) => {
      const m = (el.getAttribute('style') || '').match(/background-image\s*:\s*url\((['"]?)(.*?)\1\)/i);
      if (m) imageFromAny(m[2], out);
    });
    return out;
  }

  function imagesFromScriptText(text) {
    const out = [];
    const src = String(text || '').replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
    const re = /https?:\/\/images\.(?:meeshogroup|meesho)\.com\/[^"'\s<>)\]}]+/gi;
    let m;
    while ((m = re.exec(src)) !== null) out.push(m[0]);
    return out;
  }

  /* ---------------- embedded JSON ---------------- */
  function parseScriptJson(text) {
    const t = String(text || '').trim().replace(/^<!--|-->$/g, '').trim();
    if (!t) return null;
    if (t[0] === '{' || t[0] === '[') {
      try {
        return JSON.parse(t);
      } catch (e) {
        /* not pure json */
      }
    }
    const m = t.match(
      /(?:window\.)?(?:__NEXT_DATA__|__INITIAL_STATE__|__PRELOADED_STATE__|__APOLLO_STATE__|__INITIAL_DATA__|__PRODUCT__)\s*=\s*(\{[\s\S]*\})\s*;?\s*$/
    );
    if (m) {
      try {
        return JSON.parse(m[1]);
      } catch (e) {
        /* ignore */
      }
    }
    return null;
  }

  const keyNorm = (k) => norm(k).replace(/[^a-z0-9]/g, '');

  function getVal(obj, names) {
    if (!obj || typeof obj !== 'object') return undefined;
    const wanted = names.map(keyNorm);
    for (const k of Object.keys(obj)) {
      if (wanted.indexOf(keyNorm(k)) !== -1 && obj[k] !== undefined && obj[k] !== null) {
        return obj[k];
      }
    }
    return undefined;
  }

  function numVal(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return Math.round(v);
    if (typeof v === 'object') {
      return numVal(
        v.value || v.amount || v.price || v.selling_price || v.mrp || v.original_price || v.max_price
      );
    }
    return MP.parsePrice(v);
  }

  function strVal(v) {
    if (v == null) return '';
    if (typeof v === 'string') return clean(v);
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') return clean(v.name || v.title || v.value || v.text || '');
    return '';
  }

  function stripHtml(s) {
    if (!s) return '';
    if (/<[a-z][\s\S]*>/i.test(String(s))) {
      const d = document.createElement('div');
      d.innerHTML = String(s);
      return clean(d.innerText || d.textContent || '');
    }
    return clean(String(s));
  }

  function toList(v) {
    if (v == null) return [];
    if (Array.isArray(v)) {
      const out = [];
      v.forEach((x) => {
        const s = strVal(x);
        if (s) out.push(s);
        else if (x && typeof x === 'object') {
          const inner = strVal(x.name || x.value || x.label);
          if (inner) out.push(inner);
        }
      });
      return MP.unique(out);
    }
    if (typeof v === 'string') return MP.splitList(v);
    return [];
  }

  function toImages(v) {
    const out = [];
    imageFromAny(v, out);
    return out;
  }

  function toSpecs(v) {
    const out = {};
    if (!v) return out;
    if (Array.isArray(v)) {
      v.forEach((item) => {
        if (!item) return;
        if (typeof item === 'string') {
          const m = item.match(/^([^:]{2,34}):\s*(.+)$/);
          if (m) out[canonicalSpecKey(m[1])] = clean(m[2]);
          return;
        }
        const k = item.name || item.key || item.label || item.attribute || item.title;
        const val = item.value || item.val || item.text || item.attribute_value;
        if (k && val) out[canonicalSpecKey(String(k))] = clean(String(val));
      });
      return out;
    }
    if (typeof v === 'object') {
      Object.keys(v).forEach((k) => {
        const val = v[k];
        if (val == null) return;
        if (typeof val === 'object') {
          const s = strVal(val);
          if (s) out[canonicalSpecKey(k)] = s;
        } else if (String(val).length < 220) {
          out[canonicalSpecKey(k)] = clean(String(val));
        }
      });
      return out;
    }
    if (typeof v === 'string' && /:/.test(v)) return parseSpecs(v);
    return out;
  }

  function candidateScore(o) {
    const keys = Object.keys(o).map(keyNorm);
    const has = (...names) => names.some((n) => keys.indexOf(keyNorm(n)) !== -1);
    let s = 0;
    const name = getVal(o, ['name', 'product_name', 'product_title', 'title', 'display_name']);
    if (typeof name === 'string' && name.length > 5 && name.length < 220) s += 10;
    if (has('price', 'selling_price', 'discounted_price', 'min_price', 'final_price')) s += 4;
    if (has('mrp', 'original_price', 'max_price', 'list_price')) s += 3;
    if (has('images', 'image_urls', 'image_url', 'media', 'photos', 'gallery', 'images_list')) s += 4;
    if (has('description', 'product_description', 'desc')) s += 3;
    if (has('specifications', 'specs', 'attributes', 'product_details', 'details')) s += 3;
    if (has('id', 'product_id', 'catalog_id', 'sku')) s += 2;
    if (typeof name === 'string' && /^(meesho|home|login|cart|wishlist|category)$/i.test(name.trim())) s -= 12;
    return s;
  }

  function readEmbeddedProduct() {
    const texts = [];
    document.querySelectorAll('script:not([src])').forEach((s) => {
      const t = s.textContent || '';
      if (t.length > 80 && t.length < 4500000) texts.push(t);
    });

    let best = null;
    let bestScore = 0;

    for (const text of texts) {
      if (!/__NEXT_DATA__|product_name|productName|"price"|"images"/i.test(text)) continue;
      const root = parseScriptJson(text);
      if (!root) continue;

      let localBest = null;
      let localScore = 0;
      let visited = 0;
      const seen = new Set();

      const walk = (node, depth) => {
        if (!node || typeof node !== 'object' || depth > 15 || visited > 60000) return;
        if (seen.has(node)) return;
        seen.add(node);
        visited++;
        if (!Array.isArray(node)) {
          const sc = candidateScore(node);
          if (sc > localScore) {
            localScore = sc;
            localBest = node;
          }
        }
        if (Array.isArray(node)) {
          for (let i = 0; i < node.length && i < 80; i++) walk(node[i], depth + 1);
        } else {
          const keys = Object.keys(node);
          for (let i = 0; i < keys.length && i < 90; i++) {
            const v = node[keys[i]];
            if (v && typeof v === 'object') walk(v, depth + 1);
          }
        }
      };

      walk(root, 0);
      if (localScore > bestScore) {
        bestScore = localScore;
        best = localBest;
      }
    }
    return bestScore >= 17 ? best : null;
  }

  /* ---------------- JSON-LD ---------------- */
  function readJsonLd() {
    const products = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        const data = JSON.parse((s.textContent || '').replace(/^\s*<!--|-->\s*$/g, ''));
        const stack = [data];
        while (stack.length) {
          const x = stack.pop();
          if (!x || typeof x !== 'object') continue;
          if (Array.isArray(x)) {
            x.forEach((i) => stack.push(i));
            continue;
          }
          if (x['@graph']) stack.push(x['@graph']);
          const t = x['@type'];
          const types = (Array.isArray(t) ? t : [t]).map((v) => String(v || '').toLowerCase());
          if (types.indexOf('product') !== -1) products.push(x);
          Object.values(x).forEach((v) => {
            if (v && typeof v === 'object') stack.push(v);
          });
        }
      } catch (e) {
        /* ignore bad ld+json */
      }
    });
    return products;
  }

  /* ---------------- apply sources ---------------- */
  function blankProduct() {
    return {
      source: 'meesho',
      url: location.href.split('#')[0],
      productId: (location.pathname.match(/\/p\/([a-z0-9_-]+)/i) || [])[1] || '',
      title: '',
      brand: '',
      category: '',
      subcategory: '',
      fabric: '',
      pattern: '',
      price: 0,
      mrp: 0,
      discount: 0,
      rating: '',
      ratingCount: '',
      description: '',
      highlights: [],
      specifications: {},
      colors: [],
      sizes: [],
      images: [],
      mainImage: '',
      seller: '',
      returnPolicy: '',
      cod: '',
      stock: '',
      keywords: '',
      care: '',
      extractedAt: 0
    };
  }

  function applyEmbedded(p, o) {
    if (!o) return;
    const title = strVal(getVal(o, ['name', 'product_name', 'product_title', 'title', 'display_name']));
    if (!p.title && title) p.title = title;

    const brand = getVal(o, ['brand', 'brand_name']);
    if (!p.brand) p.brand = strVal(brand);

    const price = numVal(
      getVal(o, ['price', 'selling_price', 'discounted_price', 'final_price', 'min_price', 'offer_price'])
    );
    if (!p.price && price) p.price = price;

    const mrp = numVal(getVal(o, ['mrp', 'original_price', 'max_price', 'list_price', 'strike_price']));
    if (!p.mrp && mrp) p.mrp = mrp;

    const desc = stripHtml(getVal(o, ['description', 'product_description', 'desc', 'long_description']));
    if (!p.description && desc) p.description = desc;

    const ratingRaw = getVal(o, ['rating', 'avg_rating', 'average_rating', 'rating_value']);
    if (!p.rating && ratingRaw != null) {
      if (ratingRaw && typeof ratingRaw === 'object') {
        p.rating = strVal(ratingRaw.average || ratingRaw.value || ratingRaw.rating || ratingRaw.rating_value);
        p.ratingCount = strVal(
          ratingRaw.count || ratingRaw.rating_count || ratingRaw.total || ratingRaw.review_count
        );
      } else {
        p.rating = strVal(ratingRaw);
      }
    }
    const count = getVal(o, ['rating_count', 'ratingCount', 'review_count', 'reviews_count', 'total_ratings']);
    if (!p.ratingCount && count != null) p.ratingCount = strVal(count);

    p.seller = p.seller || strVal(getVal(o, ['seller_name', 'supplier_name', 'store_name', 'seller']));
    p.category = p.category || strVal(getVal(o, ['category', 'category_name', 'catalog_name', 'product_type']));
    p.subcategory = p.subcategory || strVal(getVal(o, ['sub_category', 'subcategory', 'sub_type']));
    p.stock = p.stock || strVal(getVal(o, ['stock', 'quantity', 'available_quantity', 'inventory']));
    p.cod = p.cod || strVal(getVal(o, ['cod', 'cash_on_delivery']));
    p.returnPolicy = p.returnPolicy || strVal(getVal(o, ['return_policy', 'returns']));
    p.keywords = p.keywords || strVal(getVal(o, ['keywords', 'search_keywords', 'tags']));

    const colors = toList(getVal(o, ['colors', 'colours', 'available_colors', 'color', 'colour', 'color_name', 'colour_name']));
    if (!p.colors.length && colors.length) p.colors = colors;

    const sizes = toList(getVal(o, ['sizes', 'available_sizes', 'size', 'size_options']));
    if (!p.sizes.length && sizes.length) p.sizes = sizes;

    const hl = toList(getVal(o, ['highlights', 'product_highlights', 'key_features', 'features', 'usp']));
    if (!p.highlights.length && hl.length) p.highlights = hl.filter((h) => h.length > 4 && h.length < 180);

    const specs = toSpecs(
      getVal(o, ['specifications', 'specs', 'attributes', 'product_details', 'details', 'attribute_values'])
    );
    p.specifications = Object.assign({}, specs, p.specifications);

    const imgs = toImages(
      getVal(o, ['images', 'image_urls', 'images_list', 'image', 'photos', 'gallery', 'media', 'product_images'])
    );
    if (imgs.length) p.images = dedupeImages(p.images.concat(imgs));

    const fabric = getVal(o, ['fabric', 'material']);
    if (!p.fabric && fabric) p.fabric = strVal(fabric);
    const pattern = getVal(o, ['pattern', 'print', 'design']);
    if (!p.pattern && pattern) p.pattern = strVal(pattern);
  }

  function applyJsonLd(p, ld) {
    if (!ld) return;
    if (!p.title) p.title = strVal(ld.name);
    if (!p.brand) {
      const b = ld.brand;
      p.brand = typeof b === 'object' ? strVal(b.name) : strVal(b);
    }
    if (!p.description) p.description = stripHtml(ld.description);
    if (!p.category) p.category = strVal(ld.category);

    const offers = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
    if (offers) {
      if (!p.price) p.price = numVal(offers.price || offers.lowPrice || offers.priceSpecification);
      if (!p.mrp) p.mrp = numVal(offers.highPrice);
    }
    const ar = ld.aggregateRating;
    if (ar && !p.rating) {
      p.rating = strVal(ar.ratingValue);
      p.ratingCount = strVal(ar.ratingCount || ar.reviewCount);
    }
    if (ld.color && !p.colors.length) p.colors = toList(ld.color);
    if (ld.size && !p.sizes.length) p.sizes = toList(ld.size);
    if (ld.material && !p.fabric) p.fabric = strVal(ld.material);
    if (ld.pattern && !p.pattern) p.pattern = strVal(ld.pattern);
    if (ld.sku && !p.productId) p.productId = strVal(ld.sku);

    const imgs = toImages(ld.image);
    if (imgs.length) p.images = dedupeImages(p.images.concat(imgs));

    const props = ld.additionalProperty;
    if (Array.isArray(props)) {
      const specs = toSpecs(props);
      p.specifications = Object.assign({}, specs, p.specifications);
    }
  }

  function domTitle() {
    const h1s = Array.from(document.querySelectorAll('h1')).filter((el) => {
      const t = clean(el.innerText);
      return visible(el) && t.length > 6 && t.length < 240;
    });
    if (h1s.length) {
      let best = h1s[0];
      for (const h of h1s) {
        if (clean(h.innerText).length > clean(best.innerText).length) best = h;
      }
      const t = clean(best.innerText);
      if (!/^(meesho|home|search|products?)$/i.test(t)) return t;
    }
    const og = document.querySelector('meta[property="og:title"]');
    return og ? clean(og.getAttribute('content') || '') : '';
  }

  function domPrices() {
    const h1 = document.querySelector('h1');
    const h1Top = h1 ? h1.getBoundingClientRect().top + window.scrollY : 0;

    const nodes = Array.from(
      document.querySelectorAll('span,div,p,h2,h3,h4,h5,h6,b,strong')
    );
    const cands = [];

    for (const el of nodes) {
      if (el.children.length) continue;
      const t = clean(el.textContent);
      if (t.length > 18) continue;
      if (!/^(?:\u20B9|rs\.?|inr)\s*[\d,]+(?:\.\d{1,2})?$/i.test(t)) continue;
      if (!visible(el)) continue;
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      if (h1Top && Math.abs(top - h1Top) > 1500) continue;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize) || 0;
      cands.push({ price: MP.parsePrice(t), fs, strike: hasStrike(el), top, el });
    }

    let price = 0;
    let mrp = 0;

    const normal = cands.filter((c) => !c.strike).sort((a, b) => b.fs - a.fs || a.top - b.top);
    if (normal.length) price = normal[0].price;

    const struck = cands.filter((c) => c.strike).sort((a, b) => b.fs - a.fs || a.top - b.top);
    if (struck.length) mrp = struck[0].price;

    if (!mrp) {
      const m = (document.body.innerText || '').match(/MRP\s*[:\u20B9]?\s*[\u20B9]?\s*([\d,]+)/i);
      if (m) mrp = MP.parsePrice(m[1]);
    }

    // Fallback for split price markup e.g. <h4>₹<span>499</span></h4>
    if (!price || !mrp) {
      const all = Array.from(
        document.querySelectorAll('span,div,p,h2,h3,h4,h5,h6,b,strong')
      ).filter((el) => {
        if (!visible(el) || el.closest('header,footer,nav')) return false;
        const t = clean(el.innerText || '');
        return t.length > 1 && t.length < 24 && /^(?:\u20B9|rs\.?|inr)\s*[\d,]+(?:\.\d{1,2})?$/i.test(t);
      });
      const extra = all.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          price: MP.parsePrice(el.innerText),
          fs: parseFloat(getComputedStyle(el).fontSize) || 0,
          strike: hasStrike(el),
          top: r.top + window.scrollY
        };
      });
      if (!price) {
        const n = extra.filter((c) => !c.strike).sort((a, b) => b.fs - a.fs || a.top - b.top);
        if (n.length) price = n[0].price;
      }
      if (!mrp) {
        const s = extra.filter((c) => c.strike).sort((a, b) => b.fs - a.fs || a.top - b.top);
        if (s.length) mrp = s[0].price;
      }
    }

    if (!price) {
      const meta =
        document.querySelector('meta[property="product:price:amount"]') ||
        document.querySelector('meta[property="og:price:amount"]');
      if (meta) price = MP.parsePrice(meta.getAttribute('content') || '');
    }

    let discount = 0;
    const priceEl = normal[0] && normal[0].el;
    if (priceEl) {
      let n = priceEl;
      for (let i = 0; i < 4 && n && !discount; i++, n = n.parentElement) {
        const m = (n.innerText || '').match(/(\d{1,2})\s*%\s*off/i);
        if (m) discount = Number(m[1]);
      }
    }
    if (!discount) {
      const m = (document.body.innerText || '').match(/(\d{1,2})\s*%\s*off/i);
      if (m) discount = Number(m[1]);
    }

    return { price, mrp, discount };
  }

  function domRating() {
    const scope = (document.querySelector('main') || document.body).innerText || '';
    let m = scope.match(
      /([1-5](?:\.\d)?)\s*[\u2605\u2b50]?\s*\(?\s*([\d.,]+\s*[KkMm]?)\s*\)?\s*(?:ratings?|reviews?)/i
    );
    if (m) return { rating: m[1], count: clean(m[2]) };

    const els = Array.from(document.querySelectorAll('[class*=rating i],[class*=Rating],[aria-label*=rating i]')).filter(visible);
    for (const el of els.slice(0, 8)) {
      const t = clean(el.innerText || el.getAttribute('aria-label') || '');
      const r = t.match(/([1-5](?:\.\d)?)/);
      if (r) {
        const c = t.match(/([\d.,]+\s*[KkMm]?)\s*(?:ratings?|reviews?)/i);
        return { rating: r[1], count: c ? clean(c[1]) : '' };
      }
    }
    return { rating: '', count: '' };
  }

  function domSpecs() {
    const section = findSectionText(/^(product details|specifications|product specifications|additional details)$/i);
    let specs = parseSpecs(section);
    if (Object.keys(specs).length < 2) {
      const alt = findSectionText(/^(product information|details)$/i);
      specs = Object.assign(specs, parseSpecs(alt));
    }
    return specs;
  }

  function domHighlights() {
    const main = document.querySelector('main') || document.body;
    const out = [];
    main.querySelectorAll('li').forEach((li) => {
      if (li.closest('header,footer,nav')) return;
      if (!visible(li)) return;
      const t = clean(li.innerText);
      if (t.length < 8 || t.length > 140) return;
      if (/^\u20B9|^[1-5]\.\d|ratings?|reviews?|similar products|sponsored/i.test(t)) return;
      out.push(t);
    });
    return MP.unique(out).slice(0, 10);
  }

  function domSeller() {
    const t = (document.body.innerText || '').slice(0, 20000);
    const m = t.match(/(?:sold by|seller)\s*[:\-]?\s*([A-Za-z0-9 &.'()\-]{2,40})/i);
    return m ? clean(m[1]) : '';
  }

  function domCategory(p) {
    const crumbEls = document.querySelectorAll(
      '[class*=breadcrumb i] a,[class*=Breadcrumb] a,[aria-label*=breadcrumb i] a'
    );
    const crumbs = Array.from(crumbEls).map((a) => clean(a.innerText)).filter(Boolean);
    if (crumbs.length) {
      p.category = crumbs.length > 1 ? crumbs[crumbs.length - 2] : crumbs[0];
      return;
    }
    const guess = MP.guessCategory((p.title || '') + ' ' + (p.fabric || ''));
    if (guess) p.category = guess;
  }

  /* ---------------- main extraction ---------------- */
  function extract() {
    const p = blankProduct();
    const scripts = [];
    document.querySelectorAll('script:not([src])').forEach((s) => {
      const t = s.textContent || '';
      if (t.length > 60) scripts.push(t);
    });

    // 1. embedded app data (most precise)
    const embedded = readEmbeddedProduct();
    if (embedded) applyEmbedded(p, embedded);

    // 2. JSON-LD
    const lds = readJsonLd();
    if (lds.length) applyJsonLd(p, lds[0]);

    // 3. DOM
    if (!p.title) p.title = domTitle();
    const dp = domPrices();
    if (!p.price) p.price = dp.price;
    if (!p.mrp) p.mrp = dp.mrp;
    if (!p.discount) p.discount = dp.discount;
    if (!p.rating) {
      const dr = domRating();
      p.rating = dr.rating;
      if (!p.ratingCount) p.ratingCount = dr.count;
    }
    if (!p.description) p.description = domDescription();
    if (!p.seller) p.seller = domSeller();
    if (!p.category) domCategory(p);
    if (!p.highlights.length) p.highlights = domHighlights();

    const specs = domSpecs();
    p.specifications = Object.assign({}, p.specifications, specs);
    if (!p.fabric) p.fabric = p.specifications.Fabric || p.specifications.Material || '';
    if (!p.pattern) p.pattern = p.specifications.Pattern || p.specifications.Print || '';
    if (!p.colors.length) {
      const c = p.specifications.Colour || p.specifications.Color || '';
      if (c) p.colors = MP.splitList(c);
    }
    if (!p.sizes.length) {
      const s = p.specifications.Size || '';
      if (s) p.sizes = MP.splitList(s);
    }
    if (!p.care) p.care = p.specifications['Care Instructions'] || p.specifications['Wash Care'] || '';

    // 4. images
    const imagePool = [];
    const og = document.querySelector('meta[property="og:image"]');
    if (og) imagePool.push(og.getAttribute('content'));
    if (lds.length) imageFromAny(lds[0].image, imagePool);
    if (embedded) imageFromAny(
      getVal(embedded, ['images', 'image_urls', 'images_list', 'image', 'photos', 'gallery', 'media', 'product_images']),
      imagePool
    );
    imagePool.push.apply(imagePool, domImages());

    const interim = dedupeImages(imagePool);
    if (interim.length < 3) {
      scripts.forEach((t) => {
        if (t.length < 900000) imagePool.push.apply(imagePool, imagesFromScriptText(t));
      });
    }

    p.images = dedupeImages(imagePool);
    if (p.mainImage) p.images = dedupeImages([p.mainImage].concat(p.images));
    p.mainImage = p.images[0] || '';

    // 5. derive / clean
    p.title = clean(p.title)
      .replace(/\s*[|\-]\s*(buy|meesho|online|shop).*$/i, '')
      .replace(/\s*online at best price.*$/i, '')
      .trim();
    p.description = clean(p.description);
    p.brand = clean(p.brand);
    p.colors = MP.unique(p.colors.map((c) => MP.titleCase(clean(String(c))))).slice(0, 12);
    p.sizes = MP.unique(
      p.sizes.map((s) => {
        const v = clean(String(s));
        if (/^free\s*size$/i.test(v)) return 'Free Size';
        if (/^(xxs|xs|s|m|l|xl|xxl|3xl|4xl|5xl)$/i.test(v)) return v.toUpperCase();
        return v;
      })
    ).slice(0, 12);

    if (!p.colors.length) p.colors = MP.guessColors(p.title + ' ' + p.fabric).slice(0, 6);
    if (!p.category) p.category = MP.guessCategory(p.title + ' ' + (p.subcategory || ''));
    if (!p.discount && p.mrp > p.price) p.discount = MP.discount(p.mrp, p.price);
    if (p.mrp && p.price && p.mrp < p.price) p.mrp = 0;
    if (!p.price && p.mrp) p.price = p.mrp;
    if (!p.mrp && p.price) p.mrp = 0;
    if (!p.subcategory) {
      p.subcategory = p.specifications.Type || p.specifications.Pattern || p.category || '';
    }
    if (!p.keywords) {
      p.keywords = MP.unique(
        [p.category, p.fabric, p.brand].concat(p.colors).filter(Boolean)
      ).join(', ');
    }
    p.extractedAt = Date.now();

    if (!p.title || p.title.length < 3) return null;
    return p;
  }

  /* ---------------- floating panel ---------------- */
  const PANEL_CSS = `
    :host{all:initial}
    *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
    #fab{position:fixed;right:16px;bottom:18px;z-index:2147483647;width:56px;height:56px;border:0;border-radius:18px;
      background:linear-gradient(135deg,#f0338f,#a5138d 55%,#6c1cff);color:#fff;
      box-shadow:0 10px 26px rgba(160,20,110,.42),inset 0 -2px 0 rgba(0,0,0,.14);
      cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:24px;
      transition:transform .18s cubic-bezier(.2,.8,.2,1),box-shadow .18s}
    #fab:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 14px 32px rgba(160,20,110,.5)}
    #fab:active{transform:scale(.98)}
    #fab .n{position:absolute;top:-4px;right:-4px;min-width:21px;height:21px;padding:0 5px;border-radius:11px;
      background:#181322;color:#fff;font-size:10.5px;font-weight:800;display:none;align-items:center;justify-content:center;
      box-shadow:0 0 0 2px #fff}
    #panel{position:fixed;right:16px;bottom:84px;z-index:2147483647;width:368px;max-height:76vh;display:none;
      flex-direction:column;background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(24,19,34,.34);
      overflow:hidden;color:#181322;animation:mpIn .2s cubic-bezier(.2,.8,.2,1)}
    @keyframes mpIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
    .head{background:radial-gradient(120% 130% at 95% -20%,rgba(255,255,255,.28),transparent 55%),
      linear-gradient(120deg,#f0338f,#b2156f 55%,#6c1cff);color:#fff;padding:12px 14px;display:flex;
      align-items:center;justify-content:space-between;gap:10px}
    .hb{display:flex;align-items:center;gap:9px;min-width:0}
    .logo{width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,.95);color:#c2187f;
      display:flex;align-items:center;justify-content:center;font-weight:900;font-size:17px;flex:0 0 auto}
    .ttl{font-size:13px;font-weight:800;line-height:1.2;white-space:nowrap}
    .sub{font-size:10px;opacity:.82;margin-top:1px;white-space:nowrap}
    .head button{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.2);color:#fff;
      width:27px;height:27px;border-radius:9px;cursor:pointer;font-size:17px;line-height:1;flex:0 0 auto}
    .head button:hover{background:rgba(255,255,255,.3)}
    .body{padding:13px 14px 14px;overflow:auto}
    .body::-webkit-scrollbar{width:8px}
    .body::-webkit-scrollbar-thumb{background:#ddd6e8;border-radius:6px}
    .status{font-size:11.5px;color:#6f6880;line-height:1.5;margin-bottom:9px;background:#f7f5fb;
      border:1px solid #ece7f4;border-radius:9px;padding:7px 9px}
    .status.ok{color:#0b8a57;background:#e9f9f1;border-color:#c8f0dc;font-weight:650}
    .status.err{color:#cf1f3f;background:#fdecef;border-color:#f8cdd6;font-weight:650}
    .preview{display:none;gap:10px;margin-bottom:10px;background:#fbf9fe;border:1px solid #eee9f6;
      border-radius:12px;padding:9px}
    .preview.on{display:flex}
    .preview img{width:62px;height:78px;object-fit:cover;border-radius:9px;background:#f2f0f7;flex:0 0 auto;border:1px solid #ece7f4}
    .pt{font-size:12px;font-weight:700;line-height:1.35;max-height:50px;overflow:hidden;color:#181322}
    .pp{font-size:13px;color:#0b8a57;font-weight:800;margin-top:4px}
    .pm{font-size:10px;color:#7c748f;margin-top:3px;line-height:1.45}
    .row{display:flex;gap:7px;margin-top:7px}
    .row button{flex:1;border:0;border-radius:10px;padding:9px 8px;font-size:11.5px;font-weight:750;cursor:pointer;
      background:#f2eff8;color:#3c3450;transition:filter .15s,transform .12s}
    .row button:hover{filter:brightness(.97)}
    .row button:active{transform:translateY(1px)}
    .row button.pri{background:linear-gradient(135deg,#f0338f,#c2187f);color:#fff;box-shadow:0 5px 14px rgba(240,51,143,.24)}
    .row button.dark{background:linear-gradient(135deg,#2a2338,#14101c);color:#fff}
    .hint{font-size:10px;color:#8b849c;line-height:1.5;margin-top:10px;border-top:1px solid #eee9f6;padding-top:8px}
  `;

  function status(msg, kind) {
    if (!shadow) return;
    const el = shadow.getElementById('status');
    if (!el) return;
    el.innerText = msg;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function renderPanel() {
    if (!shadow) return;
    const p = lastProduct;
    const prev = shadow.getElementById('preview');
    const badge = shadow.querySelector('#fab .n');
    if (!p) {
      prev.classList.remove('on');
      if (badge) badge.style.display = 'none';
      status('Product page ka data scan ho raha hai... Thoda scroll karke wait karo.');
      return;
    }
    const thumb = shadow.getElementById('thumb');
    thumb.src = p.mainImage || '';
    thumb.referrerPolicy = 'no-referrer';
    thumb.style.display = p.mainImage ? '' : 'none';
    shadow.getElementById('ptitle').innerText = p.title;
    shadow.getElementById('pprice').innerText = p.price
      ? MP.inr(p.price) + (p.mrp ? '  MRP ' + MP.inr(p.mrp) : '')
      : 'Price not found';
    const bits = [];
    if (p.colors.length) bits.push(p.colors.slice(0, 3).join(', '));
    if (p.sizes.length) bits.push(p.sizes.slice(0, 3).join(', '));
    if (p.images.length) bits.push(p.images.length + ' images');
    shadow.getElementById('pmeta').innerText = bits.join(' \u00b7 ');
    prev.classList.add('on');
    if (badge) {
      badge.style.display = p.images.length ? 'flex' : 'none';
      badge.innerText = String(p.images.length);
    }
    status('Product captured \u2713  Details, specs aur images ready hain.', 'ok');
  }

  function cacheImages(urls) {
    const list = (urls || []).filter(Boolean).slice(0, 10);
    if (!list.length) return;
    try {
      const p = chrome.runtime.sendMessage({ type: 'cache-images', urls: list });
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* background unavailable */
    }
  }

  async function extractAndStore(force) {
    if (extracting) return lastProduct;
    if (!isProductPage()) return null;
    if (!force && Date.now() - lastExtractAt < 4000) return lastProduct;
    extracting = true;
    lastExtractAt = Date.now();
    try {
      const p = extract();
      if (p && p.title) {
        const changed =
          !lastProduct ||
          lastProduct.title !== p.title ||
          lastProduct.price !== p.price ||
          lastProduct.images.length !== p.images.length;
        lastProduct = p;
        if (changed) {
          try {
            await chrome.storage.local.set({ mpProduct: p, mpProductAt: Date.now() });
          } catch (e) {
            /* storage unavailable */
          }
          try {
            MP.addHistory(p);
          } catch (e) {
            /* library optional */
          }
          try {
            chrome.runtime.sendMessage({
              type: 'product-captured',
              title: p.title,
              images: p.images.length
            });
          } catch (e) {
            /* no background */
          }
          cacheImages(p.images);
        }
        renderPanel();
        return p;
      }
      status('Details nahi mile. Page poora load hone ke baad extension icon se retry karo.', 'err');
      return null;
    } catch (e) {
      status('Extract error: ' + e.message, 'err');
      return null;
    } finally {
      extracting = false;
    }
  }

  async function downloadAll() {
    const p = lastProduct;
    if (!p || !p.images.length) {
      status('Koi image nahi mili.', 'err');
      return;
    }
    const list = p.images.slice(0, 8);
    const folder = 'Meesho-' + MP.safeFolder(p.productId || p.title);
    for (let i = 0; i < list.length; i++) {
      status('Downloading ' + (i + 1) + '/' + list.length + '...');
      try {
        const r = await chrome.runtime.sendMessage({
          type: 'download-image',
          url: list[i],
          filename: folder + '/' + MP.imageFileName(list[i], i)
        });
        if (!r || !r.ok) throw new Error((r && r.error) || 'download failed');
      } catch (e) {
        status('Download error: ' + e.message, 'err');
        return;
      }
    }
    status('Downloaded ' + list.length + ' images \u2713', 'ok');
  }

  async function fillSeller() {
    const p = lastProduct || (await extractAndStore(true));
    if (!p) {
      status('Pehle product page se details capture karo.', 'err');
      return;
    }
    try {
      cacheImages(p.images);
      await chrome.storage.local.set({ mpProduct: p, mpPendingFill: true });
      await chrome.runtime.sendMessage({ type: 'open-seller' });
      status('Seller tab khol diya. Add Product page par form + photos auto-fill honge \u2713', 'ok');
    } catch (e) {
      status('Seller page open nahi hua: ' + e.message, 'err');
    }
  }

  async function shareLink() {
    const p = lastProduct || (await extractAndStore(true));
    if (!p) {
      status('Pehle product capture karo.', 'err');
      return;
    }
    try {
      status('Share link + photo pack ban raha hai...');
      cacheImages(p.images);
      const settings = await MP.getSettings();
      const profile = MP.buildProfile(p, settings);
      const code = await MP.encodeShare(p, settings, { profile });
      const link = MP.shareLink(code);
      const ok = await MP.copyText(link);
      status(
        ok
          ? 'Share link copy ho gaya \u2713 Isme ' + p.images.length + ' photo bhi hain. Naye listing page par paste/import karo - form + photos auto-fill honge.'
          : 'Copy fail. Extension icon se try karo.',
        ok ? 'ok' : 'err'
      );
    } catch (e) {
      status('Share link error: ' + e.message, 'err');
    }
  }

  function mountPanel() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'mp-pro-pdp-host';
    host.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;z-index:2147483647';
    (document.body || document.documentElement).appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<style>' +
      PANEL_CSS +
      '</style>' +
      '<button id="fab" title="Meesho Product Pro"><span>\uD83D\uDECD\uFE0F</span><span class="n"></span></button>' +
      '<div id="panel" style="display:none">' +
      '<div class="head"><div class="hb"><div class="logo">M</div><div><div class="ttl">Meesho Product Pro</div><div class="sub">Auto capture \u00b7 seller fill \u00b7 photo pack</div></div></div><button id="close" title="Close">\u00d7</button></div>' +
      '<div class="body">' +
      '<div id="status" class="status">Scanning...</div>' +
      '<div id="preview" class="preview">' +
      '<img id="thumb" alt="">' +
      '<div><div id="ptitle" class="pt"></div><div id="pprice" class="pp"></div><div id="pmeta" class="pm"></div></div>' +
      '</div>' +
      '<div class="row"><button id="copyAll" class="pri">Copy all details</button><button id="copyJson">JSON</button></div>' +
      '<div class="row"><button id="copyTitle">Copy title</button><button id="copyDesc">Copy description</button></div>' +
      '<div class="row"><button id="dlImages">Download images</button><button id="fillSeller" class="dark">Fill seller form</button></div>' +
      '<div class="row"><button id="shareLink" class="pri">Copy share link (details + photos)</button></div>' +
      '<div class="hint">Extension icon dabao: full details, image select / main photo, profit calculator, library aur seller autofill options ke liye.</div>' +
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

    shadow.getElementById('copyAll').onclick = async () => {
      const p = lastProduct || (await extractAndStore(true));
      if (!p) return status('Details nahi mile.', 'err');
      const ok = await MP.copyText(MP.formatProductText(p));
      status(ok ? 'Saari details copy ho gayi \u2713' : 'Copy fail. Extension icon se try karo.', ok ? 'ok' : 'err');
    };

    shadow.getElementById('copyJson').onclick = async () => {
      const p = lastProduct || (await extractAndStore(true));
      if (!p) return status('Details nahi mile.', 'err');
      const ok = await MP.copyText(JSON.stringify(p, null, 2));
      status(ok ? 'JSON copy ho gaya \u2713' : 'Copy fail.', ok ? 'ok' : 'err');
    };

    shadow.getElementById('copyTitle').onclick = async () => {
      const p = lastProduct || (await extractAndStore(true));
      if (!p || !p.title) return status('Title nahi mila.', 'err');
      const ok = await MP.copyText(p.title);
      status(ok ? 'Title copy ho gaya \u2713' : 'Copy fail.', ok ? 'ok' : 'err');
    };

    shadow.getElementById('copyDesc').onclick = async () => {
      const p = lastProduct || (await extractAndStore(true));
      if (!p) return status('Details nahi mile.', 'err');
      const text = p.description || (p.highlights || []).join('\n');
      if (!text) return status('Description nahi mili.', 'err');
      const ok = await MP.copyText(text);
      status(ok ? 'Description copy ho gayi \u2713' : 'Copy fail.', ok ? 'ok' : 'err');
    };

    shadow.getElementById('dlImages').onclick = downloadAll;
    shadow.getElementById('fillSeller').onclick = fillSeller;
    shadow.getElementById('shareLink').onclick = shareLink;
  }

  /* ---------------- boot ---------------- */
  function boot() {
    if (!document.body) {
      setTimeout(boot, 500);
      return;
    }
    mountPanel();
    const productPage = isProductPage();
    host.style.display = productPage ? '' : 'none';
    if (!productPage) return;

    setTimeout(() => extractAndStore(), 1200);
    setTimeout(() => extractAndStore(true), 4500);
    setTimeout(() => extractAndStore(true), 9000);
  }

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    lastProduct = null;
    if (host) host.style.display = isProductPage() ? '' : 'none';
    if (isProductPage()) {
      renderPanel();
      setTimeout(() => extractAndStore(true), 1200);
      setTimeout(() => extractAndStore(true), 4000);
    }
  }, 1200);

  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'mp-extract') {
        extractAndStore(true).then((p) => sendResponse({ ok: !!p, product: p || lastProduct }));
        return true;
      }
      if (msg && msg.type === 'mp-ping') {
        sendResponse({ ok: true, product: lastProduct });
        return false;
      }
      return false;
    });
  } catch (e) {
    /* extension context invalidated */
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
