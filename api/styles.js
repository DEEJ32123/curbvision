async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.result === null || data.result === undefined) return null;
  try { return JSON.parse(data.result); } catch { return data.result; }
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(val)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.ok;
}

async function kvDel(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  await fetch(`${url}/del/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── AUTH ──
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const userId = await kvGet(`token:${token}`);
  if (!userId) return res.status(401).json({ error: 'Session expired' });

  const { action, style, id } = req.body || {};

  // ── LIST ──
  if (action === 'list') {
    const data = await kvGet(`styles:${userId}`) || [];
    return res.status(200).json({ styles: data });
  }

  // ── SAVE ──
  if (action === 'save') {
    if (!style || !style.id || !style.name) return res.status(400).json({ error: 'Invalid style' });
    const existing = await kvGet(`styles:${userId}`) || [];
    // replace if exists, otherwise add
    const idx = existing.findIndex(s => s.id === style.id);
    if (idx >= 0) existing[idx] = style;
    else existing.push(style);
    const ok = await kvSet(`styles:${userId}`, existing);
    if (!ok) return res.status(500).json({ error: 'Failed to save' });
    return res.status(200).json({ success: true });
  }

  // ── DELETE ──
  if (action === 'delete') {
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const existing = await kvGet(`styles:${userId}`) || [];
    const updated = existing.filter(s => s.id !== id);
    await kvSet(`styles:${userId}`, updated);
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Invalid action' });
}
