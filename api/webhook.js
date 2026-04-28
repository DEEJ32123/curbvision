export const config = {
  api: { bodyParser: false }
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

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function verifyStripeSignature(rawBody, signature, secret) {
  const encoder = new TextEncoder();
  const parts = signature.split(',');
  const timestamp = parts.find(p => p.startsWith('t=')).slice(2);
  const sig = parts.find(p => p.startsWith('v1=')).slice(3);
  const payload = `${timestamp}.${rawBody.toString('utf8')}`;
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expected = Buffer.from(signed).toString('hex');
  // check timestamp is within 5 minutes
  const diff = Math.abs(Date.now() / 1000 - parseInt(timestamp));
  if (diff > 300) return { valid: false, error: 'Timestamp too old' };
  return { valid: expected === sig };
}

async function getUserIdByEmail(email) {
  return kvGet(`userid:${email.toLowerCase().trim()}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const signature = req.headers['stripe-signature'];

  if (!signature) return res.status(400).json({ error: 'Missing signature' });

  const { valid, error } = await verifyStripeSignature(
    rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET
  );

  if (!valid) {
    console.error('Webhook signature invalid:', error);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(rawBody.toString('utf8'));
  const email = event?.data?.object?.customer_email ||
                event?.data?.object?.metadata?.email ||
                null;

  console.log(`Stripe webhook: ${event.type} for ${email}`);

  if (!email) {
    console.log('No email found in webhook, skipping');
    return res.status(200).json({ received: true });
  }

  const userId = await getUserIdByEmail(email);
  if (!userId) {
    console.log(`No user found for email: ${email}`);
    return res.status(200).json({ received: true });
  }

  // ── SUBSCRIPTION CREATED OR RENEWED ──
  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'invoice.payment_succeeded'
  ) {
    await kvSetLarge(`unlocked:${userId}`, 'true');
    console.log(`Unlocked user: ${email}`);
  }

  // ── SUBSCRIPTION CANCELLED ──
  if (event.type === 'customer.subscription.deleted') {
    await kvSetLarge(`unlocked:${userId}`, 'false');
    console.log(`Locked user: ${email}`);
  }

  return res.status(200).json({ received: true });
}
