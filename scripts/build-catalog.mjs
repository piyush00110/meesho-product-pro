/* ============================================================
   Meesho Product Pro v6 - catalog builder
   Reads share links/codes from data/shares.txt, decodes them
   (gzip g1. / plain j1. / raw JSON), and writes:
     site/data/catalog.json
     site/  <- public website copied from web/
     site/viewer.html + viewer assets (backward compatible)

   Run:  node scripts/build-catalog.mjs
   No dependencies. Node 18+.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sharesFile = path.join(root, 'data', 'shares.txt');
const extDir = path.join(root, 'extension');
const webDir = path.join(root, 'web');
const siteDir = path.join(root, 'site');
const siteDataDir = path.join(siteDir, 'data');

const log = (...args) => console.log('[catalog]', ...args);

function b64urlToBuffer(text) {
  const s = String(text || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  if (!s) return Buffer.alloc(0);
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

/* Pull a share code out of a URL, a raw code, or a JSON blob. */
function extractCode(line) {
  const t = String(line || '').trim();
  if (!t) return '';
  if (/^[gj]1\./.test(t)) return t;
  if (t.startsWith('{')) return 'RAW:' + t;

  const m = t.match(/[#?&](?:mp|mpdata)=([^&\s]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch (e) {
      return m[1];
    }
  }

  const token = t.split(/\s+/).find((part) => /^[gj]1\.[A-Za-z0-9\-_]+$/.test(part));
  if (token) return token;

  if (/^[A-Za-z0-9\-_]{40,}$/.test(t)) return t;
  return '';
}

function decodeShareCode(code) {
  let json = '';
  if (code.startsWith('RAW:')) {
    json = code.slice(4);
  } else {
    const dot = code.indexOf('.');
    if (dot < 1) throw new Error('Unknown code format');
    const kind = code.slice(0, dot);
    const bytes = b64urlToBuffer(code.slice(dot + 1));
    if (kind === 'g1') {
      json = zlib.gunzipSync(bytes).toString('utf8');
    } else if (kind === 'j1') {
      json = bytes.toString('utf8');
    } else {
      throw new Error('Unknown code prefix: ' + kind);
    }
  }
  if (!json || json.length > 4_000_000) throw new Error('Payload empty or too large');
  return JSON.parse(json);
}

function sanitizeProduct(p) {
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
  out.highlights = (Array.isArray(out.highlights) ? out.highlights : [])
    .slice(0, 20)
    .map((x) => String(x).slice(0, 300));
  out.images = (Array.isArray(out.images) ? out.images : [])
    .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
    .slice(0, 80);
  out.mainImage = /^https?:\/\//i.test(out.mainImage || '') ? out.mainImage : out.images[0] || '';

  if (out.specifications && typeof out.specifications === 'object') {
    const specs = {};
    Object.entries(out.specifications)
      .slice(0, 60)
      .forEach(([k, v]) => {
        const key = String(k || '').slice(0, 80);
        const val = String(v == null ? '' : v).slice(0, 500);
        if (key && val) specs[key] = val;
      });
    out.specifications = specs;
  } else {
    out.specifications = {};
  }
  delete out.extractedAt;
  return out;
}

function normalize(decoded) {
  const data = decoded || {};
  let product;
  let version = 1;
  let createdAt = 0;
  let profile = null;
  let settings = null;
  let meta = null;

  if (data.p && data.p.title) {
    version = Number(data.v) || 1;
    createdAt = Number(data.t) || 0;
    product = data.p;
    profile = data.l && typeof data.l === 'object' ? data.l : null;
    settings = data.s && typeof data.s === 'object' ? data.s : null;
    meta = data.m && typeof data.m === 'object' ? data.m : null;
  } else if (data.title) {
    product = data;
  } else {
    throw new Error('No product in payload');
  }

  const p = sanitizeProduct(product);
  const selling = Number((profile && profile.selling) || p.price) || 0;
  const image = p.mainImage || (p.images || [])[0] || '';

  return {
    version,
    createdAt,
    title: p.title || '',
    selling,
    image,
    product: p,
    profile: profile || null,
    settings: settings || null,
    meta: meta || null
  };
}

function keyOf(item) {
  const p = item.product || {};
  return String(p.productId || p.url || p.title || '').trim().toLowerCase();
}

function discountOf(mrp, price) {
  const m = Number(mrp) || 0;
  const p = Number(price) || 0;
  if (m > p && m > 0) return Math.round((1 - p / m) * 100);
  return 0;
}

function readShares() {
  if (!fs.existsSync(sharesFile)) {
    log('data/shares.txt not found, writing an empty catalog');
    return [];
  }
  const text = fs.readFileSync(sharesFile, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('//'));
}

