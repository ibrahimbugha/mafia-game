const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const ROLES = {
  silencer: { side: "mafia" }, killer: { side: "mafia" },
  doctor: { side: "good" }, detective: { side: "good" },
  mayor: { side: "good" }, citizen: { side: "good" },
  bodyguard: { side: "good" }, spoiledson: { side: "good" },
  jester: { side: "neutral" }, sniper: { side: "good" }
};

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? genCode() : code;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sanitize(str) {
  return (str || "").replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");
}

wss.on('connection', (ws) => {
  let playerCtx = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      handleMessage(ws, msg, playerCtx, (ctx) => { playerCtx = ctx; });
    } catch (e) {
      console.error(e);
    }
  });

  ws.on('close', () => {
    if (playerCtx) {
      const { code, id } = playerCtx;
      const rm = rooms.get(code);
      if (rm) {
        const p = rm.players.find(x => x.id === id);
        if (p) p.connected = false;
        broadcastState(rm);
      }
    }
  });
});

function handleMessage(ws, msg, playerCtx, setCtx) {
  if (msg.t === "ping") return;

  if (msg.t === "create") {
    const code = genCode();
    const tok = crypto.randomBytes(16).toString('hex');
    const player = { id: 0, name: sanitize(msg.name), tok, ws, connected: true, muted: false, alive: true };
    const room = {
      code,
      hostId: 0,
      players: [player],
      phase: "lobby",
      set: { discuss: 120, showRole: true, roles: { killer: 1, silencer: 1, doctor: 1, detective: 1 } },
      night: 0,
      chat: [],
      acts: {},
      ready: new Set(),
      votes: {},
      mayorUsed: new Set(),
      silenced: null,
      sons: [],
      last: {}
    };
    rooms.set(code, room);
    setCtx({ code, id: 0, tok });
    ws.send(JSON.stringify({ t: "tok", code, tok }));
    broadcastState(room);
    return;
  }

  if (msg.t === "join") {
    const rm = rooms.get(msg.code);
    if (!rm) return ws.send(JSON.stringify({ t: "err", m: "الغرفة غير موجودة", k: "room" }));
    if (rm.phase !== "lobby") return ws.send(JSON.stringify({ t: "err", m: "اللعبة بدأت بالفعل" }));
    
    const id = rm.players.length;
    const tok = crypto.randomBytes(16).toString('hex');
    const player = { id, name: sanitize(msg.name), tok, ws, connected: true, muted: false, alive: true };
    rm.players.push(player);
    setCtx({ code: rm.code, id, tok });
    ws.send(JSON.stringify({ t: "tok", code: rm.code, tok }));
    broadcastState(rm);
    return;
  }

  if (msg.t === "rejoin") {
    const rm = rooms.get(msg.code);
    if (!rm) return ws.send(JSON.stringify({ t: "err", m: "جلسة منتهية", k: "room" }));
    const p = rm.players.find(x => x.tok === msg.tok);
    if (!p) return ws.send(JSON.stringify({ t: "err", m: "لاعب غير معروف", k: "room" }));
    p.ws = ws;
    p.connected = true;
    setCtx({ code: rm.code, id: p.id, tok: p.tok });
    broadcastState(rm);
    return;
  }

  if (!playerCtx) return;
  const rm = rooms.get(playerCtx.code);
  if (!rm) return;
  const me = rm.players[playerCtx.id];

  if (msg.t === "set" && me.id === rm.hostId && rm.phase === "lobby") {
    if (msg.roles) rm.set.roles = msg.roles;
    if (msg.discuss) rm.set.discuss = msg.discuss;
    if (msg.showRole !== undefined) rm.set.showRole = msg.showRole;
    broadcastState(rm);
    return;
  }

  if (msg.t === "start" && me.id === rm.hostId && rm.phase === "lobby") {
    const tot = Object.values(rm.set.roles).reduce((a, b) => a + b, 0);
    if (tot > rm.players.length) return ws.send(JSON.stringify({ t: "err", m: "عدد الشخصيات أكثر من اللاعبين" }));
    
    const roleList = [];
    Object.entries(rm.set.roles).forEach(([r, count]) => {
      for (let i = 0; i < count; i++) roleList.push(r);
    });
    while (roleList.length < rm.players.length) roleList.push("citizen");
    shuffle(roleList);

    rm.players.forEach((p, idx) => {
      p.role = roleList[idx];
      p.alive = true;
      p.used = false;
    });

    rm.phase = "reveal";
    rm.ready.clear();
    broadcastState(rm);
    return;
  }

  if (msg.t === "ready") {
    rm.ready.add(me.id);
    if (rm.ready.size >= rm.players.filter(p => p.connected).length) {
      rm.ready.clear();
      if (rm.phase === "reveal" || rm.phase === "tally") {
        startNight(rm);
      } else if (rm.phase === "dawn") {
        startDay(rm);
      }
    } else {
      broadcastState(rm);
    }
    return;
  }

  if (msg.t === "act" && rm.phase === "night" && me.alive) {
    rm.acts[me.id] = msg.target;
    rm.ready.add(me.id);
    const aliveCount = rm.players.filter(p => p.alive && p.connected).length;
    if (rm.ready.size >= aliveCount) {
      resolveNight(rm);
    } else {
      broadcastState(rm);
    }
    return;
  }

  if (msg.t === "voteStart" && me.id === rm.hostId && rm.phase === "day") {
    rm.phase = "vote";
    rm.votes = {};
    rm.ready.clear();
    broadcastState(rm);
    return;
  }

  if (msg.t === "vote" && rm.phase === "vote" && me.alive) {
    const weight = (msg.m && me.role === "mayor" && !rm.mayorUsed.has(me.id)) ? 3 : 1;
    if (msg.m && me.role === "mayor") rm.mayorUsed.add(me.id);
    if (msg.target !== -1) {
      rm.votes[msg.target] = (rm.votes[msg.target] || 0) + weight;
    }
    rm.ready.add(me.id);
    const aliveCount = rm.players.filter(p => p.alive && p.connected).length;
    if (rm.ready.size >= aliveCount) {
      resolveVote(rm);
    } else {
      broadcastState(rm);
    }
    return;
  }

  if (msg.t === "chat") {
    if (me.muted) return;
    if (rm.phase === "day" && rm.silenced === me.id) return;
    if (!me.alive && rm.phase !== "over") return;

    rm.chat.push({ n: me.name, x: sanitize(msg.text), d: !me.alive });
    if (rm.chat.length > 50) rm.chat.shift();
    broadcastState(rm);
    return;
  }

  if (msg.t === "mute" && me.id === rm.hostId) {
    const target = rm.players[msg.id];
    if (target) target.muted = !target.muted;
    broadcastState(rm);
    return;
  }

  if (msg.t === "lobby" && rm.phase === "over") {
    rm.phase = "lobby";
    broadcastState(rm);
  }
}

