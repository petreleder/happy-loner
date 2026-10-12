// Health check: reports which storage env vars exist (names only) and pings Redis.
const URL_KEYS = ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL'];
const TOKEN_KEYS = ['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN'];
module.exports = async (req, res) => {
  const present = Object.keys(process.env).filter(k => /KV_|REDIS|UPSTASH/.test(k)).sort();
  const url = URL_KEYS.map(k => process.env[k]).find(Boolean);
  const token = TOKEN_KEYS.map(k => process.env[k]).find(Boolean);
  let ping = null;
  if (url && token) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(['PING']) });
      ping = (await r.json()).result || `http ${r.status}`;
    } catch (e) { ping = 'error: ' + e.message; }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ envVars: present, restConfigured: !!(url && token), ping });
};
