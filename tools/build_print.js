/* Assemble le dossier d'impression :
   - impression/pdf/cartes_recto.pdf, cartes_verso.pdf : 1 carte par page, 69 x 94 mm (fond perdu inclus)
   - impression/imprimer-soi-meme/planches_lettre.pdf : 9 cartes par feuille Lettre, traits de coupe
   - impression/accessoires/*.pdf : plateau patient, aide de jeu, dés et jetons
   - impression/regles/livret_regles_A5.pdf
   - impression/liste_des_cartes.csv
   Prérequis : node tools/build_cards.js puis python tools/prep_print.py */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer-core');
const HS = require('../web/js/data.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'impression');
const WORK = path.join(OUT, '_work');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const PREFIX = { aigu: '1-patho-aigue', chronique: '2-patho-chronique', soin: '3-soin-immediat', maint: '4-medication', invasif: '5-soin-critique', action: '6-action', gene: '7-profil-genetique', bonne: '8-bonne-habitude', mauvaise: '9-mauvaise-habitude' };
const BACK = { aigu: 'patho', chronique: 'patho', gene: 'gene' };
const backOf = (c) => BACK[c.type] || 'pioche';
const fileOf = (c) => `${PREFIX[c.type]}_${c.id}`;
const u = (p) => pathToFileURL(p).href;

(async () => {
  ['pdf', 'imprimer-soi-meme', 'accessoires', 'regles'].forEach((d) => fs.mkdirSync(path.join(OUT, d), { recursive: true }));
  const cards = Object.values(HS.CARDS).sort((a, b) => fileOf(a).localeCompare(fileOf(b)));

  // --- liste des cartes ---
  const rows = [['fichier_recto', 'fichier_verso', 'nom', 'type', 'quantite']];
  let total = 0;
  cards.forEach((c) => { const q = c.qty || 1; total += q; rows.push([`cartes/recto/${fileOf(c)}.png`, `cartes/verso/dos_${backOf(c)}.png`, c.name, HS.TYPE_INFO[c.type].label, q]); });
  rows.push(['', '', 'TOTAL', '', total]);
  fs.writeFileSync(path.join(OUT, 'liste_des_cartes.csv'), '\ufeff' + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n'));

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  const pdf = async (html, file, opt) => {
    const tmp = path.join(WORK, '_tmp.html');
    fs.writeFileSync(tmp, html);
    await page.goto(u(tmp), { waitUntil: 'load', timeout: 0 });
    await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))));
    await page.pdf(Object.assign({ path: file, printBackground: true, preferCSSPageSize: true, timeout: 0 }, opt || {}));
    console.log('PDF', path.relative(ROOT, file));
  };
  const pdfFile = async (src, file) => {
    await page.goto(u(src), { waitUntil: 'load' });
    await page.pdf({ path: file, printBackground: true, preferCSSPageSize: true });
    console.log('PDF', path.relative(ROOT, file));
  };

  // --- cartes unitaires (fond perdu inclus) ---
  const unit = (imgs) => `<!doctype html><meta charset="utf-8"><style>@page{size:69mm 94mm;margin:0}html,body{margin:0}img{display:block;width:69mm;height:94mm;page-break-after:always}</style>${imgs.map((f) => `<img src="${u(f)}">`).join('')}`;
  await pdf(unit(cards.map((c) => path.join(WORK, 'jpg600', fileOf(c) + '.jpg'))), path.join(OUT, 'pdf', 'cartes_recto.pdf'));
  await pdf(unit(['patho', 'pioche', 'gene'].map((b) => path.join(WORK, 'jpg600', `dos_${b}.jpg`))), path.join(OUT, 'pdf', 'cartes_verso.pdf'));

  // --- planches à imprimer soi-même (Lettre, 3 x 3, format fini 63 x 88 mm) ---
  const groups = { patho: [], pioche: [], gene: [] };
  cards.forEach((c) => { for (let k = 0; k < (c.qty || 1); k++) groups[backOf(c)].push(c); });
  const LBL = { patho: 'Pathologies (dos rouge)', pioche: 'Pioche clinique (dos vert)', gene: 'Profils génétiques (dos violet)' };
  const marks = () => {
    let s = '';
    for (let i = 0; i <= 3; i++) {
      s += `<i style="left:${i * 63}mm;top:-6mm;width:0;height:4mm;border-left:.2mm solid #000"></i><i style="left:${i * 63}mm;bottom:-6mm;width:0;height:4mm;border-left:.2mm solid #000"></i>`;
      s += `<i style="top:${i * 88}mm;left:-6mm;height:0;width:4mm;border-top:.2mm solid #000"></i><i style="top:${i * 88}mm;right:-6mm;height:0;width:4mm;border-top:.2mm solid #000"></i>`;
    }
    return s;
  };
  let sheets = '', n = 0;
  for (const g of ['patho', 'pioche', 'gene']) {
    const list = groups[g];
    const first = n + 1;
    for (let i = 0; i < list.length; i += 9) {
      n++;
      sheets += `<section><header>HOMEOSTASIS v${HS.VERSION} — planche ${n} — ${LBL[g]}</header><div class="grid">${marks()}${list.slice(i, i + 9).map((c) => `<img src="${u(path.join(WORK, 'jpg300', fileOf(c) + '.jpg'))}">`).join('')}</div></section>`;
    }
    sheets += `<section><header>VERSO des planches ${first} à ${n} — ${LBL[g]} — imprimer au dos (retournement sur le bord long)</header><div class="grid">${marks()}${Array(9).fill(`<img src="${u(path.join(WORK, 'jpg300', `dos_${g}.jpg`))}">`).join('')}</div></section>`;
  }
  await pdf(`<!doctype html><meta charset="utf-8"><style>@page{size:215.9mm 279.4mm;margin:0}html,body{margin:0;font-family:Segoe UI,Arial,sans-serif}
    section{position:relative;width:215.9mm;height:279.4mm;page-break-after:always;overflow:hidden}
    header{position:absolute;top:2.5mm;left:0;right:0;text-align:center;font-size:7pt;color:#444}
    .grid{position:absolute;left:13.45mm;top:9mm;width:189mm;height:264mm;display:grid;grid-template-columns:repeat(3,63mm);grid-auto-rows:88mm}
    .grid img{width:63mm;height:88mm;display:block}.grid i{position:absolute;display:block}</style>${sheets}`, path.join(OUT, 'imprimer-soi-meme', 'planches_lettre.pdf'));

  // --- accessoires et règles ---
  await pdfFile(path.join(__dirname, 'print', 'plateau.html'), path.join(OUT, 'accessoires', 'plateau_patient_A5.pdf'));
  await pdfFile(path.join(__dirname, 'print', 'aide.html'), path.join(OUT, 'accessoires', 'aide_de_jeu_A5.pdf'));
  await pdfFile(path.join(__dirname, 'print', 'accessoires.html'), path.join(OUT, 'accessoires', 'des_et_jetons.pdf'));
  await pdfFile(path.join(ROOT, 'web', 'regles.html'), path.join(OUT, 'regles', 'livret_regles_A5.pdf'));

  // aperçus PNG des accessoires
  for (const [src, w, h, name] of [['plateau.html', 216, 154, 'plateau_patient_A5.png'], ['aide.html', 154, 216, 'aide_de_jeu_A5.png']]) {
    await page.setViewport({ width: Math.round(w * 3.7795), height: Math.round(h * 3.7795), deviceScaleFactor: 300 / 96 });
    await page.goto(u(path.join(__dirname, 'print', src)), { waitUntil: 'load' });
    await page.screenshot({ path: path.join(OUT, 'accessoires', name) });
  }
  await browser.close();
  console.log(`${total} cartes (${cards.length} rectos uniques).`);
})();
