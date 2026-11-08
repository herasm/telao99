/* Telão: camada de rede.
   Faz o papel do runtime do Claude (salas em tempo real + banco) usando o servidor do projeto. */
(() => {
  'use strict';
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  let ws = null, open = false, myId = null, rid = 0, sid = 0, cur = null, last = null, pres = {}, jr = null;
  const waits = [], pend = new Map(), subs = new Map(), topics = new Map(), peersCb = new Set();
  const send = o => { if (open) try { ws.send(JSON.stringify(o)); } catch (e) {} };
  const ready = () => open ? Promise.resolve() : new Promise(r => waits.push(r));

  function fire(s) {
    let l = [...s.m].map(([id, data]) => ({ id, data }));
    if (s.ob) { const k = s.ob, d = s.dir === 'desc' ? -1 : 1; l.sort((a, b) => { const x = a.data && a.data[k], y = b.data && b.data[k]; return (x < y ? -1 : x > y ? 1 : 0) * d; }); }
    if (s.lim) { l = l.slice(0, s.lim); if (s.m.size > s.lim * 2) s.m = new Map(l.map(x => [x.id, x.data])); }
    s.cb({ docs: l.map(x => ({ id: x.id, data: () => x.data })) });
  }
  function on(m) {
    switch (m.t) {
      case 'id': myId = m.id; break;
      case 'peers':
        last = { peers: (m.peers || []).map(x => ({ peer: x.id, presence: x.p || {}, sameTab: x.id === myId, isMe: x.id === myId })) };
        if (jr) { jr.ok(); jr = null; }
        peersCb.forEach(f => { try { f(last); } catch (e) { console.error(e); } });
        break;
      case 'full': if (jr) { jr.no(new Error('sala cheia')); jr = null; } cur = null; break;
      case 'ev': (topics.get(m.topic) || []).forEach(f => { try { f({ topic: m.topic, data: m.data, peer: m.peer, sameTab: false }); } catch (e) { console.error(e); } }); break;
      case 'dbr': { const p = pend.get(m.rid); if (p) { pend.delete(m.rid); m.ok ? p.ok(m) : p.no(new Error(m.err || 'erro')); } break; }
      case 'snap': { const s = subs.get(m.sid); if (s) { s.m = new Map((m.docs || []).map(d => [d.id, d.data])); fire(s); } break; }
      case 'chg': { const s = subs.get(m.sid); if (s) { (m.set || []).forEach(d => s.m.set(d.id, d.data)); (m.del || []).forEach(i => s.m.delete(i)); fire(s); } break; }
    }
  }
  function connect() {
    ws = new WebSocket(url);
    ws.onopen = () => {
      open = true;
      if (cur) { send({ t: 'join', room: cur }); send({ t: 'pres', p: pres }); }
      subs.forEach((s, id) => send({ t: 'db', op: 'sub', sid: id, coll: s.coll, ob: s.ob, dir: s.dir, lim: s.lim }));
      waits.splice(0).forEach(f => f());
    };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } on(m); };
    ws.onclose = () => { open = false; pend.forEach(p => p.no(new Error('desconectado'))); pend.clear(); setTimeout(connect, 2000); };
  }
  const req = o => ready().then(() => new Promise((ok, no) => {
    const r = ++rid; pend.set(r, { ok, no }); send(Object.assign({ rid: r }, o));
    setTimeout(() => { if (pend.delete(r)) no(new Error('tempo esgotado')); }, 20000);
  }));
  const docRef = (c, id) => ({
    id,
    set: d => req({ t: 'db', op: 'set', coll: c, id, data: d }),
    update: d => req({ t: 'db', op: 'update', coll: c, id, data: d }),
    delete: () => req({ t: 'db', op: 'delete', coll: c, id }),
    get: () => req({ t: 'db', op: 'get', coll: c, id }).then(r => ({ id, exists: !!r.exists, data: () => r.data }))
  });
  const colRef = (c, ob, dir, lim) => ({
    doc: id => docRef(c, id),
    add: d => req({ t: 'db', op: 'add', coll: c, data: d }).then(r => docRef(c, r.id)),
    orderBy: (f, d) => colRef(c, f, d || 'asc', lim),
    limit: n => colRef(c, ob, dir, n),
    onSnapshot: cb => {
      const id = ++sid; subs.set(id, { coll: c, ob, dir, lim, cb, m: new Map() });
      ready().then(() => send({ t: 'db', op: 'sub', sid: id, coll: c, ob, dir, lim }));
      return () => { subs.delete(id); send({ t: 'db', op: 'unsub', sid: id }); };
    }
  });
  const DB = { collection: c => colRef(c) };

  async function join(code) {
    await ready(); cur = code; pres = {}; last = null;
    const p = new Promise((ok, no) => { jr = { ok, no }; setTimeout(() => { if (jr) { jr.no(new Error('tempo esgotado')); jr = null; } }, 10000); });
    send({ t: 'join', room: code }); await p;
    return {
      onPeers: cb => { peersCb.add(cb); if (last) setTimeout(() => cb(last)); return () => peersCb.delete(cb); },
      on: (t, cb) => { if (!topics.has(t)) topics.set(t, new Set()); topics.get(t).add(cb); return () => topics.get(t) && topics.get(t).delete(cb); },
      emit: (t, d) => { send({ t: 'emit', topic: t, data: d }); return Promise.resolve(); },
      presence: p => { Object.assign(pres, p); send({ t: 'pres', p }); return Promise.resolve(); },
      leave: () => { if (cur === code) { cur = null; pres = {}; last = null; send({ t: 'leave' }); topics.clear(); peersCb.clear(); } }
    };
  }
  let aiOn = null;
  const sample = async (msgs, opts) => {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: msgs.map(m => m.content).join('\n'), tier: opts && opts.modelTier }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'erro'); e.code = r.status === 429 || j.error === 'rate_limited' ? 'rate_limited' : 'error'; throw e; }
    return { text: j.text || '' };
  };
  const useSample = async () => { if (aiOn === null) { try { aiOn = !!(await (await fetch('/api/ai/status')).json()).enabled; } catch (e) { aiOn = false; } } return aiOn ? sample : null; };
  window.claude = { use: async n => n === 'room' ? { join } : n === 'db' ? DB : n === 'sample' ? useSample() : null };
  fetch('/ice').then(r => r.json()).then(j => { if (j && Array.isArray(j.iceServers)) window.__ICE = { iceServers: j.iceServers }; }).catch(() => {});
  setInterval(() => send({ t: 'ping' }), 25000);
  connect();
})();
