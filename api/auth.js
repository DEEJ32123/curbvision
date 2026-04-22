import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + process.env.PASSWORD_SALT).digest('hex');
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

  // ── VALIDATE SESSION TOKEN ──
  if (action === 'validate') {
    if (!token) return res.status(401).json({ valid: false });
    const userId = await kv.get(`token:${token}`);
    if (!userId) return res.status(401).json({ valid: false });
    const user = await kv.get(`user:${userId}`);
    if (!user) return res.status(401).json({ valid: false });
    const monthKey = new Date().toISOString().slice(0, 7);
    const usage = await kv.get(`usage:${userId}:${monthKey}`) || 0;
    return res.status(200).json({ valid: true, email: user.email, usage: Number(usage), limit: 100 });
  }

  // ── SIGNUP ──
  if (action === 'signup') {
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const emailClean = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) return res.status(400).json({ error: 'Invalid email' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await kv.get(`userid:${emailClean}`);
    if (existing) return res.status(400).json({ error: 'An account with this email already exists' });

    const userId = 'u_' + crypto.randomBytes(8).toString('hex');
    const hashed = hashPassword(password);
    const now = Date.now();

    await kv.set(`user:${userId}`, { email: emailClean, password: hashed, createdAt: now });
    await kv.set(`userid:${emailClean}`, userId);
    await kv.lpush('all_users', userId);

    const token = generateToken();
    await kv.set(`token:${token}`, userId, { ex: 60 * 60 * 24 * 30 });
    await kv.set(`trial:${userId}`, now);

    return res.status(200).json({ token, email: emailClean, usage: 0, limit: 100 });
  }

  // ── LOGIN ──
  if (action === 'login') {
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const emailClean = email.toLowerCase().trim();
    const userId = await kv.get(`userid:${emailClean}`);
    if (!userId) return res.status(401).json({ error: 'Invalid email or password' });

    const user = await kv.get(`user:${userId}`);
    if (!user || user.password !== hashPassword(password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken();
    await kv.set(`token:${token}`, userId, { ex: 60 * 60 * 24 * 30 });

    const monthKey = new Date().toISOString().slice(0, 7);
    const usage = await kv.get(`usage:${userId}:${monthKey}`) || 0;

    return res.status(200).json({ token, email: emailClean, usage: Number(usage), limit: 100 });
  }

  return res.status(400).json({ error: 'Invalid action' });
}
