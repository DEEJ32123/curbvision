const UNLOCK_CODES = ['CURB2024', 'CURBPRO1', 'CURBVIP1', 'EDGE2024', 'CURB0001'];

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
  const val = String(value);
  await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(val)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const userId = await kvGet(`token:${token}`);
  if (!userId) return res.status(401).json({ error: 'Invalid session' });

  const { code } = req.body || {};
  if (!code || !UNLOCK_CODES.includes(code.toUpperCase())) {
    return res.status(400).json({ error: 'Invalid unlock code' });
  }

  await kvSet(`unlocked:${userId}`, 'true');
  return res.status(200).json({ success: true, limit: 100 });
}