function startNight(rm) {
  rm.night++;
  rm.phase = "night";
  rm.acts = {};
  rm.ready.clear();
  broadcastState(rm);
}

function resolveNight(rm) {
  const kills = {};
  let saved = null;
  let guarded = null;
  let guardId = null;
  let sniperDead = [];

  Object.entries(rm.acts).forEach(([fromIdx, toIdx]) => {
    const p = rm.players[fromIdx];
    const role = p.role;
    if (toIdx === -1) return;

    if (role === "killer") kills[toIdx] = (kills[toIdx] || 0) + 1;
    if (role === "doctor") saved = toIdx;
    if (role === "bodyguard") { guarded = toIdx; guardId = p.id; }
    if (role === "silencer") rm.silenced = toIdx;
    if (role === "sniper" && !p.used) {
      p.used = true;
      const target = rm.players[toIdx];
      if (target) {
        sniperDead.push(toIdx);
        if (ROLES[target.role].side !== "mafia") sniperDead.push(p.id);
      }
    }
  });

  let topTarget = null;
  const mx = Math.max(0, ...Object.values(kills));
  if (mx > 0) {
    const top = Object.keys(kills).filter(k => kills[k] === mx);
    topTarget = parseInt(top[Math.floor(Math.random() * top.length)]);
  }

  let dead = [];
  if (topTarget !== null && topTarget !== saved) {
    if (guarded === topTarget) dead.push(guardId);
    else dead.push(topTarget);
  }

  dead = [...new Set([...dead, ...sniperDead])];
  dead.forEach(id => { rm.players[id].alive = false; });

  rm.dead = dead;
  rm.phase = "dawn";
  rm.ready.clear();

  const win = checkWin(rm);
  if (win) {
    rm.winner = win;
    rm.phase = "over";
  }
  broadcastState(rm);
}

