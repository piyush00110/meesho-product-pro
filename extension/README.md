# Meesho Product Pro v6 — Copy, AutoFill, Share Viewer & Seller Tools

Chrome extension jo **Meesho product page** se title, price, MRP, rating, description,
specifications, colours, sizes, images aur seller details automatic nikaal leta hai.
Phir wahi data **supplier.meesho.com Add Product** form me 1-click auto-fill + photo upload
kar deta hai.

v6 me **poora data ek share link me** jata hai (product + specs + saari images + settings +
listing profile). GitHub Pages par ab **poora public website** hai (search, filters,
favourites, compare, product detail) aur ek **standalone share viewer** `/viewer.html` par.
GitHub workflow site + catalog ko **har 6 ghante automatic rebuild** karta hai — koi manual
build nahi.

> Sab kuch aapke browser me chalta hai. Koi server nahi, koi login nahi.
> Share data URL ke andar encoded hota hai (gzip + base64url).

---

## 1. Install (2 minute)

1. Chrome me `chrome://extensions` kholo.
2. Top-right **Developer mode** ON karo.
3. **Load unpacked** dabao.
4. Is folder ko select karo: `Desktop\meesho\extension`
5. Pehle se khule Meesho / supplier tabs ko **refresh** karo (zaroori hai).

Update ke baad `chrome://extensions` me extension ka **Reload** button dabao aur
Meesho / seller page refresh karo.

**Shortcut:** `Ctrl+Shift+M` (Mac: `Cmd+Shift+M`) se popup turant khulta hai.

---

## 2. Naya UI v6 - 7 tabs

Popup ka poora design naya hai: ink app bar, live stats strip (Photos / Library / Cached /
Quality), 7-tab rail, bento cards aur gradient actions.

| Tab | Kya milta hai |
|---|---|
| **Product** | Product card, quick copy chips (Title/Price/Description/Specs), Copy all, JSON, Share, saari detail rows |
| **Images** | Select / deselect, main image star, Download, Copy image, Copy links, Attach to seller |
| **Fill** | Listing preview + quality score, fill buttons, share import shortcut |
| **Share** | Full data share link, viewer link, human-readable listing text, import, legacy JSON |
| **Tools** | Profit calculator, title optimizer, keyword chips, photo pack cache |
| **Library** | Last 25 captured products — load, delete, clear |
| **Settings** | Brand, HSN, GST, pricing, shipping, public viewer URL, behaviour, backup / import |

Popup me **light / dark / system theme** toggle hai (header ke icon se).
Saare actions ke liye bottom me toast notification aata hai.

---

## 3. Product details capture karo (Meesho page)

1. Koi bhi Meesho product page kholo (`.../p/...`).
2. Page ke bottom-right me pink **shopping bag** button aa jayega.
   Details 1-2 second me automatic capture ho jati hain.
3. Extension icon dabao (ya `Ctrl+Shift+M`). Product tab me sab kuch ready milega.
4. Har row par **Copy** button hai. Quick chips se seedha title, price,
   description ya specs copy karo.

Page ke pink panel se bhi direct **Copy all details**, **Copy title**,
**Copy description**, **Copy JSON**, **Copy share link (details + photos)**,
**Download images** aur **Fill seller form** kar sakte ho.

### Product Library
Har capture automatic **Library** tab me save hota hai (max 25 products).
Wahan se kisi bhi product ko **Load** karke dobara listing bana sakte ho —
images, price, specs sab wapas aa jate hain.

---

## 4. Images

- Image tile par click = select / deselect.
- **Star** dabao = wahi image main image ban jati hai (first position).
- **Download** selected images ko `Downloads/Meesho-<product-id>/` me save karta hai.
- **Copy image** image ko clipboard me PNG bana ke daalta hai (Word/WhatsApp me paste).
- **Copy links** selected images ke direct URLs copy karta hai.
- **Attach** supplier page khula ho to photos seedha upload box me daal deta hai.

