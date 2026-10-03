/* HOMEOSTASIS v6 — joueur automatique (heuristique).
   Sert d'adversaire/allié dans le jeu et de « joueur moyen » dans le simulateur. */
(function (root) {
  const HS = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.HS;
  const SYS = HS.SYS, C = HS.CARDS, has = HS.has, chronicOn = HS.chronicOn, hw = HS.hw;

  function keepValue(st, p, c) {
    const card = C[c.id];
    switch (card.type) {
      case 'maint': return p.chronics.some((x) => !x.stab && card.systems.includes(x.sys)) ? 8 : 3;
      case 'bonne': return p.habit && C[p.habit].type === 'bonne' ? 0 : 6.5;
      case 'mauvaise': return 3;
      case 'soin': return card.id === 'solute' ? 7 : 6;
      case 'invasif':
        if (card.id === 'greffe') return HS.zeros(p) || p.chronics.some((x) => !x.stab) ? 7 : 2;
        return card.id === 'intubation' ? 3 : 5.5;
    }
    return { veto: 7, recherche: 4, placebo: 4, delegation: 2 }[card.id] || 3;
  }

  function pend(st, p) {
    const d = HS.pendingDmg(st, p);
    let total = 0;
    for (const s in d) total += d[s];
    return { d, total };
  }
  // Valeur pondérée des dégâts encore non bloqués sur un système.
  function dmgWeight(p, s, n) {
    let g = 0;
    for (let i = 0; i < n; i++) g += hw(p.hp[s] - 1 - i);
    return g;
  }

  function faceValue(st, p, f, ctx) {
    switch (f) {
      case 'S': return ctx.U > 0 ? 3 : 0.8;
      case '3': return ctx.wantPower ? 2.6 : 1.2;
      case '2': return ctx.wantPower ? 1.9 : 1.1;
      case 'P': return 1.8;
      case 'L': return ctx.wantL ? 3 : 1.7;
      case 'A': return ctx.wantA ? 3 : 1.2;
    }
    return 1;
  }

  function candidates(st, p) {
    const t = st.turn;
    const out = [];
    const { d, total: U } = pend(st, p);
    const allies = st.mode === 'coop' ? st.players.filter((x) => x.id !== p.id && HS.canHelp(st, p, x)) : [];
    const foes = st.mode === 'vs' ? st.players.filter((x) => x.id !== p.id && !x.dead) : [];
    const leader = foes.slice().sort((a, b) => HS.lostHP(a) - HS.lostHP(b))[0];
    for (const inst of p.hand) {
      const card = C[inst.id];
      const treat = HS.isTreatment(card);
      if (treat && has(p, 'deni') && t.treatments >= 1) continue;
      const free = treat && has(p, 'metaboliseur') && t.treatments === 0;
      if (!free && t.actions < 1) continue;
      let score = 0;
      const act = { type: 'play', uid: inst.uid };
      if (card.type === 'soin') {
        const pl = HS.planHeal(st, p, card.heal, 1, true);
        score = pl.gain + (card.atp && p.atp < HS.atpMax(st, p) ? 1.5 : 0);
        act.alloc = pl.alloc;
        for (const al of allies) {
          const g = HS.planHeal(st, al, card.heal, 1, true);
          if (g.gain * 0.9 > score) { score = g.gain * 0.9; act.target = al.id; act.alloc = g.alloc; }
        }
      } else if (card.type === 'maint') {
        const ch = p.chronics.find((c) => !c.stab && card.systems.includes(c.sys));
        if (ch) score = 9;
        if (card.bonus === 'shield') score += U > 0 ? 2.5 : 0;
        if (card.bonus === 'draw') score += 2;
        if (card.bonus === 'heal') score += HS.planHeal(st, p, { mode: 'pick', n: 2, amount: 2, systems: card.systems }, 1, true).gain;
        if (card.bonus === 'habit') score += p.habit && C[p.habit].type === 'mauvaise' ? 5 : p.atp < HS.atpMax(st, p) ? 1.2 : 0;
      } else if (card.type === 'invasif') {
        const b = has(p, 'brca') ? 3 : 0;
        if (card.id === 'chirurgie') {
          const pl = HS.planHeal(st, p, { mode: 'one', amount: card.amount + b, systems: SYS }, 1, true);
          score = pl.gain - 3; act.alloc = pl.alloc;
        } else if (card.id === 'dialyse') {
          card.systems.forEach((s) => { if (p.hp[s] > 0) for (let x = p.hp[s]; x < Math.min(p.max[s], card.amount + b); x++) score += hw(x - (d[s] || 0)); });
          score -= 3;
        } else if (card.id === 'intubation') {
          const risk = card.systems.filter((s) => p.hp[s] > 0 && p.hp[s] - (d[s] || 0) <= 0);
          if (risk.length) score = HS.zeros(p) + risk.length >= 2 ? 30 : 9;
        } else if (card.id === 'greffe') {
          if (has(p, 'hla')) continue;
          if (HS.zeros(p)) score = 18;
          else if (p.chronics.some((c) => !c.stab) && !p.hand.some((h) => C[h.id].type === 'maint' && p.chronics.some((c) => !c.stab && C[h.id].systems.includes(c.sys)))) score = 8;
        }
      } else if (card.type === 'action') {
        if (card.id === 'veto') {
          if (t.attack && !t.attack.cancelled) { for (const s in d) score += dmgWeight(p, s, d[s]); score += 1; if (score < 7) score = 0; }
          else if (leader && st.mode === 'vs') { score = 3.2; act.choice = 'vs'; act.target = leader.id; }
        } else if (card.id === 'placebo') {
          const def = st.lastSoin ? C[st.lastSoin].heal : { mode: 'one', amount: 3, systems: SYS };
          const pl = HS.planHeal(st, p, def, 1, true);
          score = pl.gain; act.alloc = pl.alloc;
          if (leader && score < 4.5) { score = 4.5; act.choice = 'vs'; act.target = leader.id; delete act.alloc; }
        } else if (card.id === 'recherche') score = p.hand.length <= HS.handLimit(st, p) - 1 ? 4.6 : 0;
        else if (card.id === 'delegation') { score = st.mode === 'vs' ? 3.6 : 3.3; if (allies.length) act.target = allies.slice().sort((a, b) => HS.totalHP(a) - HS.totalHP(b))[0].id; }
      } else if (card.type === 'bonne') {
        score = !p.habit || C[p.habit].type === 'mauvaise' ? 7.5 : 0;
      } else if (card.type === 'mauvaise') {
        const tg = foes.filter((f) => f.gene !== 'hla' && !(f.habit && C[f.habit].type === 'mauvaise')).sort((a, b) => HS.totalHP(b) - HS.totalHP(a))[0];
        if (tg) { score = 5; act.target = tg.id; }
      }
      const cost = HS.costOf(st, p, card, card.type === 'soin' && act.target !== undefined);
      if (score < 2.6 + 1.1 * (card.costDie ? 1 : cost)) continue;
      out.push({ inst, card, score: score - 0.25 * cost, cost, act });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  function botAction(st) {
    const t = st.turn;
    const p = st.players[t.pid];
    const mem = t.bot || (t.bot = {});

    // ----- choix en attente -----
    if (st.pending) {
      const pd = st.pending;
      if (pd.type === 'discard') {
        const order = p.hand.slice().sort((a, b) => keepValue(st, p, a) - keepValue(st, p, b));
        return { type: 'resolve', uids: order.slice(0, pd.n).map((c) => c.uid) };
      }
      if (pd.type === 'recherche') {
        const order = pd.cards.slice().sort((a, b) => keepValue(st, p, b) - keepValue(st, p, a));
        return { type: 'resolve', uids: order.slice(0, pd.keep).map((c) => c.uid) };
      }
      if (pd.type === 'iatro') {
        const live = SYS.filter((s) => p.hp[s] > 0).sort((a, b) => p.hp[b] - p.hp[a]);
        return { type: 'resolve', systems: live.slice(0, pd.n) };
      }
    }

    const { d, total: U } = pend(st, p);
    const unused = t.dice.map((x, i) => ({ f: x.f, i, used: x.used })).filter((x) => !x.used);
    const handTypes = p.hand.map((c) => C[c.id]);
    const hurt = SYS.some((s) => p.hp[s] - (d[s] || 0) <= p.max[s] - 4);
    const ctx = {
      U,
      wantPower: hurt && handTypes.some((c) => c.cost && !c.costDie),
      wantL: handTypes.some((c) => c.costDie === 'L' && (c.type !== 'maint' || p.chronics.some((x) => !x.stab && c.systems.includes(x.sys)))),
      wantA: hurt && handTypes.some((c) => c.costDie === 'A'),
    };
    const val = (x) => faceValue(st, p, x.f, ctx);

    // ----- 1. relances -----
    if (!mem.mullDone) {
      const low = unused.filter((x) => val(x) < 1.75).sort((a, b) => val(a) - val(b));
      if (low.length && t.freeReroll > 0) return { type: 'reroll', dice: [low[0].i] };
      if (low.length && t.mull > 0) return { type: 'reroll', dice: low.length === 1 && t.freeReroll > 0 ? [low[0].i] : low.map((x) => x.i) };
      mem.mullDone = true;
    }

    // ----- 2. Patch (soin 1 + relance) -----
    const patch = unused.find((x) => x.f === 'P');
    if (patch) {
      const sys = SYS.filter((s) => p.hp[s] > 0 && p.hp[s] < p.max[s]).sort((a, b) => p.hp[a] - (d[a] || 0) - (p.hp[b] - (d[b] || 0)))[0];
      const low = unused.filter((x) => x.i !== patch.i && val(x) < 1.75).sort((a, b) => val(a) - val(b))[0];
      return { type: 'die', i: patch.i, use: 'patch', sys, reroll: low ? low.i : undefined };
    }

    // ----- 3. Boucliers -----
    const shield = unused.find((x) => x.f === 'S');
    if (shield && U > 0) {
      const sv = HS.shieldValue(st, p);
      let best = null, bv = -1;
      for (const s in d) {
        if (d[s] <= 0) continue;
        const blocked = Math.min(sv, d[s]);
        let g = 0;
        for (let i = 0; i < blocked; i++) g += hw(p.hp[s] - d[s] + i);
        if (g > bv) { bv = g; best = s; }
      }
      if (best) return { type: 'die', i: shield.i, use: 'shield', sys: best };
    }

    // ----- 4. Réanimation -----
    const necro = SYS.filter((s) => p.hp[s] <= 0);
    if (necro.length && t.actions >= 1 && unused.length >= st.cfg.reanimDice && !p.hand.some((c) => c.id === 'greffe' && HS.costOf(st, p, C.greffe) <= t.power + p.atp)) {
      const lethal = Object.keys(d).some((s) => p.hp[s] > 0 && p.hp[s] - d[s] <= 0);
      if (!lethal) return { type: 'reanimate', sys: necro[0], dice: unused.slice().sort((a, b) => val(a) - val(b)).slice(0, st.cfg.reanimDice).map((x) => x.i) };
    }

    // ----- 5. Labo : piocher si le dé n'est pas réservé à un coût -----
    const labo = unused.find((x) => HS.dieIs(p, x, 'L') && x.f === 'L');
    if (labo && !ctx.wantL && p.hand.length < HS.handLimit(st, p) + 1) return { type: 'die', i: labo.i, use: 'draw' };

    // ----- 6. cartes -----
    const cands = candidates(st, p);
    for (const cd of cands) {
      const card = cd.card;
      let payDie = card.costDie ? HS.findDie(st, p, card.costDie) : -1;
      const act = Object.assign({}, cd.act);
      if (payDie >= 0 && card.id === 'adrenaline' && U > 0 && t.power + p.atp >= cd.cost) { payDie = -1; act.pay = 'power'; }
      if (payDie >= 0) {
        const extra = cd.cost - card.cost;
        if (t.power + p.atp >= extra) return act;
        continue;
      }
      act.pay = 'power';
      if (t.power >= cd.cost) return act;
      // convertir des dés en Puissance
      const pool = unused.filter((x) => x.f !== 'S' || U === 0).map((x) => ({ i: x.i, f: x.f, v: HS.dieValue(st, p, x.f) }));
      const need = cd.cost - t.power;
      const sum = pool.reduce((a, x) => a + x.v, 0);
      if (sum + p.atp < need) continue;
      if (sum >= need || p.atp < need) {
        // plus petit dé qui suffit, sinon le plus gros
        const enough = pool.filter((x) => x.v >= need).sort((a, b) => a.v - b.v || val(a) - val(b))[0];
        const pick = enough || pool.sort((a, b) => b.v - a.v)[0];
        if (pick && (sum >= need || pool.length)) return { type: 'die', i: pick.i, use: 'power' };
      }
      if (t.power + p.atp >= cd.cost) return act;
    }

    // ----- 7. dés restants -----
    if (labo && p.hand.length < HS.handLimit(st, p) + 1) return { type: 'die', i: labo.i, use: 'draw' };
    if (U > 0 && !chronicOn(p, 'cirrhose')) {
      const g = unused.find((x) => x.f !== 'S');
      if (g) {
        let best = null, bv = -1;
        for (const s in d) { if (d[s] > 0) { const v = hw(p.hp[s] - d[s]); if (v > bv) { bv = v; best = s; } } }
        if (best) return { type: 'die', i: g.i, use: 'guard', sys: best };
      }
    }
    return { type: 'end' };
  }

  // Joue le tour complet du joueur courant (simulateur).
  function botTurn(st, limit) {
    const pid = st.turn.pid, n = st.turn.n;
    let guard = limit || 60;
    while (!st.over && st.turn.pid === pid && st.turn.n === n && guard-- > 0) {
      const a = botAction(st);
      const r = HS.act(st, pid, a);
      if (!r.ok) {
        if (a.type === 'end') break;
        st.turn.bot.fail = (st.turn.bot.fail || 0) + 1;
        if (st.turn.bot.fail > 3 || st.pending) { if (st.pending) break; HS.act(st, pid, { type: 'end' }); }
      }
    }
    if (guard <= 0 && !st.over && st.turn.pid === pid && st.turn.n === n && !st.pending) HS.act(st, pid, { type: 'end' });
  }

  HS.botAction = botAction;
  HS.botTurn = botTurn;
  if (typeof module !== 'undefined' && module.exports) module.exports = HS;
})(typeof window !== 'undefined' ? window : globalThis);
