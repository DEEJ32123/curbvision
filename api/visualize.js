import { Redis } from '@upstash/redis';

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

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

  const userId = await kv.get(`token:${token}`);
  if (!userId) return res.status(401).json({ error: 'Session expired. Please log in again.' });

  // ── USAGE CHECK ──
  const monthKey = new Date().toISOString().slice(0, 7);
  const usageKey = `usage:${userId}:${monthKey}`;
  const usage = Number(await kv.get(usageKey) || 0);
  const LIMIT = 100;

  if (usage >= LIMIT) {
    return res.status(429).json({
      error: `You've reached your ${LIMIT} visualization limit for this month. Your limit resets on the 1st.`,
      usage,
      limit: LIMIT
    });
  }

  // ── GET REQUEST DATA ──
  const { propertyImage, propertyMime, styleImage, styleMime, styleName } = req.body || {};
  if (!propertyImage || !styleImage || !styleName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // ── CALL GEMINI ──
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
              { inline_data: { mime_type: styleMime, data: styleImage } }
            ]
          }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
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

    // ── INCREMENT USAGE ──
    const newUsage = await kv.incr(usageKey);
    await kv.expire(usageKey, 60 * 60 * 24 * 35);
    await kv.incr(`stats:total_generations`);
    await kv.incr(`stats:generations:${monthKey}`);

    return res.status(200).json({ imageData, imageMime, text, usage: newUsage, limit: LIMIT });

  } catch (err) {
    console.error('Gemini error:', err);
    return res.status(500).json({ error: err.message || 'Generation failed. Please try again.' });
  }
}
