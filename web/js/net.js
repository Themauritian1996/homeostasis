/* HOMEOSTASIS — hôte de partie + réseau pair-à-pair (PeerJS / WebRTC).
   L'hôte fait tourner le moteur ; les invités n'envoient que des actions et reçoivent une vue filtrée. */
(function (root) {
  const HS = root.HS;
  const PREFIX = 'homeostasis-v6-';
  const SAVE = 'hs6-save';

  // ---------- Hôte (local ou en ligne) ----------
  function Host(onChange) {
    this.st = null;
    this.onChange = onChange; // rafraîchit l'interface locale
    this.conns = {}; // siège -> connexion distante
    this.localSeats = [];
    this.timer = null;
    this.botDelay = 850;
  }
  Host.prototype.start = function (opts, seats) {
    // seats : [{name, bot, conn?}] dans l'ordre des sièges
    this.conns = {};
    this.localSeats = [];
    seats.forEach((s, i) => {
      if (s.conn) this.conns[i] = s.conn;
      else if (!s.bot) this.localSeats.push(i);
    });
    this.st = HS.newGame(Object.assign({}, opts, { players: seats.map((s) => ({ name: s.name, bot: !!s.bot })) }));
    this.sync();
  };
  Host.prototype.resume = function (st) {
    this.st = st;
    this.conns = {};
    this.localSeats = st.players.filter((p) => !p.bot).map((p) => p.id);
    this.sync();
  };
  Host.prototype.act = function (seat, a) {
    if (!this.st) return { ok: false, err: 'Aucune partie.' };
    const r = HS.act(this.st, seat, a);
    if (r.ok) this.sync();
    return r;
  };
  Host.prototype.sync = function () {
    const st = this.st;
    for (const seat in this.conns) {
      const c = this.conns[seat];
      if (c && c.open) c.send({ t: 'view', v: HS.viewFor(st, +seat) });
    }
    try {
      if (!Object.keys(this.conns).length) {
        if (st.over) localStorage.removeItem(SAVE);
        else localStorage.setItem(SAVE, JSON.stringify(st));
      }
    } catch (e) { /* stockage indisponible */ }
    this.onChange();
    this.tick();
  };
  // Les bots (et les joueurs déconnectés) jouent automatiquement, une action à la fois.
  Host.prototype.tick = function () {
    const st = this.st;
    if (this.timer || !st || st.over) return;
    const p = st.players[st.turn.pid];
    if (!p.bot && !p.away) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.st || this.st !== st || st.over) return;
      const q = st.players[st.turn.pid];
      if (!q.bot && !q.away) return;
      const a = HS.botAction(st);
      let r = HS.act(st, q.id, a);
      if (!r.ok) r = HS.act(st, q.id, st.pending ? HS.botAction(st) : { type: 'end' });
      this.sync();
    }, this.botDelay);
  };
  Host.prototype.viewFor = function (seat) {
    return HS.viewFor(this.st, seat);
  };
  Host.prototype.stop = function () {
    clearTimeout(this.timer);
    this.timer = null;
    this.st = null;
  };

  // ---------- Salon en ligne ----------
  function makeCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }

  // Côté hôte : ouvre un salon et accepte les invités.
  function openRoom(cb) {
    // cb : {onReady(code), onLobby(guests), onAct(seat, action, conn), onError(msg), onLeave(conn)}
    const code = makeCode();
    const peer = new Peer(PREFIX + code);
    const room = { code, peer, guests: [] };
    peer.on('open', () => cb.onReady(code));
    peer.on('error', (e) => cb.onError(e.type === 'unavailable-id' ? 'Code déjà utilisé, réessayez.' : 'Réseau : ' + (e.type || e.message)));
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
    peer.on('connection', (conn) => {
      conn.on('data', (m) => {
        if (!m || typeof m !== 'object') return;
        if (m.t === 'hello') {
          conn.hsName = String(m.name || 'Invité').slice(0, 16);
          if (!room.guests.includes(conn)) room.guests.push(conn);
          cb.onLobby(room.guests, conn);
        } else if (m.t === 'act') cb.onAct(conn, m.a);
      });
      conn.on('close', () => {
        room.guests = room.guests.filter((g) => g !== conn);
        cb.onLeave(conn);
      });
    });
    room.close = () => { try { peer.destroy(); } catch (e) { /* ignore */ } };
    return room;
  }

  // Côté invité : rejoint un salon.
  function joinRoom(code, name, cb) {
    // cb : {onOpen(), onLobby(info), onView(view), onError(msg), onClose()}
    const peer = new Peer();
    const link = { peer, conn: null };
    peer.on('error', (e) => cb.onError(e.type === 'peer-unavailable' ? 'Salon introuvable. Vérifiez le code.' : 'Réseau : ' + (e.type || e.message)));
    peer.on('open', () => {
      const conn = (link.conn = peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true }));
      conn.on('open', () => { conn.send({ t: 'hello', name }); cb.onOpen(); });
      conn.on('data', (m) => {
        if (!m) return;
        if (m.t === 'lobby') cb.onLobby(m);
        else if (m.t === 'view') cb.onView(m.v);
        else if (m.t === 'err') cb.onError(m.m);
      });
      conn.on('close', () => cb.onClose());
    });
    link.send = (a) => { if (link.conn && link.conn.open) link.conn.send({ t: 'act', a }); };
    link.close = () => { try { peer.destroy(); } catch (e) { /* ignore */ } };
    return link;
  }

  HS.net = { Host, openRoom, joinRoom, SAVE, available: () => typeof Peer !== 'undefined' };
})(window);
