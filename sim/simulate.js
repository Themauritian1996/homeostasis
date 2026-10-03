/* Simulateur Monte-Carlo HOMEOSTASIS.
   Usage : node sim/simulate.js [parties=2000] [--json] [clé=valeur de config ...] */
const HS = require('../web/js/bot.js');

function play(opt) {
  const st = HS.newGame(Object.assign({ noLog: true }, opt));
  let guard = 3000;
  while (!st.over && guard-- > 0) HS.botTurn(st);
  if (!st.over) st.over = { result: 'bloque' };
  return st;
}

function mkPlayers(n, extra) {
  return Array.from({ length: n }, (_, i) => Object.assign({ name: 'J' + (i + 1), bot: true }, extra && extra[i]));
}

function coop(n, games, opt) {
  const r = { n, games, win: 0, turns: 0, stuck: 0, deathTurn: [], hpEnd: 0, necro: {}, gene: {}, habit: {}, played: 0, heal: 0, dmg: 0 };
  for (let g = 0; g < games; g++) {
    const st = play(Object.assign({ mode: 'coop', players: mkPlayers(n, opt && opt.extra), seed: 1000 + g * 7919 }, opt));
    const w = st.over.result === 'victoire';
    if (st.over.result === 'bloque') r.stuck++;
    if (w) { r.win++; r.hpEnd += st.players.reduce((a, p) => a + HS.totalHP(p), 0) / n; }
    else r.deathTurn.push(st.turnCount / st.pathoTotal);
    r.turns += st.turnCount;
    st.players.forEach((p) => {
      const sg = st.startInfo ? null : null;
      (r.gene[p.gene] = r.gene[p.gene] || [0, 0])[1]++;
      if (w) r.gene[p.gene][0]++;
      const h = p.startHabit || 'aucune';
      (r.habit[h] = r.habit[h] || [0, 0])[1]++;
      if (w) r.habit[h][0]++;
      for (const s in p.stats.necro) r.necro[s] = (r.necro[s] || 0) + p.stats.necro[s];
      r.played += p.stats.played; r.heal += p.stats.heal; r.dmg += p.stats.dmg;
    });
  }
  return r;
}

function vs(n, games, opt) {
  const r = { n, games, seat: Array(n).fill(0), gene: {}, habit: {}, turns: 0, ko: 0, stuck: 0 };
  for (let g = 0; g < games; g++) {
    const st = play(Object.assign({ mode: 'vs', players: mkPlayers(n), seed: 5000 + g * 104729 }, opt));
    if (st.over.result === 'bloque') { r.stuck++; continue; }
    const ws = st.over.winners || [];
    r.turns += st.turnCount;
    if (st.players.filter((p) => !p.dead).length <= 1) r.ko++;
    if (ws.length > 1) r.tie = (r.tie || 0) + 1;
    st.players.forEach((p) => {
      const share = ws.includes(p.id) ? 1 / ws.length : 0;
      r.seat[p.id] += share;
      (r.gene[p.gene] = r.gene[p.gene] || [0, 0])[1]++;
      r.gene[p.gene][0] += share;
      const h = p.startHabit || 'aucune';
      (r.habit[h] = r.habit[h] || [0, 0])[1]++;
      r.habit[h][0] += share;
    });
  }
  return r;
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : '-');
function table(o, base) {
  return Object.entries(o).sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1])
    .map(([k, [w, n]]) => `    ${k.padEnd(16)} ${pct(w, n).padStart(6)}  (n=${n})`).join('\n');
}

// mémoriser l'habitude de départ
const _new = HS.newGame;
HS.newGame = function (o) { const st = _new(o); st.players.forEach((p) => (p.startHabit = p.habit)); return st; };

if (require.main === module) {
  const args = process.argv.slice(2);
  const games = parseInt(args.find((a) => /^\d+$/.test(a)) || '2000', 10);
  const cfg = {};
  args.filter((a) => a.includes('=')).forEach((a) => {
    const [k, v] = a.split('=');
    const val = isNaN(+v) ? v : +v;
    if (k.startsWith('card.')) { // ex. card.cortico.heal.amount=5
      const path = k.split('.').slice(1);
      let o = HS.CARDS;
      while (path.length > 1) o = o[path.shift()];
      o[path[0]] = val;
    } else if (k.startsWith('ppp')) { cfg.pathoPerPlayer = Object.assign({}, HS.CONFIG.pathoPerPlayer, cfg.pathoPerPlayer, { [k.slice(3)]: val }); }
    else cfg[k] = val;
  });
  const detail = args.includes('--detail');
  const t0 = Date.now();
  console.log(`=== HOMEOSTASIS v${HS.VERSION} — ${games} parties par configuration ===`, Object.keys(cfg).length ? cfg : '');
  for (const diff of args.includes('--alldiff') ? ['interne', 'resident', 'patron'] : ['resident']) {
    for (const n of [1, 2, 3, 4]) {
      const r = coop(n, games, { cfg, difficulty: diff });
      const dt = r.deathTurn.sort((a, b) => a - b);
      console.log(`COOP ${n}J [${diff}] victoire ${pct(r.win, games)} | tours moy. ${(r.turns / games).toFixed(1)} | PVfin ${(r.hpEnd / Math.max(1, r.win)).toFixed(1)} | déf.méd. ${dt.length ? Math.round(dt[dt.length >> 1] * 100) : '-'}% | cj/t ${(r.played / r.turns).toFixed(2)} | dég/t ${(r.dmg / r.turns).toFixed(2)} soin/t ${(r.heal / r.turns).toFixed(2)}${r.stuck ? ' | BLOQUÉES ' + r.stuck : ''}`);
      if (detail && (n === 1 || n === 3)) {
        console.log('  Nécroses par système:', JSON.stringify(r.necro));
        console.log('  Victoire par profil génétique:\n' + table(r.gene));
        console.log('  Victoire par habitude de départ:\n' + table(r.habit));
      }
    }
  }
  for (const n of [2, 3, 4]) {
    const r = vs(n, games, { cfg });
    console.log(`VS ${n}J sièges ${r.seat.map((s) => pct(s, games)).join(' / ')} | tours moy. ${(r.turns / games).toFixed(1)} | fin par KO ${pct(r.ko, games)} | égalités ${pct(r.tie || 0, games)}${r.stuck ? ' | BLOQUÉES ' + r.stuck : ''}`);
    if (detail && n === 3) {
      console.log('  Victoire par profil (attendu ' + pct(1, n) + '):\n' + table(r.gene));
      console.log('  Victoire par habitude de départ:\n' + table(r.habit));
    }
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
module.exports = { coop, vs, play };
