import crypto from 'crypto';

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

async function kvSet(key, value, exSeconds) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const path = exSeconds
    ? `/set/${encodeURIComponent(key)}/${encodeURIComponent(val)}/ex/${exSeconds}`
    : `/set/${encodeURIComponent(key)}/${encodeURIComponent(val)}`;
  await fetch(`${url}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

async function kvLpush(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  await fetch(`${url}/lpush/${encodeURIComponent(key)}/${encodeURIComponent(String(value))}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + (process.env.PASSWORD_SALT || 'salt')).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

const SESSION_TTL = 60 * 60 * 24 * 365; // 1 year

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
    const unlocked = await kvGet(`unlocked:${userId}`);
    const usage = await kvGet(unlocked ? `usage:${userId}:${monthKey}` : `trial_usage:${userId}`) || 0;
    const trialStart = await kvGet(`trial:${userId}`);
    return res.status(200).json({
      valid: true,
      email: user.email,
      usage: Number(usage),
      limit: unlocked ? 100 : 50,
      trialStart: trialStart ? Number(trialStart) : null
    });
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
    await kvSet(`token:${newToken}`, userId, SESSION_TTL);
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
    await kvSet(`token:${newToken}`, userId, SESSION_TTL);
    const monthKey = new Date().toISOString().slice(0, 7);
    const unlocked = await kvGet(`unlocked:${userId}`);
    const usage = await kvGet(unlocked ? `usage:${userId}:${monthKey}` : `trial_usage:${userId}`) || 0;
    const trialStart = await kvGet(`trial:${userId}`);
    return res.status(200).json({
      token: newToken,
      email: emailClean,
      usage: Number(usage),
      limit: unlocked ? 100 : 50,
      trialStart: trialStart ? Number(trialStart) : null
    });
  }

  return res.status(400).json({ error: 'Invalid action' });
}
