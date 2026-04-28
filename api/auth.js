import crypto from 'crypto';

// ── Upstash Redis via REST API (no npm package needed) ──
async function kv(command, ...args) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/${[command, ...args].map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.result;
}

async function kvSet(key, value, exSeconds) {
  const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (exSeconds) return kv('set', key, val, 'ex', exSeconds);
  return kv('set', key, val);
}

async function kvGet(key) {
  const result = await kv('get', key);
  if (result === null || result === undefined) return null;
  try { return JSON.parse(result); } catch { return result; }
}

async function kvLpush(key, value) {
  return kv('lpush', key, value);
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + (process.env.PASSWORD_SALT || 'salt')).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email, password, token } = req.body || {};

  // ── VALIDATE ──
  if (action === 'validate') {
    if (!token) return res.status(401).json({ valid: false });
    const userId = await kvGet(`token:${token}`);
    if (!userId) return res.status(401).json({ valid: false });
    const user = await kvGet(`user:${userId}`);
    if (!user) return res.status(401).json({ valid: false });
    const monthKey = new Date().toISOString().slice(0, 7);
    const usage = await kvGet(`usage:${userId}:${monthKey}`) || 0;
    const unlocked = await kvGet(`unlocked:${userId}`);
    const trialStart = await kvGet(`trial:${userId}`);
    return res.status(200).json({ valid: true, email: user.email, usage: Number(usage), limit: unlocked ? 100 : 50, trialStart: trialStart ? Number(trialStart) : null });
  }

  // ── SIGNUP ──
  if (action === 'signup') {
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const emailClean = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) return res.status(400).json({ error: 'Invalid email' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const existing = await kvGet(`userid:${emailClean}`);
    if (existing) return res.status(400).json({ error: 'An account with this email already exists' });
    const userId = 'u_' + crypto.randomBytes(8).toString('hex');
    const now = Date.now();
    await kvSet(`user:${userId}`, { email: emailClean, password: hashPassword(password), createdAt: now });
    await kvSet(`userid:${emailClean}`, userId);
    await kvLpush('all_users', userId);
    const newToken = generateToken();
    await kvSet(`token:${newToken}`, userId, 60 * 60 * 24 * 30);
    await kvSet(`trial:${userId}`, String(now));
    return res.status(200).json({ token: newToken, email: emailClean, usage: 0, limit: 50, trialStart: now });
  }

  // ── LOGIN ──
  if (action === 'login') {
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const emailClean = email.toLowerCase().trim();
    const userId = await kvGet(`userid:${emailClean}`);
    if (!userId) return res.status(401).json({ error: 'Invalid email or password' });
    const user = await kvGet(`user:${userId}`);
    if (!user || user.password !== hashPassword(password)) return res.status(401).json({ error: 'Invalid email or password' });
    const newToken = generateToken();
    await kvSet(`token:${newToken}`, userId, 60 * 60 * 24 * 30);
    const monthKey = new Date().toISOString().slice(0, 7);
    const usage = await kvGet(`usage:${userId}:${monthKey}`) || 0;
    const unlocked = await kvGet(`unlocked:${userId}`);
    const trialStart = await kvGet(`trial:${userId}`);
    return res.status(200).json({ token: newToken, email: emailClean, usage: Number(usage), limit: unlocked ? 100 : 50, trialStart: trialStart ? Number(trialStart) : null });
  }

  return res.status(400).json({ error: 'Invalid action' });
}
