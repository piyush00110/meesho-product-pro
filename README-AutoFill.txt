MEESHO + FLIPKART AUTO-FILL - INSTALL STEPS (Hindi)
================================================

>>> NAYA VERSION: ab full Chrome extension hai (product details + images + share link + auto-fill).
>>> Install: chrome://extensions > Developer mode ON > Load unpacked > select "extension" folder.
>>> Guide: extension\README.md   |   Quick start: START-HERE-MEESHO-PRO.txt
>>> Neeche wale purane Tampermonkey steps sirf backup ke liye hain.

Tumhare meesho folder me ye files hain:
1. flipkart-meesho-listing-tool.html  -> PDF se listing banao + Export JSON
2. meesho-flipkart-autofiller.user.js -> Tampermonkey script, website par auto-fill karega
3. autofill-profile-sample.json       -> sample profile

WEBSITE PAR AUTO-FILL KE 2 TARIKE:

TARIKA A - Tampermonkey (Recommended, free, 2 min):
1. Chrome me "Tampermonkey" extension install karo (Chrome Web Store).
2. Tampermonkey icon > Create new script > meesho-flipkart-autofiller.user.js file ko Notepad me kholo, sara code copy karke waha paste karo > Ctrl+S Save.
3. Ab supplier.meesho.com par jao, login karo, Add Product kholo.
   Neeche right corner me "Meesho/Flipkart Auto-Fill" box dikhega.
4. Pehle flipkart-meesho-listing-tool.html kholo > Generate > Export JSON > copy karo.
5. Wapas Meesho tab me box me JSON paste karo > "Meesho Fill" dabao. Ho gaya!
   Same seller.flipkart.com par "Flipkart Fill" dabao.

TARIKA B - Bina extension (Console paste):
1. Meesho Add Product page kholo, F12 dabao > Console tab.
2. meesho-flipkart-autofiller.user.js ka andar wala fillSite wala code chahiye ho to bolo, main chhota bookmarklet bana dunga.
3. Note: Meesho/Flipkart React form hai, isliye 100% fields auto-fill guarantee nahi - jo miss ho, Copy button se paste kar lo.

TIPS:
- Title Meesho 60 char se zyada mat rakho, warna error ayega.
- HSN: Georgette Saree 5407, Cotton 5208, Silk 5007.
- GST: 2500 tak 5%, uske upar 18%.
- Koi bhi PDF ho to tool me upload karke JSON banao, phir wahi JSON dono site par chalega.
