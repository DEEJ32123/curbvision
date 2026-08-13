# CurbVision — Upload Instructions

## How to upload to GitHub

**Step 1** — Go to github.com → your curbvision repo

**Step 2** — Delete ALL existing files in the repo:
- Click each file → click the trash icon → commit
- Or: Settings → Danger Zone → Delete repository, then create a fresh one called curbvision

**Step 3** — Upload these files maintaining the exact folder structure:

```
api/
  admin.js
  auth.js
  styles.js
  unlock.js
  visualize.js
  webhook.js
public/
  favicon.ico
  icon-192.png
  icon-512.png
  index.html
  og-image.png
package.json
vercel.json
README.md
```

**Step 4** — In GitHub, create the api/ folder:
- Click "Add file" → "Create new file"
- Type: api/auth.js in the name field (the slash creates the folder)
- Paste the contents of api/auth.js
- Click "Commit changes"
- Repeat for each api/ file

**Step 5** — Create the public/ folder the same way:
- Click "Add file" → "Create new file"
- Type: public/index.html
- Paste the contents
- Commit

**Step 6** — For the icon files (binary files):
- Click "Add file" → "Upload files"
- Drag favicon.ico, icon-192.png, icon-512.png, og-image.png
- In the path field at top type: public/
- Commit

**Step 7** — Upload package.json and vercel.json to the root (no folder)

**Step 8** — Vercel will auto-redeploy within 60 seconds

---

## Environment Variables needed in Vercel

Settings → Environment Variables:
- GEMINI_API_KEY — your Google Gemini API key
- PASSWORD_SALT — any random string e.g. curbvision2024xyz
- ADMIN_KEY — your secret admin password
- STRIPE_WEBHOOK_SECRET — from Stripe Developers → Webhooks → your endpoint
- KV_REST_API_URL — auto-added by Upstash
- KV_REST_API_TOKEN — auto-added by Upstash

---

## Stripe Webhook Events

In Stripe → Developers → Webhooks → your endpoint, make sure these 5 events are selected:
- checkout.session.completed
- customer.subscription.created
- customer.subscription.deleted
- invoice.payment_succeeded
- invoice.payment_failed

---

## Unlock Codes (give to paying customers if webhook fails)

CURB2024 / CURBPRO1 / CURBVIP1 / EDGE2024 / CURB0001