### Photo pack cache
Product capture hote hi photos background me download + compress karke cache ho jati hain.
Fayda: share link import ke baad photos turant upload hoti hain, aur CDN URL expire hone par
bhi upload chalta hai. Cache browser session me rehta hai; **Tools → Photo pack cache** se
warm ya clear kar sakte ho. Stats strip me **Cached** count dikhta hai.

---

## 5. Seller form auto-fill

### Sabse aasan tarika
1. Meesho product page par pink panel kholo.
2. **Fill seller form** dabao. Supplier tab khul jayega.
3. Supplier panel me **Add Product** kholo aur category select karo.
4. Form ke fields aate hi extension khud fill karta hai, aur photo upload box milte hi
   images bhi attach kar deta hai.
5. Multi-step form me next step kholo — naye fields 90 second tak auto-fill hote rahenge.

### Fill tab se
- **Fill seller page** — fields fill karo
- **Fill + upload photos** — fields + photo upload
- **Copy listing JSON** — poora listing profile copy
- **Open supplier Add Product** — seller tab kholo

### Seller page se
Supplier page par bottom-right violet **Fill product** button hai:
- **Fill this page** — jo fields dikh rahe hain unko bharo
- **Fill + images** — fields + photo upload
- **Attach images** — sirf photos
- **Copy details / Copy title / Copy JSON**
- Neeche **Share link / share code** paste karke **Import** — naya data import + auto-fill

### Auto-fill kya karta hai
Product name, description, brand, category/sub-category, fabric, pattern, occasion,
colour, size, pack of, MRP, selling price, stock, HSN, GST, weight, L/B/H,
country of origin, manufacturer name/address, care instructions, keywords, SKU.
Jo field form me nahi milti, wo **Missed** list me dikhti hai (usko manually bharo).
Meesho ke custom dropdown / size chips bhi click karke select kiye jate hain.

> Meesho aur Flipkart ke forms React par bane hain aur time-time par badalte hain.
> Isliye 100% guarantee nahi, lekin jo match hota hai wo turant bhar jata hai.

---

## 6. Quality score

Fill tab ke listing preview me ek **quality score** dikhta hai. Ye check karta hai:
title length, price, description length, images, variants (colour/size), HSN + GST,
shipping weight aur SKU. Score kam ho to Tools tab se title/price/description sudhaar lo.
Wahi score popup ke stats strip me bhi dikhta hai.

---

## 7. Tools tab

### Profit calculator
Cost price, selling price, commission %, shipping, target margin % daalo.
Extension batata hai:
- **Recommended price** — target margin ke liye best selling price (₹9 par round)
- **Break-even price**
- **Profit & margin** current selling price par
- **Platform fees** aur **GST (price included)**

**Use recommended price** dabao to wahi price listing ke liye set ho jata hai
(Settings me fixed price override ban jata hai; 0 karke auto par wapas aa sakte ho).

### Title optimizer
- `60/60` char meter — Meesho limit ke hisaab se colour badalta hai
- **Trim** — limit ke andar word-boundary par cut
- **Clean** — "buy online", "free delivery" jaise words hatata hai
- **Title case** — har word capital
- **Use for listing** — custom title save; **Reset** se auto title wapas
- Custom title sirf current product ki listing me use hota hai; naya product capture
  karne par auto title wapas aa jata hai

### Keywords
Colours, title words, category aur fabric se auto keywords bante hain.
Chip par click = wahi keyword copy. **Copy all** = comma separated list.

### Photo pack
- **Warm cache** — saari photos background me cache
- **Clear cache** — cache khali
- **Copy image URLs** — selected images ke links

---

## 8. Share tab - poora data ek link me (v6)

Ek share link me **saara collected data** hota hai:

| Kya | Detail |
|---|---|
| Product | title, price, MRP, rating, brand, category, seller, product ID, source URL |
| Specs | saari specifications + colours + sizes + highlights |
| Images | **saari image links** (sirf selected nahi) |
| Description | poora description |
| Listing | ready listing profile — title, price, HSN, GST, weight, dimensions, SKU, keywords |
| Settings | brand, manufacturer, address, country, GST mode, stock, title limit, image limit |

