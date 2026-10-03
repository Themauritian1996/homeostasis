/* HOMEOSTASIS — interface (mobile d'abord). Aucune dépendance. */
(function () {
  const HS = window.HS, SYS = HS.SYS, C = HS.CARDS;
  const app = document.getElementById('app');
  const sheetEl = document.getElementById('sheet');
  const toastEl = document.getElementById('toast');
  const LS = { get: (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const S = {
    screen: 'home', name: LS.get('hs6-name', ''), host: null, room: null, link: null, view: null, seat: 0, lastSeat: null, handoff: null,
    lobby: null, pick: null, cs: null, delta: {}, lastTurn: 0,
    setup: { mode: 'coop', humans: 1, bots: 0, difficulty: 'resident', length: 'normale', names: [] },
  };

  // ---------- petits utilitaires d'affichage ----------
  const si = (s) => `<span class="si si-${s}">${HS.ICON[s]}</span>`;
  const SN = (s) => HS.SYS_INFO[s].name;
  const face = (f) => `<span class="df f${f}">${f === '2' || f === '3' ? `<i>${f}</i>` : HS.ICON[f]}</span>`;
  const rich = (t) => esc(t).replace(/\[([SPAL23])\]/g, (_, f) => face(f));
  const img = (id, cls) => `<img class="${cls || ''}" src="img/cards/${id}.webp" alt="${esc(C[id] ? C[id].name : id)}" draggable="false">`;
  const USE = { shield: 'Bouclier', guard: 'Protection', power: 'Puissance', patch: 'Patch', adren: 'Adrénaline', draw: 'Pioche', vision: 'Vision', cost: 'Coût', reanim: 'Réanim.' };

  let H = [], HSheet = [];
  const on = (fn, sheet) => { const a = sheet ? HSheet : H; a.push(fn); return `data-h="${a.length - 1}"`; };
  function bind(root, arr) {
    root.querySelectorAll('[data-h]').forEach((el) => {
      el.addEventListener('click', (e) => { e.stopPropagation(); arr[+el.dataset.h](e, el); });
    });
  }
  let toastT = null;
  function toast(m, bad) {
    toastEl.textContent = m;
    toastEl.className = 'toast' + (bad ? ' bad' : '');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.add('hidden'), 2600);
  }
  function openSheet(html, opt) {
    HSheet = [];
    const h = typeof html === 'function' ? html() : html;
    sheetEl.innerHTML = `<div class="sheet-bg" ${on(() => closeSheet(), true)}></div><div class="sheet-body ${opt && opt.cls ? opt.cls : ''}"><button class="x" ${on(() => closeSheet(), true)}>✕</button>${h}</div>`;
    sheetEl.classList.remove('hidden');
    bind(sheetEl, HSheet);
    sheetEl._re = typeof html === 'function' ? () => openSheet(html, opt) : null;
  }
  function closeSheet() { sheetEl.classList.add('hidden'); sheetEl.innerHTML = ''; sheetEl._re = null; S.cs = null; }
  const sheetOpen = () => !sheetEl.classList.contains('hidden');

  // ---------- contrôleur ----------
  function send(a) {
    if (S.link) { S.link.send(a); return; }
    const r = S.host.act(S.seat, a);
    if (!r.ok) toast(r.err, true);
  }
  function localSeat() {
    const h = S.host, st = h.st;
    const pid = st.turn ? st.turn.pid : 0;
    if (h.localSeats.includes(pid)) return pid;
    if (S.lastSeat !== null && h.localSeats.includes(S.lastSeat)) return S.lastSeat;
    return h.localSeats.length ? h.localSeats[0] : 0;
  }
  function onHostChange() {
    if (!S.host || !S.host.st) return;
    const seat = localSeat();
    if (S.host.localSeats.length > 1 && S.lastSeat !== null && seat !== S.lastSeat && !S.host.st.over) S.handoff = seat;
    S.seat = S.lastSeat = seat;
    setView(S.host.viewFor(seat));
  }
  function setView(v) {
    const prev = S.view;
    S.delta = {};
    if (prev && prev.players.length === v.players.length) {
      v.players.forEach((p, i) => SYS.forEach((s) => { const d = p.hp[s] - prev.players[i].hp[s]; if (d && prev.me === v.me) S.delta[i + s] = d; }));
    }
    if (v.turn && v.turn.n !== S.lastTurn) { S.lastTurn = v.turn.n; S.pick = null; S.rolled = true; if (S.cs) closeSheet(); }
    S.view = v;
    S.screen = 'game';
    render();
    if (sheetOpen() && sheetEl._re) sheetEl._re();
    S.rolled = false;
  }
  function quitGame() {
    if (S.host) S.host.stop();
    if (S.room) S.room.close();
    if (S.link) S.link.close();
    S.host = S.room = S.link = S.view = S.lobby = null;
    S.lastSeat = null; S.handoff = null;
    S.screen = 'home';
    closeSheet();
    render();
  }

  // ---------- écrans ----------
  function render() {
    H = [];
    let h = '';
    if (S.screen === 'home') h = homeHTML();
    else if (S.screen === 'setup') h = setupHTML();
    else if (S.screen === 'lobby') h = lobbyHTML();
    else if (S.screen === 'join') h = joinHTML();
    else if (S.screen === 'gallery') h = galleryHTML();
    else if (S.screen === 'game') h = gameHTML();
    const sc = app.querySelector('.hand');
    const sx = sc ? sc.scrollLeft : 0;
    app.innerHTML = h;
    bind(app, H);
    const sc2 = app.querySelector('.hand');
    if (sc2) sc2.scrollLeft = sx;
    const lg = app.querySelector('.ticker');
    if (lg) lg.scrollTop = lg.scrollHeight;
  }

  function nameField() {
    return `<label class="fld">Votre nom<input id="nm" maxlength="16" value="${esc(S.name)}" placeholder="Dr ..."></label>`;
  }
  function readName() {
    const el = document.getElementById('nm');
    if (el) { S.name = el.value.trim().slice(0, 16); LS.set('hs6-name', S.name); }
    return S.name || 'Dr Anonyme';
  }
  function hasSave() { try { return !!localStorage.getItem(HS.net.SAVE); } catch (e) { return false; } }

  function homeHTML() {
    return `<div class="home">
      <div class="logo"><div class="pulse"></div><h1>HOMEOSTASIS</h1><p>Protocole clinique · v${HS.VERSION}</p></div>
      ${nameField()}
      <button class="big" ${on(() => { readName(); S.screen = 'setup'; render(); })}>▶ Jouer (solo / même écran)</button>
      ${hasSave() ? `<button class="big alt" ${on(resumeSave)}>⏯ Reprendre la partie</button>` : ''}
      <button class="big" ${on(createRoom)}>🌐 Créer une partie en ligne</button>
      <button class="big" ${on(() => { readName(); S.screen = 'join'; render(); })}>🔑 Rejoindre avec un code</button>
      <div class="row2">
        <button ${on(showRules)}>📖 Règles</button>
        <button ${on(() => { S.screen = 'gallery'; render(); })}>🃏 Cartes</button>
      </div>
      <p class="fine">Maintenez les 5 systèmes vitaux en vie. 1 à 5 joueurs · Coop ou VS.</p>
    </div>`;
  }

  function seg(label, key, opts, obj) {
    obj = obj || S.setup;
    return `<div class="seg"><span>${label}</span><div>${opts.map(([v, l]) => `<button class="${obj[key] === v ? 'on' : ''}" ${on(() => { obj[key] = v; if (S.room) pushLobby(); render(); })}>${l}</button>`).join('')}</div></div>`;
  }
  function optionsHTML(o) {
    return seg('Mode', 'mode', [['coop', 'Coopératif'], ['vs', 'Compétitif']], o)
      + (o.mode === 'coop' ? seg('Difficulté', 'difficulty', [['interne', 'Interne'], ['resident', 'Résident'], ['patron', 'Patron']], o) : '')
      + seg('Durée', 'length', [['courte', 'Courte'], ['normale', 'Normale'], ['marathon', 'Marathon']], o);
  }
  function setupHTML() {
    const o = S.setup;
    const total = o.humans + o.bots;
    const fix = () => { if (o.mode === 'vs' && o.humans + o.bots < 2) o.bots = 1; if (o.humans + o.bots > 5) o.bots = 5 - o.humans; };
    fix();
    const step = (k, d, min, max) => on(() => { o[k] = Math.max(min, Math.min(max, o[k] + d)); fix(); render(); });
    return `<div class="panel">
      <h2>Nouvelle partie</h2>
      ${optionsHTML(o)}
      <div class="seg"><span>Joueurs sur cet écran</span><div class="stp"><button ${step('humans', -1, 1, 4)}>−</button><b>${o.humans}</b><button ${step('humans', 1, 1, 4)}>+</button></div></div>
      <div class="seg"><span>Bots ${o.mode === 'coop' ? 'alliés' : 'adversaires'}</span><div class="stp"><button ${step('bots', -1, 0, 4)}>−</button><b>${o.bots}</b><button ${step('bots', 1, 0, 4)}>+</button></div></div>
      ${o.humans > 1 ? Array.from({ length: o.humans - 1 }, (_, i) => `<label class="fld">Joueur ${i + 2}<input class="pn" data-i="${i}" maxlength="16" value="${esc(o.names[i] || 'Dr ' + (i + 2))}"></label>`).join('') : ''}
      <p class="fine">${total} joueur${total > 1 ? 's' : ''} · ${o.mode === 'coop' ? 'Victoire : épuiser la pioche de Pathologies sans perdre de patient.' : 'Victoire : dernier survivant, ou patient le plus proche de sa pleine santé.'}</p>
      <button class="big" ${on(startLocal)}>Commencer</button>
      <button class="link" ${on(() => { S.screen = 'home'; render(); })}>← Retour</button>
    </div>`;
  }
  function startLocal() {
    const o = S.setup;
    document.querySelectorAll('.pn').forEach((el) => (o.names[+el.dataset.i] = el.value.trim()));
    const seats = [{ name: S.name || 'Dr 1' }];
    for (let i = 1; i < o.humans; i++) seats.push({ name: o.names[i - 1] || 'Dr ' + (i + 1) });
    const BN = ['Dr Bot', 'Dr Bit', 'Dr Byte', 'Dr Chip'];
    for (let i = 0; i < o.bots; i++) seats.push({ name: BN[i], bot: true });
    S.host = new HS.net.Host(onHostChange);
    S.lastSeat = null;
    S.host.start({ mode: o.mode, difficulty: o.difficulty, length: o.length }, seats);
  }
  function resumeSave() {
    try {
      const st = JSON.parse(localStorage.getItem(HS.net.SAVE));
      S.host = new HS.net.Host(onHostChange);
      S.lastSeat = null;
      S.host.resume(st);
    } catch (e) { toast('Sauvegarde illisible.', true); }
  }

  // ---------- en ligne ----------
  function createRoom() {
    readName();
    if (!HS.net.available()) return toast('Module réseau indisponible.', true);
    S.lobby = { code: null, opts: { mode: 'coop', difficulty: 'resident', length: 'normale' }, bots: 0, host: true };
    S.host = new HS.net.Host(onHostChange);
    S.room = HS.net.openRoom({
      onReady: (code) => { S.lobby.code = code; render(); },
      onLobby: (guests, conn) => {
        const st = S.host.st;
        if (st) { // reconnexion en cours de partie
          const p = st.players.find((x) => x.away && x.name === conn.hsName) || st.players.find((x) => x.away);
          if (p) { p.away = false; conn.hsSeat = p.id; S.host.conns[p.id] = conn; toast(`${p.name} est de retour.`); S.host.sync(); }
          else conn.send({ t: 'err', m: 'La partie est déjà commencée.' });
          return;
        }
        pushLobby(); render();
      },
      onAct: (conn, a) => {
        if (conn.hsSeat === undefined || !S.host.st) return;
        const r = S.host.act(conn.hsSeat, a);
        if (!r.ok && conn.open) conn.send({ t: 'err', m: r.err });
      },
      onLeave: (conn) => {
        const st = S.host.st;
        if (st && conn.hsSeat !== undefined) {
          const p = st.players[conn.hsSeat];
          p.away = true; delete S.host.conns[conn.hsSeat];
          toast(`${p.name} s'est déconnecté : un bot prend le relais.`, true);
          S.host.sync();
        } else { pushLobby(); render(); }
      },
      onError: (m) => toast(m, true),
    });
    S.screen = 'lobby';
    render();
  }
  function lobbyNames() {
    const L = S.lobby;
    const BN = ['Dr Bot', 'Dr Bit', 'Dr Byte', 'Dr Chip'];
    return [S.name || 'Hôte'].concat(S.room.guests.map((g) => g.hsName)).concat(Array.from({ length: L.bots }, (_, i) => BN[i] + ' 🤖'));
  }
  function pushLobby() {
    if (!S.room) return;
    const info = { t: 'lobby', code: S.lobby.code, names: lobbyNames(), opts: S.lobby.opts };
    S.room.guests.forEach((g) => g.open && g.send(info));
  }
  function lobbyHTML() {
    const L = S.lobby;
    if (!L.host) {
      return `<div class="panel"><h2>Salon ${esc(L.code || '')}</h2>
        <p class="fine">${L.names ? 'En attente du lancement par l\'hôte…' : 'Connexion…'}</p>
        <ul class="plist">${(L.names || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
        ${L.opts ? `<p class="fine">Mode ${L.opts.mode === 'coop' ? 'coopératif' : 'compétitif'} · durée ${L.opts.length}</p>` : ''}
        <button class="link" ${on(quitGame)}>← Quitter</button></div>`;
    }
    const names = lobbyNames();
    const n = names.length;
    const can = n >= (L.opts.mode === 'vs' ? 2 : 1) && n <= 5;
    return `<div class="panel"><h2>Partie en ligne</h2>
      <div class="code">${L.code ? esc(L.code) : '…'}</div>
      <p class="fine">Donnez ce code aux autres joueurs (menu « Rejoindre avec un code »).</p>
      ${optionsHTML(L.opts)}
      <div class="seg"><span>Bots</span><div class="stp"><button ${on(() => { L.bots = Math.max(0, L.bots - 1); pushLobby(); render(); })}>−</button><b>${L.bots}</b><button ${on(() => { if (n < 5) L.bots++; pushLobby(); render(); })}>+</button></div></div>
      <ul class="plist">${names.map((x, i) => `<li>${i === 0 ? '👑 ' : ''}${esc(x)}</li>`).join('')}</ul>
      <button class="big" ${can && L.code ? '' : 'disabled'} ${on(startOnline)}>Lancer la partie (${n} joueur${n > 1 ? 's' : ''})</button>
      <button class="link" ${on(quitGame)}>← Annuler</button></div>`;
  }
  function startOnline() {
    const L = S.lobby;
    const seats = [{ name: S.name || 'Hôte' }];
    S.room.guests.forEach((g) => { g.hsSeat = seats.length; seats.push({ name: g.hsName, conn: g }); });
    const BN = ['Dr Bot', 'Dr Bit', 'Dr Byte', 'Dr Chip'];
    for (let i = 0; i < L.bots && seats.length < 5; i++) seats.push({ name: BN[i], bot: true });
    S.lastSeat = null;
    S.host.start(L.opts, seats);
  }
  function joinHTML() {
    return `<div class="panel"><h2>Rejoindre une partie</h2>
      ${nameField()}
      <label class="fld">Code du salon<input id="code" maxlength="5" autocapitalize="characters" autocomplete="off" placeholder="ABCDE" style="text-transform:uppercase;letter-spacing:6px;text-align:center;font-size:26px"></label>
      <button class="big" ${on(doJoin)}>Rejoindre</button>
      <button class="link" ${on(() => { S.screen = 'home'; render(); })}>← Retour</button></div>`;
  }
  function doJoin() {
    const name = readName();
    const code = (document.getElementById('code').value || '').toUpperCase().trim();
    if (code.length !== 5) return toast('Le code comporte 5 caractères.', true);
    if (!HS.net.available()) return toast('Module réseau indisponible.', true);
    S.lobby = { code, host: false };
    S.screen = 'lobby';
    S.link = HS.net.joinRoom(code, name, {
      onOpen: () => render(),
      onLobby: (m) => { S.lobby.names = m.names; S.lobby.opts = m.opts; if (S.screen === 'lobby') render(); },
      onView: (v) => { S.seat = v.me; setView(v); },
      onError: (m) => toast(m, true),
      onClose: () => { toast('Connexion à l\'hôte perdue.', true); if (S.screen !== 'game') quitGame(); },
    });
    render();
  }

  // ---------- règles / galerie ----------
  function showRules() {
    openSheet('<iframe class="rules" src="regles.html" title="Règles"></iframe>', { cls: 'full' });
  }
  function galleryHTML() {
    const groups = [['aigu', 'Pathologies aiguës'], ['chronique', 'Pathologies chroniques'], ['soin', 'Soins immédiats'], ['maint', 'Médication'], ['invasif', 'Soins critiques'], ['action', 'Actions'], ['gene', 'Profils génétiques'], ['bonne', 'Bonnes habitudes'], ['mauvaise', 'Mauvaises habitudes']];
    return `<div class="gallery"><div class="ghead"><button class="link" ${on(() => { S.screen = 'home'; render(); })}>← Retour</button><h2>Les ${Object.values(C).reduce((a, c) => a + (c.qty || 1), 0)} cartes</h2></div>
      ${groups.map(([t, l]) => `<h3>${l}</h3><div class="grid">${HS.byType(t).map((c) => `<div class="gc" ${on(() => zoom(c.id))}>${img(c.id)}${c.qty ? `<b>×${c.qty}</b>` : ''}</div>`).join('')}</div>`).join('')}</div>`;
  }
  function zoom(id, extra) {
    openSheet(`<div class="zoom">${img(id)}${extra || ''}</div>`, { cls: 'zoomsheet' });
  }

  // ---------- partie ----------
  function gauges(v, p, big) {
    const t = v.turn;
    const pend = t && t.pid === p.id && !v.over ? HS.pendingDmg(v, p) : {};
    return SYS.map((s) => {
      const hp = p.hp[s], mx = p.max[s], pd = Math.min(hp, pend[s] || 0);
      let segs = '';
      for (let i = 1; i <= mx; i++) segs += `<i class="${i <= hp - pd ? 'on' : i <= hp ? 'hit' : ''}"></i>`;
      const d = S.delta[p.id + s];
      const ch = p.chronics.find((c) => c.sys === s);
      return `<div class="g ${hp <= 0 ? 'necro' : hp <= 3 ? 'low' : ''}" style="--sc:${HS.SYS_INFO[s].color}">
        <span class="gi">${si(s)}</span>${big ? `<span class="gn">${SN(s)}</span>` : ''}
        <div class="segs">${segs}</div>
        <span class="gv">${hp <= 0 ? '☠' : hp}${big ? `<small>/${mx}</small>` : ''}</span>
        ${big && pd ? `<span class="gp">-${pd}</span>` : ''}${big && ch ? `<span class="gc2 ${ch.stab ? 'stab' : ''}" title="${esc(C[ch.id].name)}">${ch.stab ? '💊' : '🔥'}</span>` : ''}
        ${d ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : ''}
      </div>`;
    }).join('');
  }
  function atpHTML(p) {
    let s = '';
    for (let i = 0; i < p.atpMax; i++) s += `<i class="${i < p.atp ? 'on' : ''}"></i>`;
    return `<span class="atp" title="ATP"><span class="si">${HS.ICON.atp}</span>${s}</span>`;
  }
  function playerSheet(v, p) {
    const lines = p.chronics.map((c) => `<div class="chr ${c.stab ? 'stab' : ''}" ${on(() => zoom(c.id), true)}>${img(c.id)}<span>${c.stab ? 'Stabilisée' : 'Active'}</span></div>`).join('');
    return `<h3>${esc(p.name)}${p.bot ? ' 🤖' : ''}${p.dead ? ' ☠️' : ''}</h3>
      <div class="pboard">${gauges(v, p, true)}</div>
      <div class="pcards"><div ${on(() => zoom(p.gene), true)}>${img(p.gene)}<span>Profil</span></div>${p.habit ? `<div ${on(() => zoom(p.habit), true)}>${img(p.habit)}<span>Habitude</span></div>` : ''}${lines}</div>
      <p class="fine">${atpHTML(p)} · Main : ${p.handCount}/${p.handLimit} cartes</p>
      ${p.hand && p.id !== v.me ? `<div class="mini-hand">${p.hand.map((c) => `<span ${on(() => zoom(c.id), true)}>${img(c.id)}</span>`).join('')}</div>` : ''}`;
  }

  function gameHTML() {
    const v = S.view, me = v.players[v.me], t = v.turn;
    const tp = t ? v.players[t.pid] : null;
    const mine = t && t.pid === v.me && !v.over;
    const canAct = mine && !v.pending && t.phase === 'reponse';

    if (S.handoff !== null && !v.over) {
      const p = v.players[S.handoff];
      return `<div class="handoff" ${on(() => { S.handoff = null; render(); })}><div><h2>Au tour de</h2><h1>${esc(p.name)}</h1><p>Passez l'appareil, puis touchez pour continuer.</p></div></div>`;
    }

    // --- bandeau ---
    let h = `<div class="game"><header class="top">
      <button ${on(menuSheet)}>☰</button>
      <div class="status"><b>${v.mode === 'coop' ? (v.players.length === 1 ? 'SOLO' : 'COOP') : 'VS'}</b> · Manche ${v.round} · <span title="Pathologies restantes">🟥 ${v.pathoCount}/${v.pathoTotal}</span> · <span title="Pioche">🃏 ${v.deckCount}</span></div>
      <button ${on(logSheet)}>📜</button></header>`;

    // --- autres joueurs ---
    const others = v.players.filter((p) => p.id !== v.me);
    if (others.length) {
      h += `<section class="others">${others.map((p) => `<div class="op ${t && t.pid === p.id ? 'active' : ''} ${p.dead ? 'dead' : ''}" ${on(() => openSheet(() => playerSheet(S.view, S.view.players[p.id])))}>
        <div class="opn">${esc(p.name)}${p.bot ? ' 🤖' : ''}${p.dead ? ' ☠️' : ''}</div>
        <div class="opg">${gauges(v, p, false)}</div>
        <div class="opi">${atpHTML(p)} 🃏${p.handCount}${p.chronics.some((c) => !c.stab) ? ' 🔥' : ''}${p.habit ? (C[p.habit].type === 'bonne' ? ' 🟡' : ' 🟠') : ''}</div></div>`).join('')}</section>`;
    }

    // --- arène : pathologie du tour ---
    h += '<section class="arena">';
    if (t && tp) {
      const a = t.attack;
      h += `<div class="who ${mine ? 'me' : ''}">${mine ? 'À VOUS DE JOUER' : 'Tour de ' + esc(tp.name)}</div><div class="arow">`;
      if (t.patho) h += `<div class="pcard" ${on(() => zoom(t.patho))}>${img(t.patho)}</div>`;
      h += '<div class="ainfo">';
      if (a && !a.cancelled && Object.keys(a.dmg).length) {
        h += `<div class="atitle">${a.crisis ? '💥 Crise aiguë' : '🟥 ' + esc(C[a.id].name)}</div>`;
        h += Object.keys(a.dmg).map((s) => { const sh = a.shield[s] || 0, rem = Math.max(0, a.dmg[s] - sh); return `<div class="arow2 ${rem ? '' : 'ok'}">${si(s)} <b>-${a.dmg[s]}</b>${sh ? ` <span class="sh">${face('S')}${sh}</span>` : ''} <span class="rem">→ ${rem ? '-' + rem + ' PV' : 'bloqué'}</span></div>`; }).join('');
        if (a.fx) h += `<div class="afx"><b>${esc(C[a.id].fxName)}</b> — ${rich(HS.cardText(C[a.id], v.cfg))}</div>`;
        if (t.adrenUsed || a.danger) h += '<div class="afx warn">⚡ Collatéral actif : tout dégât subi se propage au système suivant.</div>';
      } else if (a && a.cancelled) h += '<div class="atitle ok">⛔ Attaque annulée</div>';
      else if (t.patho) h += `<div class="atitle">${esc(C[t.patho].name)}</div><div class="afx">${C[t.patho].type === 'chronique' ? 'Maladie chronique installée. Pas d\'attaque ce tour.' : 'Sans effet (tissu déjà nécrosé).'}</div>`;
      else h += '<div class="atitle ok">Aucune pathologie ce tour</div>';
      if (v.nextPatho) h += `<div class="next" ${on(() => zoom(v.nextPatho))}>🔮 Prochaine : <u>${esc(C[v.nextPatho].name)}</u></div>`;
      if (!mine) h += `<div class="odice">${t.dice.map((d) => `<span class="die sm ${d.used ? 'used' : ''}">${face(d.f)}</span>`).join('')}</div>`;
      h += '</div></div>';
    }
    h += `<div class="ticker">${v.log.slice(-4).map((l) => `<div class="l ${l.k}">${esc(l.m)}</div>`).join('')}</div></section>`;

    // --- mon plateau ---
    h += `<section class="board ${mine ? 'mine' : ''} ${me.dead ? 'dead' : ''}">
      <div class="bhead"><b>${esc(me.name)}</b>${atpHTML(me)}<span class="tot">❤ ${me.total}</span>
        <span class="mini" ${on(() => zoom(me.gene))}>${img(me.gene)}</span>${me.habit ? `<span class="mini" ${on(() => zoom(me.habit))}>${img(me.habit)}</span>` : ''}
        ${me.chronics.map((c) => `<span class="mini chr ${c.stab ? 'stab' : ''}" ${on(() => zoom(c.id))}>${img(c.id)}</span>`).join('')}</div>
      <div class="pboard">${gauges(v, me, true)}</div></section>`;

    // --- dés + commandes ---
    if (mine) {
      const unused = t.dice.filter((d) => !d.used).length;
      const necro = SYS.filter((s) => me.hp[s] <= 0);
      h += `<section class="dice ${S.rolled ? 'rolled' : ''}">${t.dice.map((d, i) => {
        const sel = S.pick && S.pick.set.includes(i);
        return `<button class="die ${d.used ? 'used' : ''} ${sel ? 'sel' : ''}" ${d.used || !canAct ? 'disabled' : ''} ${on(() => dieTap(i))}>${face(d.f)}${d.used ? `<small>${USE[d.as] || ''}</small>` : ''}</button>`;
      }).join('')}
        <div class="res"><span>Puissance <b>${t.power}</b></span><span>Actions <b>${t.actions}</b></span>${t.adrenArmed ? '<span class="arm">⚡×2 armée</span>' : ''}</div></section>`;
      if (S.pick) {
        const need = S.pick.kind === 'reanim' ? v.cfg.reanimDice : 1;
        h += `<section class="cmd"><span class="hint">${S.pick.kind === 'reanim' ? `Choisissez ${need} dés à sacrifier` : 'Choisissez les dés à relancer'}</span>
          <button ${on(() => { S.pick = null; render(); })}>Annuler</button>
          <button class="go" ${S.pick.set.length >= need ? '' : 'disabled'} ${on(confirmPick)}>Valider</button></section>`;
      } else if (canAct) {
        h += `<section class="cmd">
          ${t.mull + t.freeReroll > 0 && unused ? `<button ${on(() => { S.pick = { kind: 'mull', set: [] }; render(); })}>🔄 Relancer (${t.mull}${t.freeReroll ? '+1' : ''})</button>` : ''}
          ${necro.length && t.actions > 0 && unused >= v.cfg.reanimDice ? `<button class="warn" ${on(() => { S.pick = { kind: 'reanim', set: [], sys: necro[0] }; render(); })}>🚑 Réanimer</button>` : ''}
          ${me.habit === 'reseau' && !t.reseauUsed && me.hand.length ? `<button ${on(reseauSheet)}>🤝 Réseau</button>` : ''}
          <button class="go" ${on(endTurnTap)}>Fin du tour ▶</button></section>`;
      }
    }

    // --- main ---
    h += `<section class="hand ${mine ? '' : 'idle'}">${me.hand.length ? me.hand.map((c) => {
      const card = C[c.id];
      const ok = canAct && playable(v, me, card);
      return `<div class="hc ${ok ? 'ok' : ''}" ${on(() => cardTap(c.uid))}>${img(c.id)}</div>`;
    }).join('') : '<div class="empty">Main vide</div>'}</section>`;
    h += '</div>';

    // --- choix en attente / fin de partie ---
    if (v.over) h += overHTML(v);
    else if (v.pending && v.pending.pid === v.me) setTimeout(() => pendingSheet(), 0);
    return h;
  }

  function playable(v, p, card) {
    const t = v.turn;
    const treat = HS.isTreatment(card);
    const free = treat && HS.has(p, 'metaboliseur') && t.treatments === 0;
    if (!free && t.actions < 1) return false;
    if (treat && HS.has(p, 'deni') && t.treatments >= 1) return false;
    if (card.type === 'mauvaise' && v.mode !== 'vs') return false;
    if (card.costDie && HS.findDie(v, p, card.costDie) >= 0) return t.power + p.atp >= HS.costOf(v, p, card) - card.cost;
    const pool = t.dice.filter((d) => !d.used).reduce((a, d) => a + HS.dieValue(v, p, d.f), 0);
    return t.power + p.atp + pool >= HS.costOf(v, p, card);
  }

  function overHTML(v) {
    let title, sub;
    if (v.mode === 'coop') { title = v.over.result === 'victoire' ? '🏆 VICTOIRE' : '☠️ DÉFAITE'; sub = v.over.reason; }
    else { const w = (v.over.winners || []).map((i) => v.players[i].name); title = w.length > 1 ? '🤝 ÉGALITÉ' : (v.over.winners || []).includes(v.me) ? '🏆 VICTOIRE' : '🏁 FIN DE PARTIE'; sub = `${w.join(' & ')} — ${v.over.reason}`; }
    return `<div class="over"><div class="obox"><h1>${title}</h1><p>${esc(sub)}</p>
      <table>${v.players.map((p) => `<tr class="${p.dead ? 'dead' : ''}"><td>${esc(p.name)}</td><td>${SYS.map((s) => `${si(s)}${p.hp[s]}`).join(' ')}</td><td>❤ ${p.total}</td></tr>`).join('')}</table>
      <p class="fine">${v.turnCount} tours · ${v.pathoTotal - v.pathoCount}/${v.pathoTotal} pathologies affrontées</p>
      ${S.link ? '' : `<button class="big" ${on(() => { const hst = S.host; if (S.room) { hst.stop(); S.view = null; S.screen = 'lobby'; render(); } else { S.view = null; S.screen = 'setup'; hst.stop(); render(); } })}>Rejouer</button>`}
      <button class="link" ${on(quitGame)}>Menu principal</button></div></div>`;
  }

  // ---------- interactions : dés ----------
  function dieTap(i) {
    const v = S.view, t = v.turn;
    if (S.pick) {
      const k = S.pick.set.indexOf(i);
      if (k >= 0) S.pick.set.splice(k, 1);
      else S.pick.set.push(i);
      return render();
    }
    dieSheet(i);
  }
  function confirmPick() {
    const pk = S.pick;
    S.pick = null;
    if (pk.kind === 'mull') send({ type: 'reroll', dice: pk.set });
    else send({ type: 'reanimate', sys: pk.sys, dice: pk.set });
    if (S.link) render();
  }
  function dieSheet(i) {
    const st = { step: 'use', sys: null };
    openSheet(() => {
      const v = S.view, t = v.turn, me = v.players[v.me], d = t.dice[i];
      if (!d || d.used) { setTimeout(closeSheet, 0); return ''; }
      const a = t.attack && !t.attack.cancelled ? t.attack : null;
      const targets = a ? Object.keys(a.dmg) : [];
      const rem = (s) => Math.max(0, a.dmg[s] - (a.shield[s] || 0));
      const go = (act) => on(() => { closeSheet(); send(Object.assign({ type: 'die', i }, act)); }, true);
      let h = `<h3>Dé ${face(d.f)} ${HS.FACE_INFO[d.f].name}</h3><div class="opts">`;
      if (st.step === 'patch') {
        h += '<p class="fine">Relancer un autre dé ?</p>';
        t.dice.forEach((x, k) => { if (!x.used && k !== i) h += `<button ${go({ use: 'patch', sys: st.sys, reroll: k })}>Relancer ${face(x.f)}</button>`; });
        h += `<button ${go({ use: 'patch', sys: st.sys })}>Ne rien relancer</button></div>`;
        return h;
      }
      if (d.f === 'S') targets.forEach((s) => { h += `<button class="pri" ${go({ use: 'shield', sys: s })}>Bouclier : bloque ${HS.shieldValue(v, me)} sur ${si(s)} ${SN(s)} <small>(reste ${rem(s)})</small></button>`; });
      if (d.f === 'P') {
        const dry = t.fx === 'deshydratation';
        const live = SYS.filter((s) => me.hp[s] > 0 && me.hp[s] < me.max[s]);
        if (dry || !live.length) h += `<button class="pri" ${on(() => { st.step = 'patch'; st.sys = null; sheetEl._re(); }, true)}>🩹 Patch : relancer un dé${dry ? ' (pas de soin : déshydratation)' : ''}</button>`;
        else live.forEach((s) => { h += `<button class="pri" ${on(() => { st.step = 'patch'; st.sys = s; sheetEl._re(); }, true)}>🩹 Soigner 1 PV : ${si(s)} ${SN(s)} (${me.hp[s]}/${me.max[s]})</button>`; });
      }
      if (d.f === 'A') h += `<button class="pri" ${t.adrenArmed ? 'disabled' : ''} ${go({ use: 'adren' })}>⚡ Armer : double le prochain Soin immédiat <small>(active le Collatéral)</small></button>`;
      if (HS.dieIs(me, d, 'L')) {
        h += `<button class="pri" ${go({ use: 'draw' })}>🧪 Piocher ${HS.has(me, 'curiosite') ? 2 : 1} carte${HS.has(me, 'curiosite') ? 's' : ''}</button>`;
        h += `<button ${go({ use: 'vision' })}>🔮 Vision : voir la prochaine Pathologie</button>`;
      }
      h += `<button ${go({ use: 'power' })}>💪 Puissance +${HS.dieValue(v, me, d.f)}${HS.has(me, 'hemochromatose') && d.f === '3' ? ' <small>(Digestif -1)</small>' : ''}</button>`;
      if (targets.length && !HS.chronicOn(me, 'cirrhose')) targets.forEach((s) => { h += `<button ${go({ use: 'guard', sys: s })}>✋ Protection d'urgence : bloque 1 sur ${si(s)} ${SN(s)} <small>(reste ${rem(s)})</small></button>`; });
      if (['S', 'A', 'L'].includes(d.f) || HS.dieIs(me, d, 'L')) h += '<p class="fine">Certaines cartes se paient directement avec ce dé (voir « Coût »).</p>';
      return h + '</div>';
    });
  }
  function endTurnTap() {
    const v = S.view, t = v.turn, me = v.players[v.me];
    const pend = HS.pendingDmg(v, me);
    const lethal = SYS.filter((s) => me.hp[s] > 0 && me.hp[s] - (pend[s] || 0) <= 0).length + HS.zeros(me) >= 2;
    const unused = t.dice.filter((d) => !d.used).length;
    if (!lethal && !(unused && Object.values(pend).some((x) => x > 0))) return send({ type: 'end' });
    openSheet(() => `<h3>${lethal ? '⚠️ Votre patient va mourir !' : 'Terminer le tour ?'}</h3><p class="fine">${lethal ? 'Deux systèmes seront à 0 PV après la résolution.' : `Il vous reste ${unused} dé(s) non utilisé(s) et des dégâts non bloqués.`}</p>
      <div class="opts"><button class="pri" ${on(() => { closeSheet(); send({ type: 'end' }); }, true)}>Terminer quand même</button><button ${on(closeSheet, true)}>Continuer à jouer</button></div>`);
  }

  // ---------- interactions : cartes ----------
  function cardTap(uid) {
    const v = S.view, me = v.players[v.me];
    const inst = me.hand.find((c) => c.uid === uid);
    if (!inst) return;
    const mine = v.turn && v.turn.pid === v.me && !v.over && !v.pending;
    if (!mine) return zoom(inst.id);
    S.cs = { uid, target: v.me, alloc: null, choice: null, pay: null, sys: null, chronic: null };
    openSheet(cardSheet, { cls: 'cardsheet' });
  }
  function cardSheet() {
    const v = S.view, me = v.players[v.me], t = v.turn, cs = S.cs;
    if (!cs) return '';
    const inst = me.hand.find((c) => c.uid === cs.uid);
    if (!inst || !t || t.pid !== v.me) { setTimeout(closeSheet, 0); return ''; }
    const card = C[inst.id];
    const re = () => sheetEl._re();
    const target = v.players[cs.target] || me;
    const others = v.players.filter((p) => p.id !== v.me && !p.dead);
    const helping = card.type === 'soin' && target.id !== me.id;
    const cost = HS.costOf(v, me, card, helping);
    const dieIdx = card.costDie ? HS.findDie(v, me, card.costDie) : -1;
    if (cs.pay === null) cs.pay = dieIdx >= 0 ? 'die' : 'power';
    if (dieIdx < 0) cs.pay = 'power';
    const have = t.power + me.atp;
    const need = cs.pay === 'die' ? cost - card.cost : cost;
    const chips = (list, cur, set, lab) => `<div class="chips">${list.map((x) => `<button class="${cur(x) ? 'on' : ''}" ${on(() => { set(x); re(); }, true)}>${lab(x)}</button>`).join('')}</div>`;
    let opt = '';
    let block = null;
    const treat = HS.isTreatment(card);
    const free = treat && HS.has(me, 'metaboliseur') && t.treatments === 0;
    if (!free && t.actions < 1) block = "Plus d'Action ce tour.";
    if (treat && HS.has(me, 'deni') && t.treatments >= 1) block = 'Déni : 1 seul Traitement par tour.';

    // cible joueur
    const vsCard = v.mode === 'vs' && (card.id === 'veto' || card.id === 'placebo');
    if (card.type === 'soin' && v.mode === 'coop' && others.length) {
      const ok = [me].concat(others.filter((p) => HS.canHelp(v, me, p)));
      if (ok.length > 1) opt += `<div class="ol">Patient</div>` + chips(ok, (p) => p.id === cs.target, (p) => { cs.target = p.id; cs.alloc = null; }, (p) => (p.id === me.id ? 'Moi' : esc(p.name) + ` <small>(+${v.cfg.helpCost})</small>`));
    }
    if (vsCard) {
      opt += '<div class="ol">Utilisation</div>' + chips(['self', 'vs'], (x) => (cs.choice === 'vs') === (x === 'vs'), (x) => { cs.choice = x === 'vs' ? 'vs' : null; if (x === 'vs' && cs.target === me.id && others[0]) cs.target = others[0].id; if (x !== 'vs') cs.target = me.id; },
        (x) => (x === 'vs' ? (card.id === 'veto' ? 'Veto sur un adversaire' : 'Nocebo sur un adversaire') : card.id === 'veto' ? "Annuler l'attaque" : 'Placebo (me soigner)'));
      if (cs.choice === 'vs') opt += chips(others, (p) => p.id === cs.target, (p) => { cs.target = p.id; }, (p) => esc(p.name));
    }
    if (card.type === 'mauvaise') {
      if (v.mode !== 'vs') block = 'Les Mauvaises Habitudes ne se jouent qu\'en mode compétitif.';
      else { if (cs.target === me.id && others[0]) cs.target = others[0].id; opt += '<div class="ol">Adversaire</div>' + chips(others, (p) => p.id === cs.target, (p) => { cs.target = p.id; }, (p) => esc(p.name)); }
    }
    if (card.id === 'delegation' && v.mode === 'coop' && others.length) {
      const ok = others.filter((p) => HS.canHelp(v, me, p));
      if (ok.length) { if (cs.target === me.id) cs.target = ok[0].id; opt += '<div class="ol">Allié</div>' + chips(ok, (p) => p.id === cs.target, (p) => { cs.target = p.id; }, (p) => esc(p.name)); }
    }

    // répartition des soins
    let def = null, mult = 1;
    if (card.type === 'soin') { def = card.heal; mult = t.adrenArmed ? 2 : 1; }
    else if (card.id === 'chirurgie') def = { mode: 'one', amount: card.amount + (HS.has(me, 'brca') ? 3 : 0), systems: SYS };
    else if (card.bonus === 'heal') def = { mode: 'pick', n: 2, amount: 2, systems: card.systems };
    else if (card.id === 'placebo' && cs.choice !== 'vs') def = v.lastSoin ? C[v.lastSoin].heal : { mode: 'one', amount: 3, systems: SYS };
    if (def) {
      const tg = card.type === 'soin' ? target : me;
      if (!cs.alloc) cs.alloc = HS.planHeal(v, tg, def, mult, true).alloc;
      const amt = def.amount * mult;
      const live = def.systems.filter((s) => tg.hp[s] > 0);
      const lim2 = HS.has(tg, 'negligence') && def.mode !== 'one';
      const maxSys = def.mode === 'one' ? 1 : def.mode === 'pick' ? def.n : lim2 ? 2 : 99;
      const used = Object.keys(cs.alloc).filter((s) => cs.alloc[s] > 0);
      opt += `<div class="ol">${card.id === 'placebo' ? 'Copie : ' + (v.lastSoin ? esc(C[v.lastSoin].name) : '3 PV') + ' — ' : ''}${mult > 1 ? '⚡×2 — ' : ''}${def.mode === 'split' ? `Répartir ${amt} PV` : def.mode === 'each' && !lim2 ? `${amt} PV sur chaque système` : `${amt} PV sur ${maxSys} système${maxSys > 1 ? 's' : ''}`}</div>`;
      if (def.mode === 'split') {
        const sum = used.reduce((a, s) => a + cs.alloc[s], 0);
        opt += `<div class="alloc">${live.map((s) => { const n = cs.alloc[s] || 0; const canAdd = sum < amt && tg.hp[s] + n < tg.max[s] + 1 && (n > 0 || used.length < maxSys);
          return `<div class="al">${si(s)} ${SN(s)} <small>${tg.hp[s]}/${tg.max[s]}</small><span><button ${n ? '' : 'disabled'} ${on(() => { cs.alloc[s] = n - 1; re(); }, true)}>−</button><b>${n}</b><button ${canAdd ? '' : 'disabled'} ${on(() => { cs.alloc[s] = n + 1; re(); }, true)}>+</button></span></div>`; }).join('')}
          <div class="fine">Reste à répartir : ${amt - sum}</div></div>`;
      } else if (def.mode === 'each' && !lim2) {
        opt += `<div class="fine">${live.map((s) => `${si(s)} ${SN(s)} ${tg.hp[s]}/${tg.max[s]}`).join(' · ')}</div>`;
      } else {
        opt += chips(live, (s) => cs.alloc[s] > 0, (s) => {
          if (cs.alloc[s] > 0) delete cs.alloc[s];
          else { if (used.length >= maxSys) delete cs.alloc[used[0]]; cs.alloc[s] = amt; }
        }, (s) => `${si(s)} ${SN(s)} <small>${tg.hp[s]}/${tg.max[s]}</small>`);
      }
    }
    if (card.type === 'maint') {
      const cands = me.chronics.filter((c) => !c.stab && card.systems.includes(c.sys));
      if (cands.length) { if (!cs.chronic) cs.chronic = cands[0].sys; opt += '<div class="ol">Stabiliser</div>' + chips(cands, (c) => c.sys === cs.chronic, (c) => { cs.chronic = c.sys; }, (c) => `${si(c.sys)} ${esc(C[c.id].name)}`); }
      else opt += '<div class="fine">Aucune Chronique compatible : seul le bonus s\'applique.</div>';
    }
    if (card.id === 'greffe') {
      const necro = SYS.filter((s) => me.hp[s] <= 0).map((s) => ({ k: 'r' + s, sys: s, choice: 'revive', lab: `Ranimer ${si(s)} ${SN(s)}` }));
      const chr = me.chronics.map((c) => ({ k: 'c' + c.sys, sys: c.sys, choice: 'chronic', lab: `Retirer ${esc(C[c.id].name)}` }));
      const all = necro.concat(chr);
      if (!all.length) block = 'Aucune Chronique ni Nécrose à traiter.';
      else { if (!cs.sys) { cs.sys = all[0].sys; cs.choice = all[0].choice; } opt += '<div class="ol">Greffer</div>' + chips(all, (x) => x.sys === cs.sys && x.choice === cs.choice, (x) => { cs.sys = x.sys; cs.choice = x.choice; }, (x) => x.lab); }
      if (HS.has(me, 'hla')) block = 'HLA rare : aucun greffon compatible.';
    }
    if (card.id === 'veto' && cs.choice !== 'vs' && (!t.attack || t.attack.cancelled)) block = 'Aucune attaque à annuler.';

    // paiement
    let pay = '';
    if (card.costDie && dieIdx >= 0) pay = '<div class="ol">Coût</div>' + chips(['die', 'power'], (x) => cs.pay === x, (x) => { cs.pay = x; }, (x) => (x === 'die' ? `Dé ${face(card.costDie)}${cost - card.cost ? ' + ' + (cost - card.cost) : ''}` : `${cost} Puissance`));
    else pay = `<div class="ol">Coût : ${cost} Puissance${card.costDie ? ` (ou un dé ${face(card.costDie)})` : ''}${free ? ' · sans Action' : ''}</div>`;
    let auto = null; // dés à convertir automatiquement en Puissance pour payer
    if (!block && have < need) {
      const rank = { 2: 0, 3: 0, P: 1, A: 1, L: 1, S: 2 };
      const pool = t.dice.map((d, i) => ({ i, f: d.f, used: d.used, v: HS.dieValue(v, me, d.f) })).filter((d) => !d.used && d.i !== (cs.pay === 'die' ? dieIdx : -1)).sort((x, y) => rank[x.f] - rank[y.f] || y.v - x.v);
      let sum = have; auto = [];
      for (const d of pool) { if (sum >= need) break; auto.push(d); sum += d.v; }
      if (sum < need) { auto = null; block = `Puissance insuffisante : ${have}/${need}, même avec tous vos dés.`; }
    }

    const play = () => {
      const a = { type: 'play', uid: cs.uid, pay: cs.pay === 'power' ? 'power' : undefined };
      if (cs.target !== me.id) a.target = cs.target;
      if (cs.alloc) a.alloc = cs.alloc;
      if (cs.choice) a.choice = cs.choice;
      if (cs.sys) a.sys = cs.sys;
      if (cs.chronic) a.chronic = cs.chronic;
      closeSheet();
      (auto || []).forEach((d) => send({ type: 'die', i: d.i, use: 'power' }));
      send(a);
    };
    return `<div class="cs">${img(inst.id, 'csimg')}<div class="csopt">${opt}${pay}
      ${block ? `<div class="block">${esc(block)}</div>` : ''}
      <div class="res2">Puissance ${t.power} · ATP ${me.atp} · Actions ${t.actions}</div>
      ${auto ? `<div class="fine">Dés convertis en Puissance : ${auto.map((d) => face(d.f)).join(' ')}</div>` : ''}
      <button class="big" ${block ? 'disabled' : ''} ${on(play, true)}>${auto ? 'Payer avec ces dés et jouer' : 'Jouer cette carte'}</button></div></div>`;
  }

  function reseauSheet() {
    const st = { uid: null, to: null };
    openSheet(() => {
      const v = S.view, me = v.players[v.me];
      const allies = v.mode === 'coop' ? v.players.filter((p) => p.id !== me.id && !p.dead) : [];
      return `<h3>🤝 Réseau Social</h3><p class="fine">${allies.length ? 'Donnez 1 carte à un allié.' : 'Défaussez 1 carte pour en piocher 1.'}</p>
        <div class="mini-hand pickable">${me.hand.map((c) => `<span class="${st.uid === c.uid ? 'sel' : ''}" ${on(() => { st.uid = c.uid; sheetEl._re(); }, true)}>${img(c.id)}</span>`).join('')}</div>
        ${allies.length ? `<div class="chips">${allies.map((p) => `<button class="${st.to === p.id ? 'on' : ''}" ${on(() => { st.to = p.id; sheetEl._re(); }, true)}>${esc(p.name)}</button>`).join('')}</div>` : ''}
        <button class="big" ${st.uid && (!allies.length || st.to !== null) ? '' : 'disabled'} ${on(() => { closeSheet(); send({ type: 'reseau', uid: st.uid, to: st.to === null ? undefined : st.to }); }, true)}>Valider</button>`;
    });
  }

  // ---------- choix en attente ----------
  let pendKey = null;
  function pendingSheet() {
    const v = S.view;
    if (!v || !v.pending || v.pending.pid !== v.me) return;
    const key = v.pending.type + v.turn.n + (v.pending.n || '') + v.logSeq;
    if (sheetOpen() && pendKey === key) return;
    pendKey = key;
    const st = { set: [] };
    const tog = (x) => on(() => { const k = st.set.indexOf(x); if (k >= 0) st.set.splice(k, 1); else st.set.push(x); sheetEl._re(); }, true);
    openSheet(() => {
      const v2 = S.view, pd = v2.pending, me = v2.players[v2.me];
      if (!pd || pd.pid !== v2.me) { setTimeout(closeSheet, 0); return ''; }
      if (pd.type === 'discard') {
        return `<h3>Limite de main</h3><p class="fine">Défaussez ${pd.n} carte(s).</p>
          <div class="mini-hand pickable">${me.hand.map((c) => `<span class="${st.set.includes(c.uid) ? 'sel' : ''}" ${tog(c.uid)}>${img(c.id)}</span>`).join('')}</div>
          <button class="big" ${st.set.length === pd.n ? '' : 'disabled'} ${on(() => { closeSheet(); send({ type: 'resolve', uids: st.set }); }, true)}>Défausser</button>`;
      }
      if (pd.type === 'recherche') {
        return `<h3>Protocole de Recherche</h3><p class="fine">Gardez ${pd.keep} cartes.</p>
          <div class="mini-hand pickable big4">${pd.cards.map((c) => `<span class="${st.set.includes(c.uid) ? 'sel' : ''}" ${tog(c.uid)}>${img(c.id)}</span>`).join('')}</div>
          <button class="big" ${st.set.length === pd.keep ? '' : 'disabled'} ${on(() => { closeSheet(); send({ type: 'resolve', uids: st.set }); }, true)}>Garder</button>`;
      }
      if (pd.type === 'iatro') {
        const live = SYS.filter((s) => me.hp[s] > 0);
        const n = Math.min(pd.n, live.length);
        return `<h3>⚠️ Échec critique</h3><p class="fine">Complications : -${pd.dmg} PV dans ${n} systèmes de votre choix.</p>
          <div class="chips">${live.map((s) => `<button class="${st.set.includes(s) ? 'on' : ''}" ${tog(s)}>${si(s)} ${SN(s)} <small>${me.hp[s]}/${me.max[s]}</small></button>`).join('')}</div>
          <button class="big" ${st.set.length === n ? '' : 'disabled'} ${on(() => { closeSheet(); send({ type: 'resolve', systems: st.set }); }, true)}>Valider</button>`;
      }
      return '';
    }, { cls: 'modal' });
  }

  // ---------- menus ----------
  function logSheet() {
    openSheet(() => `<h3>Journal clinique</h3><div class="logfull">${S.view.log.slice().reverse().map((l) => `<div class="l ${l.k}">${esc(l.m)}</div>`).join('')}</div>`);
  }
  function menuSheet() {
    const v = S.view;
    openSheet(() => `<h3>Menu</h3><div class="opts">
      <button ${on(() => { closeSheet(); showRules(); }, true)}>📖 Règles du jeu</button>
      <button ${on(() => { closeSheet(); openSheet(() => playerSheet(S.view, S.view.players[S.view.me])); }, true)}>🩺 Mon dossier patient</button>
      ${S.lobby && S.lobby.code ? `<p class="fine">Code du salon : <b>${esc(S.lobby.code)}</b></p>` : ''}
      <p class="fine">Mode ${v.mode === 'coop' ? 'coopératif' : 'compétitif'} · ${v.mode === 'coop' ? 'difficulté ' + v.difficulty + ' · ' : ''}durée ${v.length}</p>
      <button class="warn" ${on(() => { if (confirm('Quitter la partie ?')) quitGame(); }, true)}>Quitter la partie</button></div>`);
  }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.endsWith('.invalid')) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.HSUI = { S, render };
  render();
})();
