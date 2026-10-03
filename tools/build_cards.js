/* Génère toutes les cartes :
   - impression/cartes/recto/*.png et verso/*.png : 69 x 94 mm à 600 ppp (1630 x 2220 px, fond perdu 3 mm inclus)
   - web/img/cards/*.webp : version écran (rognée au format fini)
   Usage : node tools/build_cards.js [id ...] */
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const HS = require('../web/js/data.js');
const ROOT = path.join(__dirname, '..');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const PREFIX = { aigu: '1-patho-aigue', chronique: '2-patho-chronique', soin: '3-soin-immediat', maint: '4-medication', invasif: '5-soin-critique', action: '6-action', gene: '7-profil-genetique', bonne: '8-bonne-habitude', mauvaise: '9-mauvaise-habitude' };

(async () => {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const preview = process.argv.includes('--preview');
  const dirs = ['impression/cartes/recto', 'impression/cartes/verso', 'web/img/cards'].map((d) => path.join(ROOT, d));
  dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files', '--font-render-hinting=none'] });
  const page = await browser.newPage();
  const url = require('url').pathToFileURL(path.join(__dirname, 'card.html')).href;
  const PRINT = 1630 / 690; // 600 ppp
  await page.setViewport({ width: 690, height: 940, deviceScaleFactor: PRINT });
  await page.goto(url);
  const shot = async (file, type, clip) => {
    const el = await page.$('#card');
    await el.screenshot(Object.assign({ path: file, type }, type === 'webp' ? { quality: 86 } : {}, clip ? { clip } : {}));
  };
  const cards = Object.values(HS.CARDS).filter((c) => !only.length || only.includes(c.id));
  for (const c of cards) {
    await page.evaluate((id) => window.renderFront(id), c.id);
    if (!preview) await shot(path.join(dirs[0], `${PREFIX[c.type]}_${c.id}.png`), 'png');
  }
  // version écran : format fini (sans fond perdu), ~500 px de large
  await page.setViewport({ width: 690, height: 940, deviceScaleFactor: 0.8 });
  for (const c of cards) {
    await page.evaluate((id) => window.renderFront(id), c.id);
    await page.screenshot({ path: path.join(dirs[2], c.id + '.webp'), type: 'webp', quality: 84, clip: { x: 30, y: 30, width: 630, height: 880 } });
  }
  if (!only.length) {
    for (const b of ['patho', 'pioche', 'gene']) {
      await page.evaluate((id) => window.renderBack(id), b);
      await page.screenshot({ path: path.join(dirs[2], 'back-' + b + '.webp'), type: 'webp', quality: 84, clip: { x: 30, y: 30, width: 630, height: 880 } });
    }
    await page.setViewport({ width: 690, height: 940, deviceScaleFactor: PRINT });
    for (const b of ['patho', 'pioche', 'gene']) {
      await page.evaluate((id) => window.renderBack(id), b);
      await shot(path.join(dirs[1], `dos_${b}.png`), 'png');
    }
  }
  await browser.close();
  console.log(`${cards.length} cartes générées.`);
})();