Payload format: `v:2` → `{ v, app, t, p, s, l, m }`, gzip + base64url (`g1.` prefix).
Purane v1 share links aur `j1.` plain codes bhi import hote hain.

### Share tab ke buttons
- **Copy** (share link) — `https://supplier.meesho.com/#mp=...`
- **Copy code** — sirf `g1....` code
- **Viewer link** — public viewer URL + code (Settings me viewer URL set ho to)
- **Open viewer** — extension ka internal full-data viewer
- **Download JSON** — poora data + settings JSON file me
- **Copy all** (listing text) — human-readable full listing (copy-paste ready)

### Import
Share tab me link/code paste karo:
- **Import & auto-fill** — data import + seller form fill + photos
- **Import only** — sirf data load
- Purana PRO JSON bhi `Purana PRO JSON import karo` section se import hota hai.

Link direct kholne par bhi kaam karta hai: `https://supplier.meesho.com/#mp=...`
Supplier page load hote hi extension data import karke form ka wait karta hai.

---

## 9. Public website + share viewer

GitHub Pages ka root (`site/index.html`) = **poora public catalog website**: search,
category filters, favourites, compare, product detail, share. Standalone viewer
`/viewer.html` par hai — jo **extension ke andar** aur **GitHub Pages par** same tarah
chalta hai. Isme product, price, listing text, description, specs, highlights, saari
images, settings, keywords aur raw JSON — sab dikhta hai.

- **Popup → Share → Open viewer** = extension ka internal viewer.
- **Popup → Share → Viewer link** = public GitHub Pages viewer link.
- Viewer me upar box me koi bhi share link/code paste karke khol sakte ho.
- Public website `data/catalog.json` padh kar shared products ki searchable list dikhati hai.

### Public viewer URL set karo
`Settings → Share viewer → Public viewer URL` me apna Pages URL daalo, jaise:

```
https://username.github.io/meesho/
```

Save karo. Ab **Viewer link** button usi domain ka link banayega.

---

## 10. GitHub Pages auto-build — har 6 ghante, no manual build

Repo me ye pipeline ready hai:

```
data/shares.txt                        <- yahan share links paste karo
scripts/build-catalog.mjs              <- decoder + catalog builder
.github/workflows/build-catalog.yml    <- auto build + auto commit + auto deploy
site/                                  <- generated output (auto, hand-edit na karo)
```

### Workflow kya karta hai
1. **Har 6 ghante** cron se chalta hai (`0 */6 * * *` — 00:00, 06:00, 12:00, 18:00 UTC).
2. Push par bhi turant chalta hai, isliye naya link add karte hi update aa jata hai.
3. `data/shares.txt` ki har line decode karta hai (`g1.`, `j1.`, URL, ya raw JSON).
4. `site/data/catalog.json` + poora website (`web/`) + viewer files regenerate karta hai.
5. Regenerated `site/` ko **automatic commit + push** karta hai (`[skip ci]`);
   data same ho to commit skip ho jata hai (empty commit nahi banta).
6. `site/` ko **GitHub Pages** par deploy karta hai.

**Koi manual build nahi. Koi manual deploy nahi.** Aapko sirf share link add karna hai.

### One-time setup (sirf ek baar)
1. Is folder ko GitHub repo me push karo (`main` ya `master` branch).
2. Repo → **Settings → Pages → Source: GitHub Actions**.
   (Workflow khud bhi Pages enable karne ki koshish karta hai; org policy rok de to ye step manual karo.)
3. Repo → **Actions** tab me "Build & deploy catalog (every 6 hours)" workflow enabled rakho.
4. `data/shares.txt` me apne share links add karo (ek line = ek link).
5. Commit + push. Pehla build turant chalega, uske baad har 6 ghante automatic.

Public URL banega: `https://<username>.github.io/<repo>/`
Wahi URL extension ke Settings → Share viewer me daal do.

### data/shares.txt format
```
# comments aur blank lines ignore hote hain
https://supplier.meesho.com/#mp=g1.XXXX
g1.XXXX
j1.XXXX
{"title":"Legacy Product","price":299}
```

