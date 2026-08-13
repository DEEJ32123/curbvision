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

async function kvLrange(key, start, end) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/lrange/${encodeURIComponent(key)}/${start}/${end}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.result || [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { adminKey } = req.body || {};
  if (adminKey !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });

  const monthKey = new Date().toISOString().slice(0, 7);
  const totalGenerations = await kvGet(`stats:total_generations`) || 0;
  const monthGenerations = await kvGet(`stats:generations:${monthKey}`) || 0;
  const userIds = await kvLrange('all_users', 0, -1);
  const users = [];

  for (const userId of userIds) {
    const user = await kvGet(`user:${userId}`);
    if (!user) continue;
    const unlocked = await kvGet(`unlocked:${userId}`);
    const usage = await kvGet(unlocked ? `usage:${userId}:${monthKey}` : `trial_usage:${userId}`) || 0;
    const trialStart = await kvGet(`trial:${userId}`);
    const daysLeft = trialStart
      ? Math.max(0, 14 - Math.floor((Date.now() - Number(trialStart)) / (1000 * 60 * 60 * 24)))
      : 0;
    users.push({
      email: user.email,
      createdAt: user.createdAt,
      unlocked: !!unlocked,
      usageThisMonth: Number(usage),
      trialDaysLeft: unlocked ? null : daysLeft
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
