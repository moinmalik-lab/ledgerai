# LedgerAI — Backend Server Edition

AI-powered bank statement processor for QuickBooks. Reads Truist, Chase, BofA, Wells Fargo, PNC, and United Bank statements using Google Gemini vision AI.

## What's included

- **Node.js + Express** backend server
- **SQLite database** — permanently stores vendor rules and transaction history
- **Gemini 1.5 Flash** vision AI — reads each page as an image (free tier: 1,500 pages/day)
- Full web interface — works for your whole team from any browser

---

## Deployment — Railway.app (recommended, ~$5/month)

### Step 1 — Get a free Gemini API key
1. Go to https://aistudio.google.com/app/apikey
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the key (starts with `AIza…`) — keep it safe

### Step 2 — Create a GitHub repository
1. Go to https://github.com and sign up (free)
2. Click **"New repository"**
3. Name it `ledgerai` — make it **Private**
4. Click **"Create repository"**

### Step 3 — Upload these files to GitHub
Upload all these files maintaining the folder structure:
```
ledgerai/
├── server.js
├── package.json
├── .env.example
├── README.md
└── public/
    └── index.html
```

**Option A — GitHub Desktop (easiest):**
1. Download GitHub Desktop from desktop.github.com
2. Clone your new repository
3. Copy these files into the cloned folder
4. Click "Commit to main" then "Push origin"

**Option B — GitHub web upload:**
1. Open your repository on github.com
2. Click "Add file" → "Upload files"
3. Drag all files in (create the `public` folder manually first)

### Step 4 — Deploy to Railway
1. Go to https://railway.app and sign up with your GitHub account
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `ledgerai` repository
4. Railway will detect it's a Node.js app automatically
5. Click **"Deploy"**

### Step 5 — Add your API key to Railway
1. In your Railway project, click on your service
2. Go to **"Variables"** tab
3. Click **"New Variable"**
4. Add: `GEMINI_API_KEY` = `AIzaSy...your key here`
5. Railway will automatically redeploy

### Step 6 — Get your URL
1. Go to your Railway project → **"Settings"** → **"Domains"**
2. Click **"Generate Domain"**
3. You'll get a URL like: `https://ledgerai-production.up.railway.app`
4. **Share this URL with your team** — everyone can use it

---

## Running locally (for testing before deploying)

### Requirements
- Node.js 18+ installed (download from nodejs.org)

### Setup
```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env

# 3. Edit .env and add your Gemini API key
# Open .env in any text editor and fill in your key

# 4. Start the server
npm start
```

Open http://localhost:3000 in your browser.

For development with auto-restart:
```bash
npm run dev
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ Yes | Your Google Gemini API key from aistudio.google.com |
| `PORT` | No | Server port (Railway sets this automatically) |
| `DB_PATH` | No | Path to SQLite database file (default: `./ledgerai.db`) |

---

## File structure

```
ledgerai/
├── server.js          ← Express server, all API endpoints, database setup
├── package.json       ← Dependencies
├── .env.example       ← Environment variables template
├── ledgerai.db        ← SQLite database (created automatically on first run)
└── public/
    └── index.html     ← Full web interface (served by the server)
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Server status check |
| POST | `/api/process-page` | Read a PDF page image with Gemini vision |
| POST | `/api/categorize` | Categorize unmatched transactions |
| POST | `/api/ocr-check` | Read a check image with OCR |
| POST | `/api/chat` | Chat about transactions |
| GET | `/api/statements` | List all processed statements |
| POST | `/api/statements` | Save a processed statement |
| DELETE | `/api/statements/:id` | Delete a statement |
| GET | `/api/statements/:id/transactions` | Get transactions for a statement |
| GET | `/api/statements/:id/export/csv` | Download CSV for QuickBooks |
| GET | `/api/statements/:id/export/iif` | Download IIF file for QuickBooks |
| GET | `/api/vendors` | List all vendors |
| POST | `/api/vendors` | Add a vendor |
| PUT | `/api/vendors/:id` | Update a vendor |
| DELETE | `/api/vendors/:id` | Delete a vendor |
| POST | `/api/vendors/import` | Bulk import vendors |

---

## QuickBooks Import Instructions

### CSV Import (QuickBooks Online):
1. In QBO, go to **Banking** → **Upload**  
   Or: **Transactions** → **Import**
2. Select the exported CSV file
3. Map columns: Date, Description, Amount, Account
4. Review and accept

### IIF Import (QuickBooks Desktop):
1. Go to **File** → **Utilities** → **Import** → **IIF Files**
2. Select the exported IIF file
3. QuickBooks will import all transactions with accounts pre-assigned

---

## Costs

| Service | Cost |
|---|---|
| Gemini 1.5 Flash API | **Free** — up to 1,500 pages/day |
| Railway hosting | ~$5/month (Hobby plan) |
| **Total** | **~$5/month** |

Railway has a free tier but it sleeps after inactivity. The $5/month Hobby plan keeps it always-on.

---

## Supported Banks
- Truist Bank
- Chase
- Bank of America
- Wells Fargo
- PNC Bank
- United Bank
- Most other US banks (Gemini reads visually, not by format)
