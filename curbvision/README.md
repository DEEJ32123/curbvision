# CurbVision — Deployment Guide

## Project Structure
```
curbvision/
├── api/
│   ├── auth.js          ← handles login/signup
│   ├── visualize.js     ← calls Gemini, tracks usage
│   └── admin.js         ← your admin dashboard
├── public/
│   └── index.html       ← the app users see
├── package.json
├── vercel.json
└── README.md
```

---

## Step 1 — Push to GitHub

1. Go to github.com → click "New repository"
2. Name it: `curbvision`
3. Keep it Private
4. Click "Create repository"
5. Follow GitHub's instructions to push these files up
   (use "upload files" if you're not comfortable with git commands)

---

## Step 2 — Connect to Vercel

1. Go to vercel.com → "Add New Project"
2. Import your `curbvision` GitHub repo
3. Click Deploy — Vercel will auto-detect the settings

---

## Step 3 — Add a KV Database (for users + usage tracking)

1. In Vercel dashboard → go to your project → "Storage" tab
2. Click "Create Database" → choose "KV"
3. Name it `curbvision-kv`
4. Click "Create & Connect to Project"
5. Vercel automatically adds the KV environment variables — you don't need to do anything else

---

## Step 4 — Add Environment Variables

In Vercel dashboard → your project → Settings → Environment Variables, add:

| Name | Value |
|------|-------|
| `GEMINI_API_KEY` | Your Gemini API key (AIza...) |
| `PASSWORD_SALT` | Any random string, e.g. `curbvision_salt_2024` |
| `ADMIN_KEY` | A secret password for your admin panel, e.g. `myadminpass123` |

---

## Step 5 — Redeploy

After adding environment variables:
1. Go to Vercel → Deployments tab
2. Click the three dots on the latest deployment → "Redeploy"

---

## Step 6 — Connect Your Domain

1. Buy a domain (e.g. getcurbvision.com) at namecheap.com
2. In Vercel → your project → Settings → Domains
3. Add your domain and follow the DNS instructions

---

## Accessing Your Admin Panel

Visit: `https://yourcurbvision.com/api/admin`

POST to it with:
```json
{ "adminKey": "your_admin_key_here" }
```

Or open the admin.html file locally and point it at your live URL.

---

## Unlock Codes (give these to paying customers)

- CURB2024
- CURBPRO1
- CURBVIP1
- EDGE2024
- CURB0001

Add more by editing the UNLOCK_CODES array in public/index.html

---

## Swapping the Stripe Link to Live Mode

When you're ready to go live (not test mode):
1. In Stripe dashboard, create a new Payment Link in LIVE mode
2. Replace `https://buy.stripe.com/test_4gMeVd5NmeiIdlB6Q50Fi00` with your live link
3. Search the codebase — it appears in 3 places: index.html (×2) and admin.js

---

## Monthly Costs Estimate

| Users | Gemini API cost | Vercel | Revenue |
|-------|----------------|--------|---------|
| 10    | ~$8/mo         | Free   | $490    |
| 50    | ~$40/mo        | Free   | $2,450  |
| 100   | ~$80/mo        | Free   | $4,900  |
