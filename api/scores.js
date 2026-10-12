// Happy Loner leaderboard
//   GET  /api/scores?mode=classic&pid=...   -> top 20 + the caller's own rank
//   POST /api/scores {pid, player, mode, time, moves:[[r1,c1,r2,c2],...]}
// The server replays the moves, so only real, finished games reach the board.
const MODES = require('./_modes');

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const TOP = 20;
const NICK_RE = /^[\p{L}\p{N} _.\-]{2,16}$/u;
const PID_RE = /^[a-z0-9-]{8,40}$/i;

async function redis(cmds) {
  const r = await fetch(`${URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`redis http ${r.status}`);
  const out = await r.json();
  return out.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

// Replays a game; returns pegs left, or throws if any move is illegal or the game isn't over.
function replay(map, moves) {
  const rows = map.length, cols = Math.max(...map.map(r => r.length));
  const hole = (r, c) => r >= 0 && c >= 0 && r < rows && c < cols && map[r][c] !== undefined && ' x'.indexOf(map[r][c]) === -1;
  const peg = new Set();
  map.forEach((line, r) => [...line].forEach((ch, c) => { if (ch === 'o' || ch === '@') peg.add(r * cols + c); }));
  for (const m of moves) {
    if (!Array.isArray(m) || m.length !== 4 || !m.every(Number.isInteger)) throw new Error('bad move');
    const [r1, c1, r2, c2] = m, dr = r2 - r1, dc = c2 - c1;
    if (!((Math.abs(dr) === 2 && dc === 0) || (Math.abs(dc) === 2 && dr === 0))) throw new Error('bad jump');
    const rm = r1 + dr / 2, cm = c1 + dc / 2;
    if (!hole(r1, c1) || !hole(rm, cm) || !hole(r2, c2)) throw new Error('off board');
    const a = r1 * cols + c1, b = rm * cols + cm, t = r2 * cols + c2;
    if (!peg.has(a) || !peg.has(b) || peg.has(t)) throw new Error('illegal move');
    peg.delete(a); peg.delete(b); peg.add(t);
  }
  for (const k of peg) {
    const r = Math.floor(k / cols), c = k % cols;
    for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const b = (r + dr) * cols + (c + dc), t = (r + 2 * dr) * cols + (c + 2 * dc);
      if (hole(r + dr, c + dc) && hole(r + 2 * dr, c + 2 * dc) && peg.has(b) && !peg.has(t)) throw new Error('game not finished');
    }
  }
  return peg.size;
}

const score = (pegs, time) => pegs * 1e8 + Math.min(time, 1e8 - 1);

async function board(mode, pid) {
  const [ids, total, myRank] = await redis([
    ['ZRANGE', `lb:${mode}`, 0, TOP - 1],
    ['ZCARD', `lb:${mode}`],
    pid ? ['ZRANK', `lb:${mode}`, pid] : ['PING'],
  ]);
  const want = [...ids];
  if (pid && Number.isInteger(myRank) && myRank >= TOP) want.push(pid);
  const rows = want.length ? (await redis([['HMGET', `entry:${mode}`, ...want]]))[0] : [];
  const parse = (s, i) => { try { return JSON.parse(s); } catch { return null; } };
  const top = ids.map((id, i) => ({ rank: i + 1, me: id === pid, ...parse(rows[i]) }));
  const me = Number.isInteger(myRank) ? { rank: myRank + 1, ...(myRank < TOP ? top[myRank] : parse(rows[rows.length - 1])), me: true } : null;
  return { mode, total, top, me };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL || !TOKEN) return res.status(503).json({ error: 'storage not configured' });
  try {
    if (req.method === 'GET') {
      const mode = String(req.query.mode || '');
      if (!MODES[mode]) return res.status(400).json({ error: 'unknown mode' });
      const pid = PID_RE.test(String(req.query.pid || '')) ? String(req.query.pid) : null;
      return res.status(200).json(await board(mode, pid));
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { pid, mode, moves } = body;
      const player = String(body.player || '').trim().replace(/\s+/g, ' ');
      const time = Math.round(Number(body.time));
      if (!PID_RE.test(String(pid || ''))) return res.status(400).json({ error: 'bad player id' });
      if (!NICK_RE.test(player)) return res.status(400).json({ error: 'bad nickname' });
      if (!MODES[mode]) return res.status(400).json({ error: 'unknown mode' });
      if (!Array.isArray(moves) || moves.length > 60) return res.status(400).json({ error: 'bad moves' });
      if (!Number.isFinite(time) || time < moves.length * 250 || time > 864e5) return res.status(400).json({ error: 'bad time' });
      let pegs;
      try { pegs = replay(MODES[mode], moves); } catch (e) { return res.status(422).json({ error: e.message }); }

      const s = score(pegs, time);
      const [cur] = await redis([['ZSCORE', `lb:${mode}`, pid]]);
      const improved = cur === null || s < Number(cur);
      const entry = JSON.stringify({ player, pegs, time, date: Date.now() });
      if (improved) {
        await redis([['ZADD', `lb:${mode}`, s, pid], ['HSET', `entry:${mode}`, pid, entry]]);
      } else {
        // keep the best result, but follow nickname changes
        const [old] = await redis([['HGET', `entry:${mode}`, pid]]);
        try { const o = JSON.parse(old); if (o && o.player !== player) { o.player = player; await redis([['HSET', `entry:${mode}`, pid, JSON.stringify(o)]]); } } catch {}
      }
      const [rank, total] = await redis([['ZRANK', `lb:${mode}`, pid], ['ZCARD', `lb:${mode}`]]);
      return res.status(200).json({ ok: true, pegs, improved, rank: rank + 1, total });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'server error' });
  }
};