Same product ke multiple shares ho to latest wala rakha jata hai.

### Local test (optional)
```bash
node scripts/build-catalog.mjs
```

Node 18+ chahiye. Koi npm dependency nahi hai.

---

## 11. Settings tips

- **Title limit** default 60 (Meesho ke liye safe). 100 chahiye to badal do.
- **Price change %**: 0 = same price. 10 = 10% badha ke list karo.
- **Fixed price override**: 0 = auto. Yahan price daalo to current product ki listing me wahi price.
  Naya product capture karne par override khud clear ho jata hai (galat product par apply nahi hota).
- **GST**: Auto = price 2500 tak 5%, uske upar 18%. Ya fixed 5/12/18 chuno.
- **Default HSN**: auto mapping na mile to ye use hoga. Saree 5407, cotton saree 5208,
  silk 5007, kurti/dress 6204, t-shirt 6109, blouse 6206, kids 6111.
- **Weight/dimensions**: 0 rakho to category se auto estimate hota hai
  (saree 400g 28x22x4, kurti 300g 26x20x3, etc.).
- **Max images**: Meesho usually 5-8 images leta hai. Default 8.
- **Public viewer URL**: GitHub Pages URL — Viewer link isi par banta hai.
- **Auto-upload** aur **Next steps auto-fill** ko ON rakho.

### Backup / data
- **Copy settings JSON** — brand, HSN, GST, profit inputs aur theme ka backup
- Settings neeche JSON paste karke **Import settings** — doosre browser me restore
- **Clear library** / **Clear photo cache** — do baar click karke confirm
- **Clear library** library se products hatata hai, settings nahi

---

## 12. Troubleshooting

| Problem | Solution |
|---|---|
| Product capture nahi hua | Page refresh karo, phir extension icon > Capture page. |
| Extension icon par "No product" | Sirf product page (`/p/`) par kaam karta hai, category/home page par nahi. |
| Seller form fill nahi hua | Add Product form kholo (category select karke), phir panel se **Fill this page**. |
| Images attach nahi hui | Supplier form ka **Images** step kholo. Photos 5 minute tak khud attach hoti rahengi. |
| Kuch fields missed | Form ke labels badle honge. Manually bharo; **Copy** buttons se detail paste kar sakte ho. |
| Library khali dikh rahi hai | Product page par ek baar capture hone do; history automatic save hoti hai. |
| Share link kaam nahi kiya | Dono browser me extension installed + supplier login hona chahiye. Link dobara copy karo. |
| Viewer link nahi bana | Settings → Share viewer me public viewer URL daalo. |
| Pages par catalog khali hai | `data/shares.txt` me link add karo, phir push. Workflow auto-build karega. |
| Pages 404 | Settings → Pages → Source = GitHub Actions. Workflow ka pehla run hone do. |
| Purana PRO JSON use karna hai | Share tab > "Purana PRO JSON import karo" > JSON paste > Use this JSON. |

---

## 13. Files

```
extension/
  manifest.json        Chrome manifest (MV3, v6.0.0)
  common.js            shared helpers, profile builder, share v2 encode/decode, listing text
  content-pdp.js       Meesho product page scraper + floating panel
  content-seller.js    supplier/flipkart form auto-fill + image upload + panel
  background.js        image fetch/compress + photo pack cache, downloads, tab opening, badge
  popup.html/css/js    v6 popup UI (7 tabs, stats strip, share tab, dark mode)
  viewer.html/css/js   standalone share viewer (/viewer.html on GitHub Pages)
  icons/               16/48/128 icons
  content.js           purana v2 script (ab use nahi hota, safe to ignore)

data/shares.txt                     share links for the public catalog
scripts/build-catalog.mjs           decoder + site/ generator (no dependencies)
.github/workflows/build-catalog.yml auto build every 6 hours + Pages deploy
package.json                        build / check scripts
site/                               auto-generated website + viewer (do not edit by hand)
```

Purane `meesho-flipkart-autofiller*.user.js` Tampermonkey scripts bhi folder me hain,
lekin ab is extension ki zaroorat nahi.
