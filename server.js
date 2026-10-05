const http = require("http"), fs = require("fs"), path = require("path");
const { WebSocketServer } = require("ws");
const PORT = process.env.PORT || 3000, MIN = +process.env.MIN_PLAYERS || 5, F = process.env.FAST ? 0.1 : 1;
const PUB = path.join(__dirname, "public");
const TYPES = { ".js": "text/javascript", ".json": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };

/* Rules data. Names and texts live in the client; the server only needs sides and night actions. */
const R = {
  killer: { side: "mafia", act: "kill" }, silencer: { side: "mafia", act: "silence", self: 1 },
  doctor: { side: "good", act: "save", self: 1, norep: 1 }, detective: { side: "good", act: "investigate" },
  mayor: { side: "good" }, citizen: { side: "good" }, bodyguard: { side: "good", act: "guard", norep: 1 },
  spoiledson: { side: "good" }, jester: { side: "neutral" }, sniper: { side: "good", act: "snipe", once: 1, skip: 1 }
};
const REQ = ["killer", "silencer", "doctor"];
const TM = { reveal: 25, night: 45, vote: 45, son: 40, pause: 9 }; /* seconds */

const rooms = new Map(), rnd = n => Math.random() * n | 0;
const clean = s => String(s || "").replace(/[<>&"'`]/g, "").trim();
const send = (p, o) => p.ws && p.ws.readyState == 1 && p.ws.send(JSON.stringify(o));
const err = (ws, m, k) => ws.readyState == 1 && ws.send(JSON.stringify({ t: "err", m, k }));
const idx = (r, p) => r.players.indexOf(p), alive = r => r.players.filter(p => p.alive), side = p => R[p.role].side;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const mkcode = () => { let c; do c = Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[rnd(24)]).join(""); while (rooms.has(c)); return c; };

/* ---------- views: each player only gets what they are allowed to see ---------- */
function targets(r, p) {
  const d = R[p.role], live = d.act && !(d.once && p.used);
  return { list: alive(r).filter(q => ((live && d.self) || q !== p) && !(live && d.norep && q === r.last[d.act])).map(q => idx(r, q)), skip: !!(live && d.skip) };
}
function view(r, p) {
  const g = r.phase != "lobby", over = r.phase == "over", a = alive(r);
  const o = { t: "state", code: r.code, me: idx(r, p), host: p === r.host, phase: r.phase, end: r.end, set: r.set, night: r.night, win: r.win, rep: r.rep, res: r.res, sons: r.sons,
    players: r.players.map(q => ({ n: q.name, a: q.alive, c: q.on, mu: !!q.mute, h: q === r.host, r: g && (over || (!q.alive && r.set.showRole)) ? q.role : undefined })) };
  if (g) {
    Object.assign(o, { role: p.role, alive: p.alive, inv: p.inv, used: !!p.used, sil: r.silenced === p, mayor: p.role == "mayor" && !r.mayorUsed && p.alive,
      chat: r.chat.filter(m => !m.d || !p.alive || over).slice(-60) });
    if (side(p) == "mafia") o.mates = r.players.map((q, j) => (q !== p && side(q) == "mafia" ? j : -1)).filter(j => j >= 0);
    const k = { night: "act", vote: "vote", day: "ready", reveal: "ready" }[r.phase];
    if (k) { o.done = !!p[k]; o.cnt = [a.filter(q => q[k]).length, a.length]; }
    if (p.alive && r.phase == "night") { const t = targets(r, p); o.opts = t.list; o.skip = t.skip; }
    if (p.alive && r.phase == "vote") o.opts = a.filter(q => q !== p).map(q => idx(r, q));
    if (r.phase == "son" && r.son === p) o.opts = a.map(q => idx(r, q));
  }
  return o;
}
function push(r) { r.touched = Date.now(); r.players.forEach(p => send(p, view(r, p))); }
function phase(r, ph, secs, fn) {
  clearTimeout(r.timer); r.phase = ph; r.end = secs ? Date.now() + secs * 1000 * F : 0;
  if (secs) r.timer = setTimeout(fn, secs * 1000 * F);
  push(r);
}

/* ---------- game flow ---------- */
function win(r) {
  const m = alive(r).filter(p => side(p) == "mafia").length, g = alive(r).filter(p => side(p) == "good").length;
  return m == 0 ? "good" : g == 0 ? "mafia" : null;
}
function over(r, w) { r.win = w; phase(r, "over", 0); }
function night(r) {
  r.night++; r.acts = []; r.players.forEach(p => { p.act = null; });
  phase(r, "night", TM.night, () => dawn(r));
}
function afterDeaths(r, list, done) { /* Spoiled Son takes one suspected player with him */
  const s = list.find(p => p.role == "spoiledson" && !p.used);
  if (!s || !alive(r).length) return done();
  s.used = true; r.son = s;
  r.sonDone = t => { t.alive = false; list.push(t); r.sons.push([idx(r, s), idx(r, t)]); afterDeaths(r, list, done); };
  phase(r, "son", TM.son, () => { const a = alive(r); r.sonDone(a[rnd(a.length)]); });
}
function dawn(r) {
  const A = r.acts, saved = A.filter(a => a.type == "save").map(a => a.to), c = {};
  A.filter(a => a.type == "kill").forEach(a => { const i = idx(r, a.to); c[i] = (c[i] || 0) + 1; });
  const mx = Math.max(0, ...Object.values(c)), top = Object.keys(c).filter(k => c[k] == mx);
  const tgt = top.length ? r.players[top[rnd(top.length)]] : null;
  const gd = tgt && A.find(a => a.type == "guard" && a.to === tgt);
  const dead = tgt && !saved.includes(tgt) ? [gd ? gd.from : tgt] : [];
  r.last = {}; ["save", "guard"].forEach(k => { const a = A.find(x => x.type == k); r.last[k] = a ? a.to : null; });
  A.filter(a => a.type == "snipe").forEach(a => { dead.push(a.to); if (side(a.to) != "mafia") dead.push(a.from); });
  const D = [...new Set(dead)]; D.forEach(p => { p.alive = false; });
  const s = A.find(a => a.type == "silence"); r.silenced = s && s.to.alive ? s.to : null;
  r.sons = []; r.rep = { dead: D.map(p => idx(r, p)), sil: r.silenced ? idx(r, r.silenced) : -1 };
  afterDeaths(r, D, () => phase(r, "dawn", TM.pause, () => { const w = win(r); w ? over(r, w) : day(r); }));
}
function day(r) { r.players.forEach(p => { p.ready = false; }); phase(r, "day", r.set.discuss, () => vote(r)); }
function vote(r) { r.players.forEach(p => { p.vote = null; }); phase(r, "vote", TM.vote, () => tally(r)); }
function tally(r) {
  const c = {}; alive(r).forEach(p => { if (p.vote && p.vote.t >= 0) c[p.vote.t] = (c[p.vote.t] || 0) + (p.vote.m ? 3 : 1); });
  const mx = Math.max(0, ...Object.values(c)), top = Object.keys(c).filter(k => c[k] == mx);
  r.sons = []; r.res = { ex: -1 }; let list = [];
  if (mx > 0 && top.length == 1) { const x = r.players[top[0]]; x.alive = false; r.res.ex = +top[0]; list = [x]; if (x.role == "jester") return over(r, "jester"); }
  afterDeaths(r, list, () => phase(r, "result", TM.pause, () => { const w = win(r); w ? over(r, w) : night(r); }));
}

/* ---------- player messages ---------- */
function addPlayer(ws, r, name) {
  if (!name) return err(ws, "اكتب اسمك");
  if (r.phase != "lobby") return err(ws, "اللعبة بدأت بالفعل");
  if (r.players.length >= 20) return err(ws, "الغرفة ممتلئة");
  if (r.players.some(p => p.name.toLowerCase() == name.toLowerCase())) return err(ws, "الاسم مستخدم");
  const p = { name, tok: Math.random().toString(36).slice(2) + Date.now().toString(36), ws, on: true, alive: true, inv: [] };
  r.players.push(p); if (!r.host) r.host = p; ws.r = r; ws.p = p;
  send(p, { t: "tok", code: r.code, tok: p.tok }); push(r);
}
function leave(r, p) {
  r.players = r.players.filter(q => q !== p);
  if (!r.players.length) { clearTimeout(r.timer); return rooms.delete(r.code); }
  if (r.host === p) r.host = r.players[0];
  push(r);
}
const H = {
  create(ws, d) {
    const r = { code: mkcode(), players: [], phase: "lobby", end: 0, night: 0, last: {}, chat: [], sons: [], acts: [], touched: Date.now(),
      set: { roles: { killer: 1, silencer: 1, doctor: 1, detective: 1, mayor: 1 }, discuss: 120, showRole: true } };
    rooms.set(r.code, r); addPlayer(ws, r, clean(d.name).slice(0, 14));
  },
  join(ws, d) {
    const r = rooms.get(clean(d.code).toUpperCase());
    if (!r) return err(ws, "الغرفة غير موجودة"); addPlayer(ws, r, clean(d.name).slice(0, 14));
  },
  rejoin(ws, d) {
    const r = rooms.get(clean(d.code).toUpperCase()), p = r && r.players.find(x => x.tok == d.tok);
    if (!p) return err(ws, "انتهت الغرفة", "room");
    clearTimeout(p.rm); if (p.ws && p.ws !== ws) { p.ws.p = null; p.ws.close(); }
    p.ws = ws; p.on = true; ws.r = r; ws.p = p; push(r);
  },
  set(ws, d, r, p) {
    if (r.phase != "lobby" || p !== r.host) return; const s = r.set;
    if (d.roles) { const o = {}; for (const k in R) if (k != "citizen") { const v = Math.max(0, Math.min(20, +d.roles[k] | 0)); o[k] = REQ.includes(k) ? Math.max(1, v) : v; } s.roles = o; }
    if (d.discuss) s.discuss = Math.max(30, Math.min(300, +d.discuss | 0));
    if (typeof d.showRole == "boolean") s.showRole = d.showRole;
    push(r);
  },
  start(ws, d, r, p) {
    if (r.phase != "lobby" || p !== r.host) return;
    const n = r.players.length, tot = Object.values(r.set.roles).reduce((a, b) => a + b, 0);
    if (n < MIN) return err(ws, "الحد الأدنى " + MIN + " لاعبين");
    if (tot > n) return err(ws, "عدد الشخصيات أكبر من عدد اللاعبين");
    const roles = shuffle([...Object.entries(r.set.roles).flatMap(([k, c]) => Array(c).fill(k)), ...Array(n - tot).fill("citizen")]);
    r.players.forEach((q, i) => { q.role = roles[i]; q.alive = true; q.inv = []; q.used = false; q.ready = false; q.act = null; q.vote = null; });
    Object.assign(r, { night: 0, last: {}, silenced: null, mayorUsed: false, win: null, chat: [], rep: null, res: null, sons: [] });
    phase(r, "reveal", TM.reveal, () => night(r));
  },
  ready(ws, d, r, p) {
    if (!["reveal", "day"].includes(r.phase) || !p.alive) return; p.ready = true;
    if (alive(r).every(q => q.ready)) (r.phase == "reveal" ? night : vote)(r); else push(r);
  },
  act(ws, d, r, p) {
    if (r.phase != "night" || !p.alive || p.act) return;
    const t = targets(r, p), def = R[p.role], live = def.act && !(def.once && p.used), tg = r.players[d.target];
    if (d.target == -1 && t.skip) p.act = "skip";
    else if (tg && t.list.includes(d.target)) {
      p.act = "x";
      if (live) {
        r.acts.push({ type: def.act, from: p, to: tg }); if (def.once) p.used = true;
        if (def.act == "investigate") p.inv.push({ n: d.target, m: side(tg) == "mafia" });
      }
    } else return;
    alive(r).every(q => q.act) ? dawn(r) : push(r);
  },
  vote(ws, d, r, p) {
    if (r.phase != "vote" || !p.alive || p.vote) return;
    const t = +d.target; if (t != -1 && !view(r, p).opts.includes(t)) return;
    const m = !!d.m && p.role == "mayor" && !r.mayorUsed; if (m) r.mayorUsed = true;
    p.vote = { t, m };
    alive(r).every(q => q.vote) ? tally(r) : push(r);
  },
  son(ws, d, r, p) {
    const t = r.players[d.target];
    if (r.phase == "son" && r.son === p && t && t.alive) r.sonDone(t);
  },
  chat(ws, d, r, p) {
    const x = clean(d.text).slice(0, 200); if (!x || p.mute) return;
    const open = ["lobby", "over"].includes(r.phase);
    const live = r.phase == "day" ? p.alive && r.silenced !== p : open, dead = !p.alive && !open;
    if (!dead && !live) return;
    r.chat.push({ n: p.name, x, d: dead }); if (r.chat.length > 200) r.chat.shift(); push(r);
  },
  mute(ws, d, r, p) {
    const t = r.players[d.id]; if (p !== r.host || !t || t === p) return; t.mute = !t.mute; push(r);
  },
  again(ws, d, r, p) {
    if (p !== r.host || r.phase != "over") return; clearTimeout(r.timer);
    r.players = r.players.filter(q => q.on); r.players.forEach(q => { q.alive = true; q.role = undefined; });
    Object.assign(r, { phase: "lobby", end: 0, win: null, chat: [], rep: null, res: null, sons: [] }); push(r);
  },
  ping() {}
};

/* ---------- server ---------- */
const srv = http.createServer((q, s) => {
  const u = q.url.split("?")[0];
  if (u == "/health") { s.setHeader("Content-Type", "application/json"); return s.end(JSON.stringify({ ok: true, rooms: rooms.size })); }
  if (u == "/mp-config.js") { s.setHeader("Content-Type", "text/javascript"); return s.end("window.MP=true;"); }
  const f = path.join(PUB, u == "/" ? "index.html" : u);
  if (!f.startsWith(PUB)) { s.statusCode = 403; return s.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { s.statusCode = 404; return s.end("404"); }
    s.setHeader("Content-Type", TYPES[path.extname(f)] || "text/html; charset=utf-8"); s.end(d);
  });
});
const wss = new WebSocketServer({ server: srv });
wss.on("connection", ws => {
  ws.on("message", raw => {
    let d; try { d = JSON.parse(raw); } catch { return; }
    if (!d || !Object.hasOwn(H, d.t)) return;
    if (!["create", "join", "rejoin", "ping"].includes(d.t) && !(ws.r && ws.p)) return;
    try { H[d.t](ws, d, ws.r, ws.p); } catch (e) { console.error(e); }
  });
  ws.on("close", () => {
    const p = ws.p, r = ws.r; if (!p || p.ws !== ws) return;
    p.on = false; if (r.phase == "lobby") p.rm = setTimeout(() => leave(r, p), 30000); push(r);
  });
});
setInterval(() => wss.clients.forEach(c => c.readyState == 1 && c.ping()), 25000);
setInterval(() => rooms.forEach((r, c) => { if (Date.now() - r.touched > 3 * 3600e3) { clearTimeout(r.timer); rooms.delete(c); } }), 600000);
srv.listen(PORT, () => console.log("Mafia server on port " + PORT));
