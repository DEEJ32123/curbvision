export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } }
};

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

async function kvSetLarge(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['SET', key, val]])
  });
  const data = await res.json();
  return Array.isArray(data) && data[0]?.result === 'OK';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const authRes = await fetch(`${process.env.KV_REST_API_URL}/get/${encodeURIComponent('token:' + token)}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const authData = await authRes.json();
  const userId = authData.result;
  if (!userId) return res.status(401).json({ error: 'Session expired' });

  const { action, style, id } = req.body || {};

  if (action === 'list') {
    const data = await kvGet(`styles:${userId}`) || [];
    return res.status(200).json({ styles: data });
  }

  if (action === 'save') {
    if (!style || !style.id || !style.name) return res.status(400).json({ error: 'Invalid style' });
    const existing = await kvGet(`styles:${userId}`) || [];
    const idx = existing.findIndex(s => s.id === style.id);
    if (idx >= 0) existing[idx] = style;
    else existing.push(style);
    const ok = await kvSetLarge(`styles:${userId}`, existing);
    if (!ok) return res.status(500).json({ error: 'Failed to save style' });
    return res.status(200).json({ success: true });
  }

  if (action === 'delete') {
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const existing = await kvGet(`styles:${userId}`) || [];
    const updated = existing.filter(s => s.id !== id);
    await kvSetLarge(`styles:${userId}`, updated);
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Invalid action' });
}
