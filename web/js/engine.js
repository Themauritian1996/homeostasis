/* HOMEOSTASIS v6 — moteur de règles (pur, déterministe, sans DOM).
   Le même fichier tourne dans le navigateur, l'APK et le simulateur Node. */
(function (root) {
  const HS = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.HS;
  const SYS = HS.SYS;
  const C = HS.CARDS;
  const SN = (s) => HS.SYS_INFO[s].name;

  // ---------- utilitaires ----------
  function rnd(st) {
    let t = (st.seed = (st.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(st, a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd(st) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function rollFace(st) {
    return HS.FACES[Math.floor(rnd(st) * 6)];
  }
  function log(st, m, k) {
    if (st.noLog) return;
    st.log.push({ n: st.logSeq++, m, k: k || '' });
    if (st.log.length > 150) st.log.shift();
  }
  const P = (st, pid) => st.players[pid];
  const has = (p, id) => p.gene === id || p.habit === id;
  const chronicOn = (p, id) => p.chronics.some((c) => c.id === id && !c.stab);
  const zeros = (p) => SYS.filter((s) => p.hp[s] <= 0).length;
  const totalHP = (p) => SYS.reduce((a, s) => a + p.hp[s], 0);
  const lostHP = (p) => SYS.reduce((a, s) => a + p.max[s] - p.hp[s], 0);
  const alive = (st) => st.players.filter((p) => !p.dead);

  function handLimit(st, p) {
    let n = st.cfg.handMax;
    if (has(p, 'senior')) n += 3;
    if (has(p, 'stresschro')) n -= 2;
    if (chronicOn(p, 'renale')) n = Math.min(n, 5);
    return n;
  }
  function atpMax(st, p) {
    return st.cfg.atpMax + (has(p, 'activite') ? 1 : 0);
  }
  function gainATP(st, p, n) {
    p.atp = Math.min(atpMax(st, p), p.atp + n);
  }
  function draw(st, p, n) {
    let got = 0;
    for (let i = 0; i < n; i++) {
      if (!st.deck.length) {
        if (!st.discard.length) break;
        st.deck = shuffle(st, st.discard);
        st.discard = [];
      }
      p.hand.push(st.deck.pop());
      got++;
    }
    return got;
  }
  function discardCard(st, p, uid) {
    const i = p.hand.findIndex((c) => c.uid === uid);
    if (i < 0) return null;
    const [c] = p.hand.splice(i, 1);
    st.discard.push(c);
    return c;
  }
  function discardRandom(st, p, n) {
    const out = [];
    for (let i = 0; i < n && p.hand.length; i++) {
      const c = p.hand.splice(Math.floor(rnd(st) * p.hand.length), 1)[0];
      st.discard.push(c);
      out.push(C[c.id].name);
    }
    return out;
  }

  // ---------- PV ----------
  function checkDeath(st, p) {
    if (p.dead || zeros(p) < 2) return;
    p.dead = true;
    p.diedRound = st.round;
    log(st, `☠️ ${p.name} : défaillance multi-viscérale. Le patient décède.`, 'bad');
    if (st.mode === 'coop') {
      st.over = { result: 'defaite', reason: `${p.name} a perdu son patient.` };
    }
    // VS : la manche en cours se termine toujours (voir nextTurn) pour que chacun ait joué autant de tours.
  }
  function damage(st, p, sys, n, opt) {
    opt = opt || {};
    if (n <= 0 || p.dead || p.hp[sys] <= 0) return 0;
    const t = st.turn;
    const floor = !opt.ignoreFloor && t && t.pid === p.id && t.floor[sys] ? 1 : 0;
    const before = p.hp[sys];
    let after = Math.max(floor, before - n);
    if (after === 0 && has(p, 'resilience')) {
      const f = rollFace(st);
      if (f === '2' || f === '3' || f === 'S') {
        after = 1;
        log(st, `💪 Résilience (${HS.FACE_INFO[f].icon}) : ${SN(sys)} reste à 1 PV.`, 'good');
      } else log(st, `Résilience (${HS.FACE_INFO[f].icon}) : échec.`);
    }
    p.hp[sys] = after;
    p.stats.dmg += before - after;
    if (after === 0) {
      p.stats.necro[sys] = (p.stats.necro[sys] || 0) + 1;
      log(st, `🖤 ${p.name} : ${SN(sys)} tombe en NÉCROSE.`, 'bad');
      checkDeath(st, p);
    }
    return before - after;
  }
  function heal(st, p, sys, n, green) {
    if (p.dead || p.hp[sys] <= 0) return 0;
    if (has(p, 'alimentation')) n += 1;
    if (green && chronicOn(p, 'crohn')) n -= 1;
    if (n <= 0) return 0;
    const before = p.hp[sys];
    p.hp[sys] = Math.min(p.max[sys], before + n);
    p.stats.heal += p.hp[sys] - before;
    return p.hp[sys] - before;
  }

  // Valeur marginale d'un PV selon le niveau (sert à l'auto-répartition et au bot).
  function hw(x) {
    return x <= 0 ? 10 : x <= 2 ? 6 : x <= 4 ? 3.5 : x <= 6 ? 2 : x <= 8 ? 1.2 : 0.6;
  }
  function pendingDmg(st, p) {
    const out = {};
    const t = st.turn;
    if (t && t.pid === p.id && t.attack && !t.attack.cancelled)
      for (const s in t.attack.dmg) out[s] = Math.max(0, t.attack.dmg[s] - (t.attack.shield[s] || 0));
    return out;
  }
  // Calcule la meilleure répartition d'un soin. def = {mode, amount, n, systems}
  function planHeal(st, p, def, mult, green) {
    mult = mult || 1;
    const pend = pendingDmg(st, p);
    const delta = (has(p, 'alimentation') ? 1 : 0) - (green && chronicOn(p, 'crohn') ? 1 : 0);
    const proj = (s) => p.hp[s] - (pend[s] || 0);
    const room = (s) => p.max[s] - p.hp[s];
    const gain = (s, amt) => {
      const eff = Math.min(room(s), Math.max(0, amt + delta));
      let g = 0;
      for (let i = 0; i < eff; i++) g += hw(proj(s) + i);
      return g;
    };
    let avail = def.systems.filter((s) => p.hp[s] > 0);
    const alloc = {};
    let total = 0;
    const amt = def.amount * mult;
    const limit2 = has(p, 'negligence') && def.mode !== 'one';
    if (def.mode === 'one') {
      let best = null;
      for (const s of avail) if (best === null || gain(s, amt) > gain(best, amt)) best = s;
      if (best) { alloc[best] = amt; total = gain(best, amt); }
    } else if (def.mode === 'each' || def.mode === 'pick') {
      let k = def.mode === 'pick' ? def.n : avail.length;
      if (limit2) k = Math.min(k, 2);
      avail = avail.slice().sort((a, b) => gain(b, amt) - gain(a, amt)).slice(0, k);
      for (const s of avail) { alloc[s] = amt; total += gain(s, amt); }
    } else if (def.mode === 'split') {
      if (limit2) avail = avail.slice().sort((a, b) => proj(a) - proj(b)).slice(0, 2);
      const eff = {};
      for (let i = 0; i < amt; i++) {
        let best = null, bv = 0;
        for (const s of avail) {
          const e = eff[s] || 0;
          if (e >= room(s)) continue;
          const v = hw(proj(s) + e);
          if (v > bv) { bv = v; best = s; }
        }
        if (!best) break;
        alloc[best] = (alloc[best] || 0) + 1;
        eff[best] = (eff[best] || 0) + 1;
      }
      for (const s in alloc) total += gain(s, alloc[s]);
    }
    return { alloc, gain: total };
  }
  function validAlloc(p, def, mult, alloc) {
    if (!alloc) return false;
    const keys = Object.keys(alloc).filter((s) => alloc[s] > 0);
    if (!keys.length || keys.some((s) => !def.systems.includes(s) || p.hp[s] <= 0 || alloc[s] !== Math.floor(alloc[s]))) return false;
    const amt = def.amount * mult;
    const lim2 = has(p, 'negligence') && def.mode !== 'one';
    if (lim2 && keys.length > 2) return false;
    if (def.mode === 'one') return keys.length === 1 && alloc[keys[0]] === amt;
    if (def.mode === 'pick') return keys.length <= def.n && keys.every((s) => alloc[s] === amt);
    if (def.mode === 'each') return keys.every((s) => alloc[s] === amt);
    if (def.mode === 'split') return keys.reduce((a, s) => a + alloc[s], 0) <= amt;
    return false;
  }
  function applyHeal(st, p, def, mult, alloc, green) {
    if (!validAlloc(p, def, mult, alloc)) alloc = planHeal(st, p, def, mult, green).alloc;
    const parts = [];
    for (const s in alloc) {
      if (!(alloc[s] > 0)) continue;
      const h = heal(st, p, s, alloc[s], green);
      parts.push(`${SN(s)} +${h}`);
    }
    return parts.join(', ') || 'aucun effet';
  }

  // ---------- valeurs des dés ----------
  function dieValue(st, p, f) {
    const t = st.turn;
    let v;
    if (f === '3') {
      v = 3;
      if (has(p, 'insomnie')) v = 2;
      if (t.fx === 'somnolence') v = Math.min(v, 2);
    } else if (f === '2') {
      v = 2;
      if (has(p, 'insomnie') || chronicOn(p, 'par')) v = 1;
    } else return has(p, 'stress') ? 2 : 1;
    if (has(p, 'hemochromatose') && f === '3') v += 1;
    return v;
  }
  function shieldValue(st, p) {
    let v = st.turn.fx === 'fievre' ? 2 : st.cfg.shieldDie;
    if (has(p, 'hydratation')) v++;
    if (has(p, 'ehlers')) v++;
    if (has(p, 'tabagisme')) v--;
    return Math.max(1, v);
  }
  function costOf(st, p, card, helping) {
    let c = card.cost || 0;
    const t = st.turn;
    if (HS.isTreatment(card)) {
      if (t.fx === 'photophobie') c++;
      if (chronicOn(p, 'depression')) c++;
    }
    if (helping) c += st.cfg.helpCost;
    return c;
  }
  // Un dé peut-il servir de symbole `face` ? (Méditation : [2] = Labo)
  function dieIs(p, d, face) {
    return d.f === face || (face === 'L' && d.f === '2' && has(p, 'meditation'));
  }
  function findDie(st, p, face) {
    const t = st.turn;
    let i = t.dice.findIndex((d) => !d.used && d.f === face);
    if (i < 0) i = t.dice.findIndex((d) => !d.used && dieIs(p, d, face));
    return i;
  }

  // ---------- création de partie ----------
  function newGame(opt) {
    const cfg = Object.assign({}, HS.CONFIG, opt.cfg || {});
    const st = {
      v: HS.VERSION, cfg, mode: opt.mode === 'vs' ? 'vs' : 'coop',
      seed: (opt.seed === undefined ? Math.floor(Math.random() * 2 ** 31) : opt.seed) | 0,
      players: [], deck: [], discard: [], pathoDeck: [], pathoDiscard: [],
      cur: -1, round: 1, turnCount: 0, turn: null, pending: null, over: null,
      log: [], logSeq: 1, noLog: !!opt.noLog, lastSoin: null, uid: 1,
      length: opt.length || 'normale', difficulty: opt.difficulty || 'resident',
    };
    const n = opt.players.length;
    const mk = (id) => ({ uid: st.uid++, id });
    const genes = shuffle(st, HS.byType('gene').map((c) => c.id));
    const bads = shuffle(st, HS.byType('mauvaise').map((c) => c.id));
    const hpMod = st.mode === 'coop' ? cfg.difficultyHP[st.difficulty] || 0 : 0;

    opt.players.forEach((o, i) => {
      const gene = o.gene || genes.find((g) => !opt.players.some((x) => x.gene === g) && !st.players.some((x) => x.gene === g));
      const p = {
        id: i, name: o.name || `Dr ${i + 1}`, bot: !!o.bot, gene, habit: null,
        hp: {}, max: {}, atp: cfg.atpStart, hand: [], chronics: [], dead: false,
        next: { dice: 0, draw: 0, actions: 0, vetoed: false },
        stats: { dmg: 0, heal: 0, necro: {}, played: 0, turns: 0 },
      };
      SYS.forEach((s) => {
        let m = cfg.maxHP + hpMod;
        if (gene === 'jeune') m += 1;
        if (gene === 'senior') m -= 1;
        if (gene === 'brca' && s === 'immuno') m -= 3;
        if (gene === 'cardiaque' && s === 'cardio') m -= 2;
        if (gene === 'alpha1' && s === 'respi') m -= 2;
        if (gene === 'ehlers' && s === 'cardio') m -= 2;
        if (gene === 'lynch' && s === 'digest') m -= 3;
        p.max[s] = m;
        p.hp[s] = m;
      });
      if (gene === 'cardiaque') p.atp = Math.min(cfg.atpMax, p.atp + 1);
      if (o.habit !== undefined) p.habit = o.habit;
      else if (gene !== 'hla') p.habit = bads.pop();
      st.players.push(p);
    });

    // Pioche commune : Traitements + Actions + Bonnes habitudes (+ Mauvaises restantes en VS).
    ['soin', 'maint', 'invasif', 'action'].forEach((t) => HS.byType(t).forEach((c) => { for (let k = 0; k < c.qty; k++) st.deck.push(mk(c.id)); }));
    HS.byType('bonne').forEach((c) => st.deck.push(mk(c.id)));
    if (st.mode === 'vs') bads.forEach((id) => st.deck.push(mk(id)));
    shuffle(st, st.deck);

    const all = [];
    ['aigu', 'chronique'].forEach((t) => HS.byType(t).forEach((c) => { for (let k = 0; k < c.qty; k++) all.push(mk(c.id)); }));
    shuffle(st, all);
    const want = Math.round(n * (cfg.pathoPerPlayer[n] || 8) * (cfg.lengthMult[st.length] || 1));
    st.pathoDeck = all.slice(0, Math.max(n, Math.min(all.length, want)));
    st.pathoTotal = st.pathoDeck.length;

    st.players.forEach((p) => draw(st, p, cfg.startHand + (p.gene === 'senior' ? 2 : 0)));
    log(st, `🏥 Début de partie — mode ${st.mode === 'coop' ? (n === 1 ? 'Solo' : 'Coopératif') : 'Compétitif'}, ${st.pathoTotal} pathologies.`);
    nextTurn(st);
    return st;
  }

  // ---------- déroulement ----------
  function nextTurn(st) {
    if (st.over) return;
    const n = st.players.length;
    let wrapped = false;
    for (let k = 0; k < n; k++) {
      st.cur = (st.cur + 1) % n;
      if (st.cur === 0 && st.turnCount > 0) { wrapped = true; st.round++; }
      if (!st.players[st.cur].dead) break;
    }
    if (st.mode === 'coop' && !st.pathoDeck.length) {
      st.over = { result: 'victoire', reason: 'Pioche de Pathologies épuisée : tous les patients sont en vie.' };
      log(st, '🏆 VICTOIRE : la pioche de Pathologies est épuisée !', 'good');
      return;
    }
    if (st.mode === 'vs') {
      const a = alive(st);
      const endOfRound = wrapped || !a.length;
      if (endOfRound && a.length <= 1) {
        // dernier survivant, ou égalité entre ceux tombés pendant la dernière manche
        const last = Math.max(...st.players.map((x) => x.diedRound || 0));
        const winners = a.length ? a : st.players.filter((x) => x.diedRound === last);
        st.over = { result: 'fin', winners: winners.map((x) => x.id), reason: a.length ? 'Dernier survivant.' : 'Tous les patients sont tombés dans la même manche : égalité.' };
        log(st, `🏆 Fin de partie : ${winners.map((x) => x.name).join(' & ')} ${a.length ? "l'emporte" : 'à égalité'}.`, 'good');
        return;
      }
      if ((st.finalRound || !st.pathoDeck.length) && endOfRound) return endVS(st);
    }
    startTurn(st);
  }
  function endVS(st) {
    const a = alive(st);
    const best = Math.min(...a.map(lostHP));
    st.over = { result: 'fin', winners: a.filter((p) => lostHP(p) === best).map((p) => p.id), reason: 'Pioche épuisée : victoire au patient le plus proche de sa pleine santé.' };
    log(st, `🏆 Fin de partie : ${st.over.winners.map((i) => st.players[i].name).join(' & ')} l'emporte (${best} PV perdus seulement).`, 'good');
  }

  function startTurn(st) {
    const cfg = st.cfg;
    const p = st.players[st.cur];
    st.turnCount++;
    p.stats.turns++;
    const t = (st.turn = {
      pid: p.id, n: st.turnCount, phase: 'maintenance', dice: [], power: 0, mull: 0, freeReroll: 0,
      actions: cfg.actions + p.next.actions, spent: 0, attack: null, patho: null, fx: null, adrenArmed: false, adrenUsed: false,
      treatments: 0, cardsPlayed: 0, floor: {}, peek: false, reseauUsed: false, vetoed: p.next.vetoed, bot: {},
    });
    log(st, `—— Tour ${t.n} : ${p.name} ——`, 'turn');

    // PHASE 1 — MAINTENANCE
    if (has(p, 'alcoolisme')) {
      const f = rollFace(st);
      if (f === '2' || f === '3') { t.actions--; log(st, `🍺 Alcoolisme (${f}) : -1 Action ce tour.`, 'bad'); }
    }
    let nd = cfg.draw + (has(p, 'lynch') ? 1 : 0) - p.next.draw;
    if (has(p, 'isolement')) nd = Math.max(1, nd - 1);
    draw(st, p, Math.max(0, nd));
    for (const c of p.chronics) {
      if (c.stab) continue;
      const b = cfg.burn + (has(p, 'malbouffe') ? 1 : 0);
      const d = damage(st, p, c.sys, b);
      if (d) log(st, `🔥 Burn chronique (${C[c.id].name}) : ${SN(c.sys)} -${d}.`, 'bad');
      if (c.id === 'hta' && p.hp.cardio <= 5 && !p.dead) {
        damage(st, p, 'respi', 1); damage(st, p, 'neuro', 1);
        log(st, '🔥 Hypertension : Respi et Neuro -1.', 'bad');
      }
      if (st.over || p.dead) break;
    }
    if (st.over) return;
    if (p.dead) return nextTurn(st);

    // PHASE 2 — INVASION
    t.phase = 'invasion';
    if (st.mode === 'vs' && !st.pathoDeck.length && !st.finalRound) {
      // VS : la pioche s'épuise en cours de manche -> on remélange la défausse pour finir la manche à égalité de tours.
      st.finalRound = true;
      st.pathoDeck = shuffle(st, st.pathoDiscard);
      st.pathoDiscard = [];
      log(st, '⏳ Pioche de Pathologies épuisée : DERNIÈRE MANCHE (défausse remélangée).', 'turn');
    }
    while (st.pathoDeck.length && !t.attack) {
      const pc = st.pathoDeck.pop();
      const card = C[pc.id];
      t.patho = pc.id;
      if (card.type === 'aigu') {
        st.pathoDiscard.push(pc);
        const dmg = Object.assign({}, card.dmg);
        const primary = Object.keys(dmg)[0];
        if (card.fx === 'vegetations') for (const s in dmg) dmg[s]++;
        if (chronicOn(p, 'diabete')) dmg[primary]++;
        if (has(p, 'hygiene')) dmg[primary] = Math.max(0, dmg[primary] - 1);
        for (const s in dmg) if (p.hp[s] <= 0) delete dmg[s]; // Saturation : tissu nécrosé
        t.attack = { id: card.id, dmg, shield: {}, fx: card.fx, danger: !!card.danger, primary, cancelled: false };
        t.fx = card.fx;
        log(st, `🟥 INVASION : ${card.name} (${Object.keys(dmg).map((s) => `${SN(s)} -${dmg[s]}`).join(' / ') || 'sans effet'}) — ${card.fxName}.`, 'patho');
        if (card.fx === 'choc' && p.atp) { p.atp = 0; log(st, 'Choc : ATP perdus.', 'bad'); }
        if (card.fx === 'douleur') { const d = discardRandom(st, p, 2); if (d.length) log(st, `Douleur : défausse ${d.join(', ')}.`, 'bad'); }
        if (card.fx === 'hemiplegie') t.actions = Math.min(t.actions, 1);
      } else {
        const ex = p.chronics.find((c) => c.sys === card.sys);
        if (!ex) {
          p.chronics.push({ id: card.id, sys: card.sys, stab: false, uid: pc.uid });
          log(st, `🟥 INVASION : ${card.name} s'installe sur ${SN(card.sys)} — ${card.fxName}.`, 'patho');
        } else if (ex.stab) {
          st.pathoDiscard.push(pc);
          log(st, `🟥 ${card.name} : le traitement de fond de ${C[ex.id].name} protège ${SN(card.sys)}. Sans effet.`, 'good');
        } else {
          st.pathoDiscard.push(pc);
          const dmg = {};
          if (p.hp[card.sys] > 0) dmg[card.sys] = cfg.crisis;
          t.attack = { id: card.id, dmg, shield: {}, fx: null, danger: false, primary: card.sys, cancelled: false, crisis: true };
          log(st, `💥 CRISE AIGUË : ${card.name} sur ${SN(card.sys)} déjà malade (-${cfg.crisis} PV).`, 'patho');
        }
        if (!cfg.chain) break; // Comorbidité : une Chronique n'empêche pas l'urgence du tour
      }
    }
    if (!t.patho) log(st, 'Pas de Pathologie ce tour (pioche épuisée).');

    // PHASE 3 — SIGNES VITAUX
    let nd6 = cfg.dice;
    if (zeros(p) > 0 || chronicOn(p, 'mpoc')) nd6--;
    nd6 = Math.max(1, nd6 - p.next.dice);
    for (let i = 0; i < nd6; i++) t.dice.push({ f: rollFace(st), used: false });
    t.mull = 1 + (has(p, 'sommeil') ? 1 : 0);
    if (t.fx === 'panique' || chronicOn(p, 'parkinson')) t.mull = 0;
    t.freeReroll = has(p, 'alpha1') ? 1 : 0;
    t.actions = Math.max(0, t.actions);
    p.next = { dice: 0, draw: 0, actions: 0, vetoed: false };
    t.phase = 'reponse';
    log(st, `🎲 Dés : ${t.dice.map((d) => HS.FACE_INFO[d.f].icon).join(' ')}`);
  }

  function spendAction(st, p, free) {
    const t = st.turn;
    if (free) return;
    t.actions--;
    t.spent++;
    if (t.spent === 2 && has(p, 'surmenage')) {
      damage(st, p, 'neuro', 1, { ignoreFloor: false });
      log(st, '😵 Surmenage : Neuro -1.', 'bad');
    }
  }

  // ---------- résolution de fin de tour ----------
  function endTurn(st) {
    const t = st.turn;
    const p = P(st, t.pid);
    t.phase = 'resolution';
    const a = t.attack;
    if (a && !a.cancelled) {
      let total = 0, leak = false;
      const parts = [];
      for (const s of Object.keys(a.dmg)) {
        const d = Math.max(0, a.dmg[s] - (a.shield[s] || 0));
        if (d > 0) {
          leak = true;
          const done = damage(st, p, s, d);
          total += done;
          parts.push(`${SN(s)} -${done}`);
        }
        if (st.over || p.dead) break;
      }
      log(st, leak ? `🩸 Résolution : ${parts.join(', ')}.` : '🛡️ Résolution : attaque entièrement bloquée !', leak ? 'bad' : 'good');
      if (!st.over && !p.dead) {
        if (a.fx === 'systemique' && leak) { SYS.forEach((s) => damage(st, p, s, st.cfg.systemic)); log(st, `Systémique : -${st.cfg.systemic} PV partout.`, 'bad'); }
        if (a.fx === 'exquise') { SYS.forEach((s) => { if (s !== a.primary) damage(st, p, s, 1); }); log(st, 'Douleur exquise : -1 PV sur les autres systèmes.', 'bad'); }
        if (a.fx === 'orage' && leak) { p.atp = 0; const d = discardRandom(st, p, 1); log(st, `Orage électrique : ATP à 0${d.length ? ', défausse ' + d[0] : ''}.`, 'bad'); }
        if (a.fx === 'hypoxie' && leak) { p.next.dice = 1; log(st, 'Hypoxie : 1 dé de moins au prochain tour.', 'bad'); }
        if (a.fx === 'anemie' && leak) { p.next.draw = 1; log(st, 'Anémie : 1 carte de moins au prochain tour.', 'bad'); }
        if (a.fx === 'dechirure' && total > 0) {
          const tr = p.hand.filter((c) => HS.isTreatment(C[c.id])).sort((x, y) => C[y.id].cost - C[x.id].cost)[0];
          if (tr) { discardCard(st, p, tr.uid); log(st, `Déchirure : défausse ${C[tr.id].name}.`, 'bad'); }
        }
      }
      const trigger = t.adrenUsed || a.danger;
      if (!st.over && !p.dead && total > 0 && trigger) {
        const nxt = SYS[(SYS.indexOf(a.primary) + 1) % 5];
        const c = has(p, 'ehlers') ? total : Math.floor(total / 2);
        const done = damage(st, p, nxt, c);
        if (done) log(st, `⚡ Collatéral : ${SN(nxt)} -${done}.`, 'bad');
      }
    }
    if (st.over) return;
    if (!p.dead) {
      const thr = st.cfg.greenAbove + (has(p, 'jeune') ? 2 : 0);
      if (SYS.every((s) => p.hp[s] > thr) && !has(p, 'sedentarite') && !chronicOn(p, 'ic') && p.atp < atpMax(st, p)) {
        gainATP(st, p, 1);
        log(st, '🟢 Zone verte : +1 ATP.', 'good');
      }
      const over = p.hand.length - handLimit(st, p);
      if (over > 0) {
        st.pending = { type: 'discard', n: over, pid: p.id, then: 'next' };
        return;
      }
    }
    nextTurn(st);
  }

  // ---------- actions du joueur ----------
  const ERR = (m) => ({ ok: false, err: m });
  const OK = { ok: true };

  function act(st, pid, a) {
    const r = act0(st, pid, a);
    // Un joueur mort pendant son propre tour (VS) : on passe au suivant.
    if (r.ok && !st.over && st.turn && st.players[st.turn.pid].dead) { st.pending = null; nextTurn(st); }
    return r;
  }
  function act0(st, pid, a) {
    if (st.over) return ERR('La partie est terminée.');
    const t = st.turn;
    if (!t || t.pid !== pid) return ERR("Ce n'est pas votre tour.");
    const p = P(st, pid);
    if (st.pending) {
      if (a.type !== 'resolve') return ERR('Un choix est en attente.');
      return resolvePending(st, p, a);
    }
    if (t.phase !== 'reponse') return ERR('Phase incorrecte.');
    switch (a.type) {
      case 'reroll': return doReroll(st, p, a);
      case 'die': return doDie(st, p, a);
      case 'play': return doPlay(st, p, a);
      case 'reanimate': return doReanimate(st, p, a);
      case 'reseau': return doReseau(st, p, a);
      case 'end': endTurn(st); return OK;
    }
    return ERR('Action inconnue.');
  }

  function doReroll(st, p, a) {
    const t = st.turn;
    const idx = (a.dice || []).filter((i) => t.dice[i] && !t.dice[i].used);
    if (!idx.length) return ERR('Choisissez des dés non utilisés.');
    if (idx.length === 1 && t.freeReroll > 0) t.freeReroll--;
    else if (t.mull > 0) t.mull--;
    else return ERR('Plus de relance disponible.');
    idx.forEach((i) => (t.dice[i].f = rollFace(st)));
    log(st, `🔄 Relance → ${t.dice.map((d) => (d.used ? '·' : HS.FACE_INFO[d.f].icon)).join(' ')}`);
    return OK;
  }

  function addShield(st, n, sys) {
    const a = st.turn.attack;
    if (!a || a.cancelled) return null;
    const rem = (s) => a.dmg[s] - (a.shield[s] || 0);
    if (!sys || a.dmg[sys] === undefined) sys = Object.keys(a.dmg).sort((x, y) => rem(y) - rem(x))[0];
    if (!sys) return null;
    a.shield[sys] = (a.shield[sys] || 0) + n;
    return sys;
  }

  function doDie(st, p, a) {
    const t = st.turn;
    const d = t.dice[a.i];
    if (!d || d.used) return ERR('Dé indisponible.');
    const att = t.attack && !t.attack.cancelled && Object.keys(t.attack.dmg).length ? t.attack : null;
    switch (a.use) {
      case 'shield': {
        if (d.f !== 'S') return ERR('Il faut un dé Bouclier.');
        if (!att) return ERR('Aucune attaque à bloquer.');
        const v = shieldValue(st, p);
        const s = addShield(st, v, a.sys);
        log(st, `🛡️ Bouclier : bloque ${v} sur ${SN(s)}.`);
        break;
      }
      case 'guard': {
        if (!att) return ERR('Aucune attaque à bloquer.');
        if (chronicOn(p, 'cirrhose')) return ERR("Cirrhose : Protection d'urgence interdite.");
        const s = addShield(st, st.cfg.guardDie, a.sys);
        log(st, `Protection d'urgence : bloque ${st.cfg.guardDie} sur ${SN(s)}.`);
        break;
      }
      case 'power': {
        const v = dieValue(st, p, d.f);
        t.power += v;
        log(st, `Puissance +${v}.`);
        if (has(p, 'hemochromatose') && d.f === '3') { d.used = true; damage(st, p, 'digest', 1, { ignoreFloor: true }); log(st, 'Hémochromatose : Digestif -1.', 'bad'); }
        break;
      }
      case 'patch': {
        if (d.f !== 'P') return ERR('Il faut un dé Patch.');
        d.used = true;
        if (t.fx !== 'deshydratation') {
          let s = a.sys;
          if (!s || p.hp[s] <= 0) s = SYS.filter((x) => p.hp[x] > 0 && p.hp[x] < p.max[x]).sort((x, y) => p.hp[x] - p.hp[y])[0];
          if (s) { const h = heal(st, p, s, 1, false); log(st, `🩹 Patch : ${SN(s)} +${h}.`); }
        } else log(st, '🩹 Patch : déshydratation, pas de soin.');
        const r = t.dice[a.reroll];
        if (r && !r.used && a.reroll !== a.i) { r.f = rollFace(st); log(st, `🩹 Relance d'un dé → ${HS.FACE_INFO[r.f].icon}`); }
        break;
      }
      case 'adren': {
        if (d.f !== 'A') return ERR('Il faut un dé Adrénaline.');
        if (t.adrenArmed) return ERR('Adrénaline déjà armée.');
        t.adrenArmed = true;
        t.adrenUsed = true;
        log(st, '⚡ Adrénaline armée : le prochain Soin immédiat est doublé (risque de Collatéral).');
        break;
      }
      case 'draw': {
        if (!dieIs(p, d, 'L')) return ERR('Il faut un dé Labo.');
        const n = draw(st, p, has(p, 'curiosite') ? 2 : 1);
        log(st, `🧪 Labo : pioche ${n} carte${n > 1 ? 's' : ''}.`);
        break;
      }
      case 'vision': {
        if (!dieIs(p, d, 'L')) return ERR('Il faut un dé Labo.');
        t.peek = true;
        log(st, '🧪 Labo : Vision de la prochaine Pathologie.');
        break;
      }
      default: return ERR('Utilisation inconnue.');
    }
    d.used = true;
    d.as = a.use;
    return OK;
  }

  function doReanimate(st, p, a) {
    const t = st.turn, cfg = st.cfg;
    if (t.actions < 1) return ERR("Plus d'Action disponible.");
    if (!a.sys || p.hp[a.sys] > 0) return ERR("Ce système n'est pas en Nécrose.");
    let idx = (a.dice || []).filter((i, k, arr) => t.dice[i] && !t.dice[i].used && arr.indexOf(i) === k);
    if (idx.length < cfg.reanimDice) {
      idx = t.dice.map((d, i) => (d.used ? -1 : i)).filter((i) => i >= 0).slice(0, cfg.reanimDice);
    }
    if (idx.length < cfg.reanimDice) return ERR(`Il faut sacrifier ${cfg.reanimDice} dés.`);
    idx.slice(0, cfg.reanimDice).forEach((i) => { t.dice[i].used = true; t.dice[i].as = 'reanim'; });
    p.hp[a.sys] = Math.min(p.max[a.sys], cfg.reanimHP);
    spendAction(st, p);
    log(st, `🚑 RÉANIMATION : ${SN(a.sys)} remonte à ${p.hp[a.sys]} PV.`, 'good');
    return OK;
  }

  function doReseau(st, p, a) {
    const t = st.turn;
    if (!has(p, 'reseau')) return ERR('Réseau Social requis.');
    if (t.reseauUsed) return ERR('Déjà utilisé ce tour.');
    const c = p.hand.find((x) => x.uid === a.uid);
    if (!c) return ERR('Carte introuvable.');
    const to = st.players[a.to];
    if (st.mode === 'coop' && to && to.id !== p.id && !to.dead) {
      p.hand.splice(p.hand.indexOf(c), 1);
      to.hand.push(c);
      log(st, `🤝 Réseau Social : ${p.name} donne une carte à ${to.name}.`);
    } else {
      discardCard(st, p, c.uid);
      draw(st, p, 1);
      log(st, '🤝 Réseau Social : défausse 1 carte, pioche 1 carte.');
    }
    t.reseauUsed = true;
    return OK;
  }

  function canHelp(st, p, target) {
    if (target.id === p.id) return true;
    if (st.mode !== 'coop' || target.dead) return false;
    if (has(p, 'isolement') || has(target, 'isolement')) return false;
    return true;
  }

  function doPlay(st, p, a) {
    const t = st.turn;
    const inst = p.hand.find((c) => c.uid === a.uid);
    if (!inst) return ERR('Carte introuvable.');
    const card = C[inst.id];
    const treat = HS.isTreatment(card);
    const free = treat && has(p, 'metaboliseur') && t.treatments === 0;
    if (!free && t.actions < 1) return ERR("Plus d'Action disponible.");
    if (treat && has(p, 'deni') && t.treatments >= 1) return ERR('Déni : 1 seul Traitement par tour.');

    // --- cible ---
    let target = p;
    if (a.target !== undefined && a.target !== null && a.target !== p.id) {
      target = st.players[a.target];
      if (!target || target.dead) return ERR('Cible invalide.');
    }
    const others = st.players.filter((x) => x.id !== p.id && !x.dead);
    const vsChoice = st.mode === 'vs' && a.choice === 'vs';

    // --- validations propres à la carte ---
    if (card.type === 'soin' && target !== p && !canHelp(st, p, target)) return ERR('Vous ne pouvez pas soigner ce joueur.');
    if ((card.type === 'maint' || card.type === 'invasif' || card.type === 'bonne') && target !== p) return ERR('Cette carte ne cible que votre patient.');
    if (card.type === 'mauvaise') {
      if (st.mode !== 'vs' || target === p) return ERR('Jouez une Mauvaise Habitude sur un adversaire.');
      if (target.gene === 'hla') return ERR('Ce patient est immunisé (HLA rare).');
    }
    if (card.id === 'greffe') {
      if (has(p, 'hla')) return ERR('HLA rare : aucun greffon compatible.');
      const necro = SYS.some((s) => p.hp[s] <= 0);
      if (!necro && !p.chronics.length) return ERR('Aucune Chronique ni Nécrose à traiter.');
    }
    if (card.id === 'veto') {
      if (vsChoice) { if (target === p) return ERR('Choisissez un adversaire.'); }
      else if (!t.attack || t.attack.cancelled) return ERR('Aucune attaque à annuler.');
    }
    if (card.id === 'placebo' && vsChoice && target === p) return ERR('Choisissez un adversaire.');
    if (card.id === 'delegation' && st.mode === 'coop' && others.length) {
      if (target === p) target = others.find((x) => canHelp(st, p, x)) || p;
      if (target !== p && !canHelp(st, p, target)) return ERR('Cible invalide.');
    }

    // --- Veto adverse (VS) : la 1re carte est annulée ---
    if (t.vetoed) {
      t.vetoed = false;
      discardCard(st, p, inst.uid);
      spendAction(st, p, free);
      t.cardsPlayed++;
      log(st, `⛔ VETO : ${card.name} de ${p.name} est annulée.`, 'bad');
      return OK;
    }

    // --- paiement ---
    const cost = costOf(st, p, card, card.type === 'soin' && target !== p);
    let payDie = -1;
    if (card.costDie && a.pay !== 'power') payDie = findDie(st, p, card.costDie);
    if (payDie < 0) {
      if (t.power + p.atp < cost) return ERR(`Puissance insuffisante (${cost} requis, ${t.power} + ${p.atp} ATP).`);
      const fromPool = Math.min(t.power, cost);
      t.power -= fromPool;
      p.atp -= cost - fromPool;
    } else {
      // le surcoût éventuel (Dépression, Photophobie...) se paie en Puissance
      const extra = cost - card.cost;
      if (t.power + p.atp < extra) return ERR(`Surcoût de ${extra} Puissance requis.`);
      const fromPool = Math.min(t.power, extra);
      t.power -= fromPool;
      p.atp -= extra - fromPool;
      t.dice[payDie].used = true;
      t.dice[payDie].as = 'cost';
    }

    p.hand.splice(p.hand.indexOf(inst), 1);
    let keep = false; // carte attachée (non défaussée)
    let msg = '';
    const who = target !== p ? ` sur ${target.name}` : '';

    switch (card.type) {
      case 'soin': {
        const mult = t.adrenArmed ? 2 : 1;
        t.adrenArmed = false;
        if (card.id === 'adrenaline' && payDie >= 0) t.adrenUsed = true;
        msg = applyHeal(st, target, card.heal, mult, a.alloc, true);
        if (card.atp) gainATP(st, target, card.atp);
        st.lastSoin = card.id;
        msg = `${mult > 1 ? '⚡×2 ' : ''}${msg}${card.atp ? ', +1 ATP' : ''}`;
        break;
      }
      case 'maint': {
        let ch = p.chronics.find((c) => !c.stab && c.sys === a.chronic && card.systems.includes(c.sys));
        if (!ch) ch = p.chronics.find((c) => !c.stab && card.systems.includes(c.sys));
        if (ch) { ch.stab = true; ch.by = inst.id; keep = true; msg = `stabilise ${C[ch.id].name}`; }
        else msg = 'bonus seul';
        if (card.bonus === 'shield') { const s = addShield(st, 2, a.sys); if (s) msg += `, +2 Boucliers (${SN(s)})`; }
        if (card.bonus === 'draw') { draw(st, p, 2); msg += ', pioche 2'; }
        if (card.bonus === 'heal') msg += ', ' + applyHeal(st, p, { mode: 'pick', n: 2, amount: 2, systems: card.systems }, 1, a.alloc, true);
        if (card.bonus === 'habit') {
          if (p.habit && C[p.habit].type === 'mauvaise') { msg += `, ${C[p.habit].name} retirée`; p.habit = null; }
          else { gainATP(st, p, 1); msg += ', +1 ATP'; }
        }
        break;
      }
      case 'invasif': {
        const bonus = has(p, 'brca') ? 3 : 0;
        if (card.id === 'chirurgie') {
          msg = applyHeal(st, p, { mode: 'one', amount: card.amount + bonus, systems: SYS }, 1, a.alloc, true);
        } else if (card.id === 'dialyse') {
          const parts = [];
          card.systems.forEach((s) => {
            const lvl = Math.min(p.max[s], card.amount + bonus);
            if (p.hp[s] > 0 && p.hp[s] < lvl) { p.stats.heal += lvl - p.hp[s]; p.hp[s] = lvl; parts.push(`${SN(s)} → ${lvl}`); }
          });
          msg = parts.join(', ') || 'aucun effet';
        } else if (card.id === 'intubation') {
          card.systems.forEach((s) => (t.floor[s] = true));
          const h = heal(st, p, 'respi', card.amount + bonus, true);
          msg = `Cardio/Respi/Neuro protégés (min 1 PV), Respi +${h}`;
        } else if (card.id === 'greffe') {
          const necro = SYS.filter((x) => p.hp[x] <= 0);
          const wantChronic = a.choice === 'chronic' && p.chronics.length;
          if (necro.length && (!wantChronic || !p.chronics.length)) {
            const s = necro.includes(a.sys) ? a.sys : necro[0];
            p.hp[s] = Math.min(p.max[s], card.revive + bonus);
            msg = `${SN(s)} ranimé à ${p.hp[s]} PV`;
          } else {
            const ch = p.chronics.find((c) => c.sys === a.sys) || p.chronics.find((c) => !c.stab) || p.chronics[0];
            p.chronics.splice(p.chronics.indexOf(ch), 1);
            const h = heal(st, p, ch.sys, card.amount + bonus, true);
            msg = `${C[ch.id].name} retirée, ${SN(ch.sys)} +${h}`;
          }
        }
        const f = rollFace(st);
        if (st.cfg.iatroFail.includes(f) || (f === 'P' && has(p, 'metaboliseur'))) {
          const dmg = card.risk + (has(p, 'senior') || has(p, 'hla') ? 1 : 0);
          const live = SYS.filter((s) => p.hp[s] > 0);
          msg += ` — ⚠️ ÉCHEC CRITIQUE (${f})`;
          if (live.length <= 3) live.forEach((s) => damage(st, p, s, dmg, { ignoreFloor: true }));
          else st.pending = { type: 'iatro', pid: p.id, n: 3, dmg };
        } else msg += ` — ✅ sans complication (${HS.FACE_INFO[f].icon})`;
        break;
      }
      case 'action': {
        if (card.id === 'delegation') {
          if (st.mode === 'vs') { others.forEach((o) => o.next.actions--); msg = 'chaque adversaire perd 1 Action à son prochain tour'; }
          else if (target !== p) { target.next.actions++; draw(st, p, 1); msg = `${target.name} gagne +1 Action à son prochain tour, pioche 1`; }
          else { p.next.actions++; msg = '+1 Action au prochain tour'; }
        } else if (card.id === 'veto') {
          if (vsChoice) { target.next.vetoed = true; msg = `la 1re carte de ${target.name} sera annulée`; }
          else { t.attack.cancelled = true; t.fx = null; msg = `${C[t.attack.id].name} est annulée`; }
        } else if (card.id === 'placebo') {
          if (vsChoice) {
            const top = SYS.filter((s) => target.hp[s] > 0).sort((x, y) => target.hp[y] - target.hp[x]).slice(0, 2);
            top.forEach((s) => damage(st, target, s, 2, { ignoreFloor: true }));
            msg = `NOCEBO sur ${target.name} : ${top.map((s) => SN(s) + ' -2').join(', ')}`;
          } else if (st.lastSoin) {
            const src = C[st.lastSoin];
            const tg = target !== p && canHelp(st, p, target) ? target : p;
            msg = `copie ${src.name} : ` + applyHeal(st, tg, src.heal, 1, a.alloc, true);
            if (src.atp) gainATP(st, tg, src.atp);
          } else msg = applyHeal(st, p, { mode: 'one', amount: 3, systems: SYS }, 1, a.alloc, true);
        } else if (card.id === 'recherche') {
          const cards = [];
          for (let i = 0; i < 4; i++) { const before = p.hand.length; draw(st, p, 1); if (p.hand.length > before) cards.push(p.hand.pop()); }
          if (cards.length <= 2) { cards.forEach((c) => p.hand.push(c)); msg = `pioche ${cards.length}`; }
          else { st.pending = { type: 'recherche', pid: p.id, cards, keep: 2 }; msg = 'choisissez 2 cartes sur 4'; }
        }
        break;
      }
      case 'bonne': {
        if (p.habit) msg = `remplace ${C[p.habit].name}`;
        p.habit = card.id;
        keep = true;
        if (card.id === 'activite') gainATP(st, p, 1);
        break;
      }
      case 'mauvaise': {
        msg = `${target.name} adopte ${card.name}${target.habit ? ' (remplace ' + C[target.habit].name + ')' : ''}`;
        target.habit = card.id;
        target.atp = Math.min(target.atp, atpMax(st, target));
        keep = true;
        break;
      }
    }
    if (!keep) st.discard.push(inst);
    p.atp = Math.min(p.atp, atpMax(st, p));
    p.stats.played++;
    t.cardsPlayed++;
    if (treat) t.treatments++;
    log(st, `🃏 ${p.name} joue ${card.name}${who} : ${msg}.`, 'play');
    spendAction(st, p, free);
    return OK;
  }

  function resolvePending(st, p, a) {
    const pd = st.pending;
    if (pd.pid !== p.id) return ERR('Choix réservé à un autre joueur.');
    if (pd.type === 'discard') {
      const ids = (a.uids || []).filter((u, i, arr) => arr.indexOf(u) === i && p.hand.some((c) => c.uid === u));
      if (ids.length !== pd.n) return ERR(`Défaussez exactement ${pd.n} carte(s).`);
      ids.forEach((u) => discardCard(st, p, u));
      log(st, `${p.name} défausse ${pd.n} carte(s) (limite de main).`);
      st.pending = null;
      nextTurn(st);
      return OK;
    }
    if (pd.type === 'recherche') {
      const ids = (a.uids || []).filter((u, i, arr) => arr.indexOf(u) === i && pd.cards.some((c) => c.uid === u));
      if (ids.length !== pd.keep) return ERR(`Gardez exactement ${pd.keep} cartes.`);
      pd.cards.forEach((c) => (ids.includes(c.uid) ? p.hand.push(c) : st.deck.unshift(c)));
      st.pending = null;
      return OK;
    }
    if (pd.type === 'iatro') {
      const live = SYS.filter((s) => p.hp[s] > 0);
      const sys = (a.systems || []).filter((s, i, arr) => arr.indexOf(s) === i && live.includes(s));
      if (sys.length !== Math.min(pd.n, live.length)) return ERR(`Choisissez ${Math.min(pd.n, live.length)} systèmes.`);
      st.pending = null;
      sys.forEach((s) => damage(st, p, s, pd.dmg, { ignoreFloor: true }));
      log(st, `⚠️ Complications : ${sys.map((s) => SN(s) + ' -' + pd.dmg).join(', ')}.`, 'bad');
      return OK;
    }
    return ERR('Choix inconnu.');
  }

  // ---------- vue filtrée (réseau / interface) ----------
  function viewFor(st, pid) {
    const t = st.turn;
    const me = st.players[pid];
    const showNext = st.pathoDeck.length && ((me && me.gene === 'cardiaque') || (t && t.peek && (st.mode === 'coop' || t.pid === pid)));
    const v = {
      v: st.v, mode: st.mode, me: pid, cur: st.cur, round: st.round, turnCount: st.turnCount, over: st.over, cfg: st.cfg,
      length: st.length, difficulty: st.difficulty,
      deckCount: st.deck.length, discardCount: st.discard.length, pathoCount: st.pathoDeck.length, pathoTotal: st.pathoTotal,
      nextPatho: showNext ? st.pathoDeck[st.pathoDeck.length - 1].id : null,
      lastSoin: st.lastSoin, log: st.log, logSeq: st.logSeq,
      turn: t ? Object.assign({}, t, { bot: undefined }) : null,
      pending: null,
      players: st.players.map((p) => ({
        id: p.id, name: p.name, bot: p.bot || !!p.away, gene: p.gene, habit: p.habit, hp: p.hp, max: p.max, atp: p.atp, dead: p.dead,
        chronics: p.chronics, next: p.next, handCount: p.hand.length,
        hand: p.id === pid || st.mode === 'coop' ? p.hand : null,
        handLimit: handLimit(st, p), atpMax: atpMax(st, p), total: totalHP(p), lost: lostHP(p),
      })),
    };
    if (st.pending) v.pending = st.pending.pid === pid ? st.pending : { type: st.pending.type, pid: st.pending.pid };
    return JSON.parse(JSON.stringify(v));
  }

  Object.assign(HS, {
    newGame, act, viewFor, planHeal, costOf, dieValue, shieldValue, handLimit, atpMax, findDie, dieIs, canHelp,
    pendingDmg, has, chronicOn, zeros, totalHP, lostHP, hw,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = HS;
})(typeof window !== 'undefined' ? window : globalThis);
