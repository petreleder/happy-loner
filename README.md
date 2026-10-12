# Happy Loner

Peg solitaire (Samotář) for the browser, mobile-first. Four boards: Classic (37 holes), Cross, Rocks and Diamond.

Open `index.html` in a browser, or enable GitHub Pages (Settings → Pages → branch `main`, folder `/`).

## Online leaderboard

`api/scores.js` is a Vercel function backed by Upstash Redis (env `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
Each finished game is sent with its move list; the server replays it and stores only valid results
(best per player and board, ranked by pegs left, then time). Board maps live in `api/_modes.js`
and must match `MODES` in `index.html`.