function startDay(rm) {
  rm.phase = "day";
  rm.end = Date.now() + (rm.set.discuss * 1000);
  broadcastState(rm);
}

function resolveVote(rm) {
  const entries = Object.entries(rm.votes);
  const mx = Math.max(0, ...entries.map(x => x[1]));
  const top = entries.filter(x => x[1] === mx);

  rm.executed = null;
  if (mx > 0 && top.length === 1) {
    const exId = parseInt(top[0][0]);
    rm.players[exId].alive = false;
    rm.executed = exId;
    if (rm.players[exId].role === "jester") {
      rm.winner = "jester";
      rm.phase = "over";
      broadcastState(rm);
      return;
    }
  }

  rm.phase = "tally";
  rm.ready.clear();

  const win = checkWin(rm);
  if (win) {
    rm.winner = win;
    rm.phase = "over";
  }
  broadcastState(rm);
}

function checkWin(rm) {
  const mafia = rm.players.filter(p => p.alive && ROLES[p.role].side === "mafia").length;
  const good = rm.players.filter(p => p.alive && ROLES[p.role].side === "good").length;
  if (mafia === 0) return "good";
  if (mafia >= good) return "mafia";
  return null;
}

function broadcastState(rm) {
  rm.players.forEach((p) => {
    if (!p.ws || p.ws.readyState !== WebSocket.OPEN) return;

    const payload = {
      t: "state",
      code: rm.code,
      phase: rm.phase,
      host: p.id === rm.hostId,
      me: p.id,
      set: rm.set,
      end: rm.end,
      night: rm.night,
      chat: rm.chat,
      silenced: rm.silenced,
      dead: rm.dead,
      executed: rm.executed,
      winner: rm.winner,
      alive: p.alive,
      done: rm.ready.has(p.id),
      cnt: [rm.ready.size, rm.players.filter(x => x.connected).length],
      sil: rm.silenced === p.id,
      mayorUsed: rm.mayorUsed.has(p.id),
      players: rm.players.map((x) => ({
        n: x.name,
        h: x.id === rm.hostId,
        c: x.connected,
        mu: x.muted,
        a: x.alive,
        r: (rm.phase === "over" || (!x.alive && rm.set.showRole)) ? x.role : null
      }))
    };

    if (rm.phase !== "lobby") {
      payload.role = p.role;
      if (ROLES[p.role].side === "mafia") {
        payload.mates = rm.players.filter(x => x.id !== p.id && ROLES[x.role].side === "mafia").map(x => x.id);
      }
      payload.targets = rm.players.filter(x => x.alive && x.id !== p.id).map(x => x.id);
      payload.alivePlayers = rm.players.filter(x => x.alive).map(x => x.id);
    }

    p.ws.send(JSON.stringify(payload));
  });
}

server.listen(PORT, '0.0.0.0', () => console.log(`Server listening on port ${PORT}`));
