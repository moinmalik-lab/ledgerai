# LedgerAI — Bank Statement Processor

AI-powered bank statement reader and QuickBooks exporter.
Supports Truist, Chase, Bank of America, Wells Fargo, PNC, United Bank.

## File Structure (upload ALL of these to GitHub)

```
ledgerai/
├── server.js          ← Backend server (all API endpoints)
├── package.json       ← Node.js dependencies
├── .env.example       ← Environment variable template
├── README.md          ← This file
└── public/
    └── index.html     ← Frontend web interface ← MUST be inside public/ folder
```

## Railway Deployment Steps

### 1. Add environment variable in Railway
- Railway dashboard → your service → Variables tab
- Add: GEMINI_API_KEY = your AIza... key
- Do NOT add a PORT variable — Railway sets this automatically

### 2. Generate public domain
- Settings tab → Networking → Generate Domain
- The port should auto-detect — if asked, use the same port shown in your deploy logs

### 3. Verify it works
Open: https://your-app.up.railway.app/api/health
Should return: {"status":"ok","gemini":true}

Then open: https://your-app.up.railway.app
The LedgerAI dashboard should load.

## Local Development

```bash
npm install
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
npm start
```

Open http://localhost:3000

## Getting a Free Gemini API Key

1. Go to https://aistudio.google.com/app/apikey
2. Sign in with Google account
3. Click Create API Key
4. Copy the key (starts with AIza...)

Free tier: 1,500 requests/day — plenty for daily statement processing.

## QuickBooks Import

After processing a statement, click "Export .QBO File"

- QuickBooks Online: Banking → Upload transactions → select .qbo file
- QuickBooks Desktop: File → Utilities → Import → Web Connect Files → select .qbo file
