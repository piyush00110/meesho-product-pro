# Meesho Product Pro v6

Chrome extension + public catalog website for capturing Meesho products, auto-listing
seller forms (fields + photos), and sharing products as links.

**Live site:** https://piyush00110.github.io/meesho-product-pro/

## What it does

- **One-click capture** — title, price, MRP, rating, description, specs, colours,
  sizes and all product photos from a Meesho product page.
- **Auto-list seller form** — fills `supplier.meesho.com` / `seller.flipkart.com`
  Add Product fields, uploads photos, and keeps filling new steps.
- **Share link** — one link carries product, specs, description, all images,
  listing profile and settings (gzip + base64url, no server).
- **Public catalog website** — search, category filters, favourites, compare,
  product detail and share.
- **Standalone viewer** — `/viewer.html` opens any share link or code.
- **Seller tools** — profit calculator, title optimizer, keywords, photo pack cache,
  product library, light/dark theme.

## Install the extension

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Refresh any open Meesho / supplier tabs

Shortcut: `Ctrl+Shift+M` (Mac: `Cmd+Shift+M`).

## Public website

The GitHub Pages root is the full catalog app. The standalone viewer is at
`/viewer.html`.

Add share links to `data/shares.txt` (one per line), then commit and push.

## Automatic build — every 6 hours

`.github/workflows/build-catalog.yml`:

- runs every 6 hours (`0 */6 * * *`) and on every push to `main`/`master`
- checks the JavaScript syntax
- rebuilds `site/` from `web/` and the share catalog from `data/shares.txt`
- auto-commits the regenerated `site/` (skips when nothing changed)
- deploys `site/` to GitHub Pages

No manual build or deploy is required. `site/` is generated — do not edit it by hand.

## Local commands

```bash
npm run check   # syntax-check extension + build scripts
npm run build   # rebuild site/ + site/data/catalog.json
```

No dependencies to install. Node 18+ required.

## Project layout

```
extension/                 Chrome extension (MV3, v6.0.0)
web/                       Public catalog website source
site/                      Auto-generated website + viewer (do not edit)
data/shares.txt            Share links for the public catalog
scripts/build-catalog.mjs  Catalog + site builder (no dependencies)
.github/workflows/         6-hour build + GitHub Pages deploy
START-HERE-MEESHO-PRO.txt  Quick start (Hindi)
extension/README.md        Full extension guide (Hindi)
```

## Notes

- Everything runs in the browser. There is no server, login or tracking.
- Meesho/Flipkart forms are React apps, so only matching fields are filled;
  the popup lists anything that needs a manual paste.
- This is an independent tool and is not affiliated with Meesho.
