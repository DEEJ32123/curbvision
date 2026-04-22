import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { adminKey } = req.body || {};
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const monthKey = new Date().toISOString().slice(0, 7);
  const totalGenerations = await kv.get(`stats:total_generations`) || 0;
  const monthGenerations = await kv.get(`stats:generations:${monthKey}`) || 0;

  const userIds = await kv.lrange('all_users', 0, -1);
  const users = [];

  for (const userId of userIds) {
    const user = await kv.get(`user:${userId}`);
    if (!user) continue;
    const usage = await kv.get(`usage:${userId}:${monthKey}`) || 0;
    const trialStart = await kv.get(`trial:${userId}`);
    const trialDaysLeft = trialStart
      ? Math.max(0, 14 - Math.floor((Date.now() - trialStart) / (1000 * 60 * 60 * 24)))
      : 0;
    users.push({
      email: user.email,
      createdAt: user.createdAt,
      usageThisMonth: Number(usage),
      trialDaysLeft
    });
  }

  users.sort((a, b) => b.createdAt - a.createdAt);

  return res.status(200).json({
    totalUsers: users.length,
    totalGenerations: Number(totalGenerations),
    monthGenerations: Number(monthGenerations),
    users
  });
}