function build() {
  const lines = readShares();
  const seenCode = new Set();
  const byProduct = new Map();
  const failures = [];

  lines.forEach((line, index) => {
    const code = extractCode(line);
    if (!code || seenCode.has(code)) return;
    seenCode.add(code);
    try {
      const item = normalize(decodeShareCode(code));
      item.code = code.startsWith('RAW:') ? '' : code;
      const key = keyOf(item) || 'line-' + (index + 1);
      const prev = byProduct.get(key);
      if (!prev || Number(item.createdAt) >= Number(prev.createdAt)) {
        byProduct.set(key, item);
      }
    } catch (e) {
      failures.push({ line: index + 1, reason: e.message });
      log('line ' + (index + 1) + ' skipped: ' + e.message);
    }
  });

  const products = Array.from(byProduct.values())
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
    .map((item) => {
      const p = item.product || {};
      const specs = p.specifications || {};
      const profile = item.profile || {};
      return {
        code: item.code,
        createdAt: item.createdAt,
        version: item.version,
        title: item.title,
        selling: item.selling,
        mrp: Math.max(0, Number(p.mrp) || Number(profile.mrp) || 0),
        discount: discountOf(p.mrp || profile.mrp, item.selling),
        brand: String(p.brand || profile.brand || '').slice(0, 120),
        category: String(p.category || '').slice(0, 120),
        subcategory: String(p.subcategory || '').slice(0, 120),
        rating: String(p.rating || '').slice(0, 20),
        ratingCount: String(p.ratingCount || '').slice(0, 20),
        colors: Array.isArray(p.colors) ? p.colors.slice(0, 20) : [],
        sizes: Array.isArray(p.sizes) ? p.sizes.slice(0, 20) : [],
        imageCount: (p.images || []).length,
        hasSpecs: Object.keys(specs).length,
        image: item.image,
        product: p,
        profile: item.profile,
        settings: item.settings,
        meta: item.meta
      };
    });

  fs.mkdirSync(siteDataDir, { recursive: true });

  /* keep generatedAt stable when nothing changed, so the 6-hour
     workflow does not create an empty commit every single run */
  const catalogPath = path.join(siteDataDir, 'catalog.json');
  let generatedAt = new Date().toISOString();
  try {
    const prev = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    if (prev && prev.generatedAt && JSON.stringify(prev.products) === JSON.stringify(products)) {
      generatedAt = prev.generatedAt;
    }
  } catch (e) {
    /* first run or unreadable file -> fresh timestamp */
  }

  const catalog = {
    generatedAt,
    app: 'meesho-product-pro',
    viewer: 5,
    count: products.length,
    products
  };
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');

  /* Copy the full public website (web/) into site/.
     index.html is the real catalog web app, not the old viewer. */
  const webCopies = [
    'index.html',
    'app.css',
    'app.js',
    'icon.svg',
    'manifest.webmanifest',
    'sw.js',
    'robots.txt'
  ];
  webCopies.forEach((name) => {
    const src = path.join(webDir, name);
    if (!fs.existsSync(src)) throw new Error('Missing website asset: ' + src);
    fs.copyFileSync(src, path.join(siteDir, name));
  });

  /* Keep the standalone share viewer at /viewer.html for old links
     and for the extension's internal "Open viewer" button. */
  const viewerCopies = ['viewer.html', 'viewer.css', 'viewer.js'];
  viewerCopies.forEach((name) => {
    const src = path.join(extDir, name);
    if (!fs.existsSync(src)) throw new Error('Missing viewer asset: ' + src);
    fs.copyFileSync(src, path.join(siteDir, name));
  });

  fs.writeFileSync(path.join(siteDir, '.nojekyll'), '');
  fs.writeFileSync(
    path.join(siteDir, 'README.txt'),
    [
      'Meesho Product Pro - public site + share catalog (auto generated)',
      '',
      'This folder is rebuilt automatically by .github/workflows/build-catalog.yml',
      'every 6 hours. Do not edit site/ by hand.',
      '',
      'Source of truth: data/shares.txt',
      'Website source: web/',
      'Share viewer: /viewer.html',
      'Generated: ' + catalog.generatedAt,
      'Products: ' + products.length
    ].join('\n') + '\n'
  );

  log('products: ' + products.length + ' | skipped: ' + failures.length + ' | site/: web app + viewer ready');
  return { catalog, failures };
}

try {
  const result = build();
  if (result.failures.length) {
    log('some lines were skipped - fix them in data/shares.txt');
  }
} catch (e) {
  console.error('[catalog] build failed:', e.message);
  process.exit(1);
}
