// ── Upstash Redis via REST API (no npm package needed) ──
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

async function kvIncr(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/incr/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.result;
}

async function kvExpire(key, seconds) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  await fetch(`${url}/expire/${encodeURIComponent(key)}/${seconds}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export const config = {
  api: { bodyParser: { sizeLimit: '20mb' } }
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
  if (!userId) return res.status(401).json({ error: 'Session expired. Please log in again.' });

  // ── USAGE CHECK ──
  const monthKey = new Date().toISOString().slice(0, 7);
  const usageKey = `usage:${userId}:${monthKey}`;
  const usage = Number(await kvGet(usageKey) || 0);
  const unlocked = await kvGet(`unlocked:${userId}`);
  const LIMIT = unlocked ? 100 : 50;
  if (usage >= LIMIT) {
    return res.status(429).json({ error: `You've reached your ${LIMIT} visualization limit for this month. Resets on the 1st.`, usage, limit: LIMIT });
  }

  const { propertyImage, propertyMime, stylePhotos, styleName } = req.body || {};
  if (!propertyImage || !stylePhotos || !stylePhotos.length || !styleName) return res.status(400).json({ error: 'Missing required fields' });

  const prompt = `You are a surgical photo editing tool. Make ONE specific change to the first photo and nothing else.

THE ONLY CHANGE TO MAKE:
Add "${styleName}" concrete landscape curbing/edging only along the existing visible grass-to-bed boundary lines in the foreground of the property photo. Use the second image as your exact reference for the curbing profile, color, and texture.

STRICT RULES - follow every one of these:
- Preserve the original lighting, shadows, colors, and exposure of the photo exactly. Do not alter brightness, contrast, or color in any area.
- Only place curbing where there is already a clear existing edge between lawn and a garden bed. Foreground edges only.
- Do not place curbing in the background, along fences, walls, or any area without a clear visible lawn-to-bed boundary.
- Do not add curbing on top of grass, mulch, or plants.
- Every other element of the photo must remain completely unchanged - house, plants, trees, sky, grass, driveway, background all stay identical to the original.
- The curbing must cast a natural shadow that matches the existing light direction in the photo.
- The final result must look like a real photograph taken after the curbing was physically installed on this property.

Output only the edited photo.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: propertyMime, data: propertyImage } },
              ...stylePhotos.map(p => ({ inline_data: { mime_type: p.mime || 'image/jpeg', data: p.base64 } }))
            ]
          }],
         generationConfig: { responseModalities: ['IMAGE'] }
        })
      }
    );

    const data = await geminiRes.json();
    if (data.error) throw new Error(data.error.message || 'Gemini API error');

    let imageData = null;
    let imageMime = 'image/png';
    let text = '';

    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) { imageData = part.inlineData.data; imageMime = part.inlineData.mimeType || 'image/png'; }
      if (part.text) text = part.text;
    }

    if (!imageData) throw new Error('No image returned from Gemini');

    const newUsage = await kvIncr(usageKey);
    await kvExpire(usageKey, 60 * 60 * 24 * 35);
    await kvIncr(`stats:total_generations`);
    await kvIncr(`stats:generations:${monthKey}`);

    return res.status(200).json({ imageData, imageMime, text, usage: newUsage, limit: LIMIT });

  } catch (err) {
    console.error('Gemini error:', err);
    return res.status(500).json({ error: err.message || 'Generation failed. Please try again.' });
  }
}
