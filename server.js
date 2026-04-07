require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = GEMINI_KEY
  ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`
  : null;

// ── TRUST PROXY — required for Railway, fixes rate-limit error ──
app.set('trust proxy', 1);

// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'Public')));

// ── RATE LIMITING ──
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests — please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ── DATABASE ──
const dbPath = process.env.DB_PATH || path.join(__dirname, 'ledgerai.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    account TEXT NOT NULL,
    aliases TEXT DEFAULT '[]',
    tag TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    bank_name TEXT,
    statement_period TEXT,
    opening_balance REAL,
    closing_balance REAL,
    total_deposits REAL,
    total_checks REAL,
    total_withdrawals REAL,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    statement_id INTEGER REFERENCES statements(id) ON DELETE CASCADE,
    tx_type TEXT NOT NULL,
    tx_date TEXT,
    description TEXT,
    raw_description TEXT,
    amount REAL,
    check_number TEXT,
    qbo_account TEXT,
    matched_vendor TEXT,
    confidence TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS check_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    statement_id INTEGER REFERENCES statements(id) ON DELETE CASCADE,
    check_number TEXT,
    payee TEXT,
    amount REAL,
    check_date TEXT,
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── SEED DEFAULT VENDORS ──
const vendorCount = db.prepare('SELECT COUNT(*) as c FROM vendors').get().c;
if (vendorCount === 0) {
  const defaultVendors = [
    { name: 'Paychex',              account: 'Payroll Expense',          aliases: ['PAYCHEX-RCX','PAYCHEX EIB','PAYCHEX-HRS','PAYCHEX TPS','PAYCHEX PAYROLL','PAYCHEX INC','PAYCHEX SUNNY','PAYCHEX*'],  tag: 'Payroll'    },
    { name: 'Kaiser Foundation',    account: 'Insurance Expense',        aliases: ['KAISERFOUNDATION','KAISER FOUND','KAISER PERMANENTE','KAISERPERM'],                                                   tag: 'Insurance'  },
    { name: 'Accident Fund',        account: 'Insurance Expense',        aliases: ['ACCIDENT FUND','ACCIDENTFUND'],                                                                                       tag: 'Insurance'  },
    { name: 'Dominion Energy',      account: 'Utilities',                aliases: ['DOMINION ENERGY','DOMINION VA','DOMINION POWER','BILLPAY DOMINION'],                                                  tag: 'Utilities'  },
    { name: 'Cox Communications',   account: 'Telephone Expense',        aliases: ['COX COMM','COX COMMUNICATIONS','COX COMM SERVICE'],                                                                   tag: 'Telecom'    },
    { name: 'T-Mobile',             account: 'Telephone Expense',        aliases: ['TMOBILE','T MOBILE','TMOBILE*AUTO PAY','T-MOBILE AUTO'],                                                              tag: 'Telecom'    },
    { name: 'EZPassVA',             account: 'Automobile Expense',       aliases: ['EZPASSVA','EZPASS VA','EZPASS AUTO REPL','EZPASSVA AUTO REPL'],                                                       tag: 'Tolls'      },
    { name: 'Sandata Technologies', account: 'Subscriptions & Software', aliases: ['SANDATA','SANDATA TECHNOLOGI','SANDATA TECHNOLOGIES'],                                                                tag: 'Technology' },
    { name: 'Amazon',               account: 'Office Supplies',          aliases: ['AMZN','AMZ','AMAZON.COM','AMAZON MKTPL','AMAZON RETA','AMZN MKTP','AMAZON WEB','AMAZON PRIME'],                      tag: 'Retail'     },
    { name: 'Costco',               account: 'Office Supplies',          aliases: ['COSTCO','COSTCO WHSE','COSTCO WHOLESALE'],                                                                            tag: 'Retail'     },
    { name: 'Walmart',              account: 'Office Supplies',          aliases: ['WAL-MART','WALMART','WMT','WAL MART','WALMART #'],                                                                    tag: 'Retail'     },
    { name: 'UPS Store',            account: 'Shipping & Freight',       aliases: ['THE UPS STORE','UPS STORE','UPS STORE #'],                                                                            tag: 'Shipping'   },
    { name: 'Office Depot',         account: 'Office Supplies',          aliases: ['OFFICE DEPOT','OFFICEMAX','OFFICE DEPOT #'],                                                                          tag: 'Office'     },
    { name: 'Morton G. Thalhimer',  account: 'Rent Expense',             aliases: ['MORTON G. THALHI','MORTON THALHI','THALHIMER'],                                                                      tag: 'Rent'       },
    { name: 'Fredericksburg Water', account: 'Water & Sewer',            aliases: ['FREDERICKSBURGVA','FREDERICKSBURG VA WATER'],                                                                         tag: 'Utilities'  },
    { name: 'Sentara Health',       account: 'Healthcare Revenue',       aliases: ['SENTARAHP405','ZP SENTARAHP405','SENTARA','HCCLAIMPMT ZP SENTARA'],                                                   tag: 'Healthcare' },
    { name: 'UHC Community Plan',   account: 'Healthcare Revenue',       aliases: ['UHC COMMUNITY PL','UHC COMMUNITY','HCCLAIMPMT UHC'],                                                                  tag: 'Healthcare' },
    { name: 'Anthem Blue Cross',    account: 'Healthcare Revenue',       aliases: ['ANTHEM BLUE VA5C','ANTHEM BLUE','HCCLAIMPMT ANTHEM'],                                                                 tag: 'Healthcare' },
    { name: 'HNB Echo',             account: 'Healthcare Revenue',       aliases: ['HNB - ECHO','HNB ECHO','HCCLAIMPMT HNB'],                                                                             tag: 'Healthcare' },
    { name: 'Service Charge',       account: 'Bank Charges & Fees',      aliases: ['SERVICE CHARGES','SERVICE CHARGE','SERVICE CHARGES - PRIOR'],                                                         tag: 'Banking'    },
    { name: 'Shell Oil',            account: 'Automobile Expense',       aliases: ['SHELL','SHELL OIL','SHELL GAS','SHELL #'],                                                                            tag: 'Fuel'       },
    { name: 'ExxonMobil',           account: 'Automobile Expense',       aliases: ['EXXON','MOBIL','EXXONMOBIL','EXXON #'],                                                                               tag: 'Fuel'       },
    { name: 'BP',                   account: 'Automobile Expense',       aliases: ['BP GAS','BP AMOCO','BP #'],                                                                                           tag: 'Fuel'       },
    { name: 'Chevron',              account: 'Automobile Expense',       aliases: ['CHEVRON','TEXACO','CHEVRON #'],                                                                                       tag: 'Fuel'       },
    { name: 'AT&T',                 account: 'Telephone Expense',        aliases: ['ATT','AT&T MOBILITY','AT&T WIRELESS','AT T'],                                                                         tag: 'Telecom'    },
    { name: 'Verizon',              account: 'Telephone Expense',        aliases: ['VRZN','VZW','VERIZON WIRELESS','VZWRLSS'],                                                                            tag: 'Telecom'    },
    { name: 'Comcast',              account: 'Utilities',                aliases: ['COMCAST','XFINITY','COMCAST CABLE'],                                                                                  tag: 'Utilities'  },
    { name: "McDonald's",           account: 'Meals & Entertainment',    aliases: ['MCDONALDS','MCD','MC DONALDS'],                                                                                       tag: 'Food'       },
    { name: 'Starbucks',            account: 'Meals & Entertainment',    aliases: ['SBUX','STARBUCKS','STARBUCKS #'],                                                                                     tag: 'Food'       },
    { name: 'Home Depot',           account: 'Repairs & Maintenance',    aliases: ['HOME DEPOT','THD','THE HOME DEPOT','HOME DEPOT #'],                                                                   tag: 'Hardware'   },
    { name: "Lowe's",               account: 'Repairs & Maintenance',    aliases: ['LOWES',"LOWE'S",'LOWE HOME'],                                                                                        tag: 'Hardware'   },
    { name: 'FedEx',                account: 'Shipping & Freight',       aliases: ['FEDEX','FEDERAL EXPRESS','FDX'],                                                                                      tag: 'Shipping'   },
    { name: 'Microsoft',            account: 'Subscriptions & Software', aliases: ['MSFT','MICROSOFT','MS AZURE','MICROSOFT 365'],                                                                        tag: 'Technology' },
    { name: 'Zoom',                 account: 'Subscriptions & Software', aliases: ['ZOOM','ZOOM.US','ZOOM VIDEO'],                                                                                        tag: 'Technology' },
    { name: 'Uber',                 account: 'Travel Expense',           aliases: ['UBER','UBER*TRIP','UBER EATS'],                                                                                       tag: 'Transport'  },
    { name: 'Delta Airlines',       account: 'Travel Expense',           aliases: ['DELTA','DELTA AIR','DELTA AIRLINES'],                                                                                 tag: 'Travel'     },
    { name: 'Marriott',             account: 'Travel Expense',           aliases: ['MARRIOTT','MARRIOTT HTL'],                                                                                            tag: 'Travel'     },
    { name: 'State Farm',           account: 'Insurance Expense',        aliases: ['STATE FARM','STATEFARM'],                                                                                             tag: 'Insurance'  },
    { name: 'Geico',                account: 'Insurance Expense',        aliases: ['GEICO','GEICO INSURANCE'],                                                                                            tag: 'Insurance'  },
  ];
  const insert = db.prepare('INSERT INTO vendors (name, account, aliases, tag) VALUES (?, ?, ?, ?)');
  const insertMany = db.transaction((vendors) => {
    for (const v of vendors) insert.run(v.name, v.account, JSON.stringify(v.aliases), v.tag);
  });
  insertMany(defaultVendors);
  console.log(`✓ Seeded ${defaultVendors.length} default vendors`);
}

// ── VENDOR MATCHING ──
function norm(s) { return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function buildVendorIndex() {
  const vendors = db.prepare('SELECT * FROM vendors').all();
  const index = new Map();
  for (const v of vendors) {
    const aliases = JSON.parse(v.aliases || '[]');
    index.set(norm(v.name), v);
    for (const a of aliases) index.set(norm(a), v);
  }
  return index;
}

function matchVendor(desc) {
  if (!desc) return null;
  const idx = buildVendorIndex();
  const n = norm(desc);
  if (idx.has(n)) return { vendor: idx.get(n), conf: 'HIGH' };
  for (const [k, v] of idx) { if (k.length >= 3 && n.includes(k)) return { vendor: v, conf: 'HIGH' }; }
  for (const [k, v] of idx) { if (k.length >= 4 && n.includes(k.substring(0, 4))) return { vendor: v, conf: 'MEDIUM' }; }
  return null;
}

// ── GEMINI HELPER ──
async function callGemini(parts, maxTokens = 2500) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set in environment variables');
  const body = { contents: [{ parts }], generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens } };
  const res = await fetch(GEMINI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || `Gemini error ${res.status}`); }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseJSON(raw) {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); }
  catch (e) { const m = cleaned.match(/\{[\s\S]+\}/); if (m) return JSON.parse(m[0]); throw new Error('Could not parse response'); }
}

// ── OFX DATE HELPER ──
function toOFXDate(dateStr) {
  if (!dateStr) return new Date().toISOString().slice(0,10).replace(/-/g,'') + '120000';
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [m, d, y] = parts;
    return `${y}${m.padStart(2,'0')}${d.padStart(2,'0')}120000`;
  }
  return new Date().toISOString().slice(0,10).replace(/-/g,'') + '120000';
}

// ── QBO FILE BUILDER ──
function buildQBO(txList, bankId, acctId, closingBalance, dtStart, dtEnd) {
  const dtNow = new Date().toISOString().slice(0,10).replace(/-/g,'') + '120000';
  const trnLines = txList.map((t, i) => {
    let trnType;
    if (t.tx_type === 'DEPOSIT')       trnType = 'CREDIT';
    else if (t.tx_type === 'CHECK')    trnType = 'CHECK';
    else {
      const d = (t.description || '').toUpperCase();
      if (d.includes('ATM'))                                       trnType = 'ATM';
      else if (d.includes('FEE') || d.includes('CHARGE') || d.includes('SERVICE')) trnType = 'FEE';
      else if (d.includes('ACH') || d.includes('DIRECT'))         trnType = 'DIRECTDEBIT';
      else if (d.includes('POS') || d.includes('PURCHASE') || d.includes('CARD')) trnType = 'POS';
      else                                                         trnType = 'DEBIT';
    }
    const amt   = t.tx_type === 'DEPOSIT' ?  Math.abs(t.amount||0).toFixed(2) : (-Math.abs(t.amount||0)).toFixed(2);
    const fitId = `LGAI${String(i+1).padStart(8,'0')}`;
    const name  = (t.description || t.raw_description || 'Transaction').slice(0,32).replace(/[<>&"]/g,'');
    const memo  = (t.qbo_account || t.account || '').replace(/[<>&"]/g,'');
    let line = `<STMTTRN>\n<TRNTYPE>${trnType}</TRNTYPE>\n<DTPOSTED>${toOFXDate(t.tx_date||t.date)}</DTPOSTED>\n<TRNAMT>${amt}</TRNAMT>\n<FITID>${fitId}</FITID>\n<NAME>${name}</NAME>`;
    if (t.check_number) line += `\n<CHECKNUM>${t.check_number}</CHECKNUM>`;
    if (memo)           line += `\n<MEMO>${memo}</MEMO>`;
    line += `\n</STMTTRN>`;
    return line;
  }).join('\n');

  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<DTSERVER>${dtNow}</DTSERVER>
<LANGUAGE>ENG</LANGUAGE>
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1001</TRNUID>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<STMTRS>
<CURDEF>USD</CURDEF>
<BANKACCTFROM>
<BANKID>${bankId}</BANKID>
<ACCTID>${acctId}</ACCTID>
<ACCTTYPE>CHECKING</ACCTTYPE>
</BANKACCTFROM>
<BANKTRNLIST>
<DTSTART>${dtStart}</DTSTART>
<DTEND>${dtEnd}</DTEND>
${trnLines}
</BANKTRNLIST>
<LEDGERBAL>
<BALAMT>${(closingBalance||0).toFixed(2)}</BALAMT>
<DTASOF>${dtNow}</DTASOF>
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
}

// ════════════════════════════════════════
// API ROUTES
// ════════════════════════════════════════

// ── HEALTH ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LedgerAI server running', gemini: !!GEMINI_KEY });
});

// ── TEST GEMINI CONNECTION ──
app.get('/api/test-gemini', async (req, res) => {
  if (!GEMINI_KEY) return res.status(400).json({ ok: false, error: 'GEMINI_API_KEY is not set' });
  try {
    const text = await callGemini([{ text: 'Reply with the single word: OK' }], 10);
    res.json({ ok: true, model: 'gemini-2.0-flash', response: text.trim() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── PROCESS PAGE (vision) ──
app.post('/api/process-page', async (req, res) => {
  try {
    const { base64, mimeType, pageNum, totalPages } = req.body;
    if (!base64) return res.status(400).json({ error: 'No image data provided' });

    const prompt = `You are reading page ${pageNum} of ${totalPages} of a bank statement image. Extract ALL financial transactions visible on this page.

Return ONLY valid JSON — no markdown, no explanation:

{
  "transactions": [
    {
      "date": "MM/DD/YYYY",
      "type": "DEPOSIT or DEBIT or CHECK",
      "check_number": "1234 or null",
      "description": "clean vendor name",
      "raw_description": "exact text as printed on statement",
      "amount": 123.45
    }
  ],
  "summary": {
    "bank_name": "Truist or Chase or Bank of America or Wells Fargo or PNC or null",
    "statement_period": "April 2025 or null",
    "opening_balance": 12345.67,
    "closing_balance": 12345.67,
    "total_deposits": 12345.67,
    "total_checks": 12345.67,
    "total_withdrawals": 12345.67
  },
  "check_images": [
    {
      "check_number": "1202",
      "amount": 35000.00,
      "payee": "Name written on check",
      "date": "MM/DD/YYYY",
      "memo": "memo line text"
    }
  ]
}

RULES:
- DEPOSIT = money IN (credits, deposits, insurance payments, ACH credits, wire in)
- DEBIT = money OUT (purchases, ACH debits, withdrawals, bill pay, service charges, wire out)
- CHECK = paper check (listed in checks table OR visible as a scanned check image on the page)
- check_images = ONLY when you can physically SEE a scanned check image on page. Read the handwritten payee, date, memo, amount.
- All amounts must be positive numbers — no dollar signs, no commas
- summary fields: only fill if actually visible on this page, leave others out
- If page has no transactions (legal text, disclosures, blank), return empty transactions array
- Return ONLY the JSON object, absolutely nothing else`;

    const raw = await callGemini([
      { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64 } },
      { text: prompt }
    ]);

    const result = parseJSON(raw);

    if (result.transactions) {
      result.transactions = result.transactions.map(tx => {
        const match = matchVendor(tx.description || tx.raw_description);
        if (match) { tx.account = match.vendor.account; tx.matched_vendor = match.vendor.name; tx.confidence = match.conf; }
        else { tx.confidence = 'LOW'; }
        return tx;
      });
    }

    res.json(result);
  } catch (e) {
    console.error('process-page error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── CATEGORIZE UNMATCHED ──
app.post('/api/categorize', async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!transactions?.length) return res.json([]);
    const accounts = ['Office Supplies','Automobile Expense','Telephone Expense','Utilities','Meals & Entertainment','Travel Expense','Insurance Expense','Rent Expense','Payroll Expense','Payroll Taxes','401(k) / Retirement','Bank Charges & Fees','Professional Fees','Repairs & Maintenance','Subscriptions & Software','Shipping & Freight','Water & Sewer','Healthcare Revenue','Sales Revenue','Other Income','Uncategorized Expense'];
    const list = transactions.slice(0,60).map(t => `${t.id}|${t.raw_description||t.description}|$${t.amount}`).join('\n');
    const prompt = `Categorize these bank transactions for QuickBooks.\nTransactions (id|description|amount):\n${list}\n\nAvailable accounts: ${accounts.join(', ')}\n\nReturn ONLY a JSON array:\n[{"id":"T1","account":"Account Name"}]`;
    const raw = await callGemini([{ text: prompt }], 1000);
    res.json(JSON.parse(raw.replace(/```json|```/g,'').trim()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── OCR CHECK IMAGE ──
app.post('/api/ocr-check', async (req, res) => {
  try {
    const { base64, mimeType } = req.body;
    if (!base64) return res.status(400).json({ error: 'No image provided' });
    const raw = await callGemini([
      { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64 } },
      { text: 'Read this bank check image carefully. Extract: check_number, date, payee (Pay to the order of), amount_numeric, amount_written, memo, has_signature (true/false). Return ONLY valid JSON.' }
    ], 400);
    res.json(parseJSON(raw));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CHAT ──
app.post('/api/chat', async (req, res) => {
  try {
    const { message, context } = req.body;
    const prompt = `You are LedgerAI, an accounting assistant.
Statement data:
- Deposits (${context.deposits?.length||0}): ${JSON.stringify(context.deposits?.slice(0,25)||[])}
- Debits (${context.debits?.length||0}): ${JSON.stringify(context.debits?.slice(0,35)||[])}
- Checks (${context.checks?.length||0}): ${JSON.stringify(context.checks||[])}
- Summary: ${JSON.stringify(context.summary||{})}

Answer this question concisely: ${message}

For transaction tables use plain HTML with these CSS classes:
- Wrapper: <div class="txw"><table class="txt">...</table></div>
- Type badges: <span class="tag dep">DEPOSIT</span> <span class="tag dbt">DEBIT</span> <span class="tag chk">CHECK</span>
- Amounts: <span class="amc">+$X</span> for deposits, <span class="amd">-$X</span> for debits
- Account: <span class="acct">Account Name</span>`;
    const raw = await callGemini([{ text: prompt }], 1500);
    res.json({ reply: raw });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SAVE STATEMENT ──
app.post('/api/statements', (req, res) => {
  try {
    const { filename, summary, deposits, debits, checks, checkImages } = req.body;
    const stmt = db.prepare(`INSERT INTO statements (filename,bank_name,statement_period,opening_balance,closing_balance,total_deposits,total_checks,total_withdrawals) VALUES (?,?,?,?,?,?,?,?)`
    ).run(filename, summary?.bank_name||null, summary?.statement_period||null, summary?.opening_balance||null, summary?.closing_balance||null, summary?.total_deposits||null, summary?.total_checks||null, summary?.total_withdrawals||null);
    const sid = stmt.lastInsertRowid;
    const insertTx = db.prepare(`INSERT INTO transactions (statement_id,tx_type,tx_date,description,raw_description,amount,check_number,qbo_account,matched_vendor,confidence) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const insertAll = db.transaction((list, type) => { for (const t of list) insertTx.run(sid, type, t.date, t.description, t.raw_description, t.amount, t.check_number||null, t.account||null, t.matched_vendor||null, t.confidence||null); });
    insertAll(deposits||[], 'DEPOSIT');
    insertAll(debits||[], 'DEBIT');
    insertAll(checks||[], 'CHECK');
    if (checkImages?.length) {
      const insertChk = db.prepare(`INSERT INTO check_images (statement_id,check_number,payee,amount,check_date,memo) VALUES (?,?,?,?,?,?)`);
      db.transaction((imgs) => { for (const ci of imgs) insertChk.run(sid, ci.check_number||null, ci.payee||null, ci.amount||null, ci.date||ci.txDate||null, ci.memo||null); })(checkImages);
    }
    res.json({ success: true, statementId: sid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET STATEMENT HISTORY ──
app.get('/api/statements', (req, res) => {
  try {
    const list = db.prepare(`SELECT s.*,
      (SELECT COUNT(*) FROM transactions WHERE statement_id=s.id AND tx_type='DEPOSIT') as deposit_count,
      (SELECT COUNT(*) FROM transactions WHERE statement_id=s.id AND tx_type='DEBIT')   as debit_count,
      (SELECT COUNT(*) FROM transactions WHERE statement_id=s.id AND tx_type='CHECK')   as check_count,
      (SELECT SUM(amount) FROM transactions WHERE statement_id=s.id AND tx_type='DEPOSIT') as deposit_total,
      (SELECT SUM(amount) FROM transactions WHERE statement_id=s.id AND tx_type='DEBIT')   as debit_total,
      (SELECT SUM(amount) FROM transactions WHERE statement_id=s.id AND tx_type='CHECK')   as check_total
      FROM statements s ORDER BY processed_at DESC LIMIT 100`).all();
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET TRANSACTIONS FOR A STATEMENT ──
app.get('/api/statements/:id/transactions', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM transactions WHERE statement_id=? ORDER BY tx_date,id').all(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE STATEMENT ──
app.delete('/api/statements/:id', (req, res) => {
  try { db.prepare('DELETE FROM statements WHERE id=?').run(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EXPORT CSV ──
app.get('/api/statements/:id/export/csv', (req, res) => {
  try {
    const txs  = db.prepare('SELECT * FROM transactions WHERE statement_id=? ORDER BY tx_date,id').all(req.params.id);
    const stmt = db.prepare('SELECT * FROM statements WHERE id=?').get(req.params.id);
    const headers = ['Date','Type','Check Number','Description','Amount','DR/CR','QBO Account','Matched Vendor','Confidence'];
    const rows = txs.map(t => [t.tx_date||'', t.tx_type||'', t.check_number||'', `"${(t.description||'').replace(/"/g,'""')}"`, (t.amount||0).toFixed(2), t.tx_type==='DEPOSIT'?'CR':'DR', `"${t.qbo_account||'Uncategorized'}"`, `"${t.matched_vendor||''}"`, t.confidence||'']);
    const csv = [headers.join(','), ...rows.map(r=>r.join(','))].join('\n');
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition',`attachment; filename="${stmt?.filename||'statement'}-import.csv"`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EXPORT IIF ──
app.get('/api/statements/:id/export/iif', (req, res) => {
  try {
    const txs = db.prepare('SELECT * FROM transactions WHERE statement_id=? ORDER BY tx_date,id').all(req.params.id);
    const lines = ['!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM','!SPL\tTRNSTYPE\tDATE\tACCNT\tAMOUNT','!ENDTRNS'];
    txs.forEach(t => {
      const type = t.tx_type==='DEPOSIT'?'DEPOSIT':t.tx_type==='CHECK'?'CHECK':'EXPENSE';
      const amt  = t.tx_type==='DEPOSIT'?t.amount:-t.amount;
      const acc  = t.qbo_account||'Uncategorized Expense';
      lines.push(`TRNS\t${type}\t${t.tx_date||''}\tChecking\t${t.description||''}\t${amt.toFixed(2)}\t${t.check_number||''}`);
      lines.push(`SPL\t${type}\t${t.tx_date||''}\t${acc}\t${(-amt).toFixed(2)}`);
      lines.push('ENDTRNS');
    });
    res.setHeader('Content-Type','text/plain');
    res.setHeader('Content-Disposition','attachment; filename="qbo-import.iif"');
    res.send(lines.join('\n'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EXPORT QBO (best format — 1-click import into QuickBooks Online & Desktop) ──
app.get('/api/statements/:id/export/qbo', (req, res) => {
  try {
    const txs  = db.prepare('SELECT * FROM transactions WHERE statement_id=? ORDER BY tx_date,id').all(req.params.id);
    const stmt = db.prepare('SELECT * FROM statements WHERE id=?').get(req.params.id);
    if (!txs.length) return res.status(404).json({ error: 'No transactions found' });
    const dates  = txs.map(t=>t.tx_date).filter(Boolean).sort();
    const dtStart = dates.length ? toOFXDate(dates[0]) : toOFXDate(null);
    const dtEnd   = dates.length ? toOFXDate(dates[dates.length-1]) : toOFXDate(null);
    const bankId  = (stmt?.bank_name||'LEDGERAI').replace(/\s/g,'').toUpperCase().slice(0,9);
    const acctId  = stmt?.filename?.match(/\d{6,}/)?.[0] || 'CHECKING001';
    const qbo = buildQBO(txs, bankId, acctId, stmt?.closing_balance||0, dtStart, dtEnd);
    const fname = (stmt?.filename||'statement').replace(/\.pdf$/i,'') + '.qbo';
    res.setHeader('Content-Type','application/x-ofx');
    res.setHeader('Content-Disposition',`attachment; filename="${fname}"`);
    res.send(qbo);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EXPORT QBO (POST — for in-memory data without saved statement) ──
app.post('/api/export/qbo', (req, res) => {
  try {
    const { deposits=[], debits=[], checks=[], summary={}, filename='statement' } = req.body;
    const allTx = [
      ...deposits.map(t=>({...t,tx_type:'DEPOSIT'})),
      ...debits.map(t=>({...t,tx_type:'DEBIT'})),
      ...checks.map(t=>({...t,tx_type:'CHECK'})),
    ].sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    const dates   = allTx.map(t=>t.date).filter(Boolean).sort();
    const dtStart = dates.length ? toOFXDate(dates[0]) : toOFXDate(null);
    const dtEnd   = dates.length ? toOFXDate(dates[dates.length-1]) : toOFXDate(null);
    const bankId  = (summary.bank_name||'LEDGERAI').replace(/\s/g,'').toUpperCase().slice(0,9);
    const qbo = buildQBO(allTx, bankId, 'CHECKING001', summary.closing_balance||0, dtStart, dtEnd);
    const fname = filename.replace(/\.pdf$/i,'') + '.qbo';
    res.setHeader('Content-Type','application/x-ofx');
    res.setHeader('Content-Disposition',`attachment; filename="${fname}"`);
    res.send(qbo);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VENDORS CRUD ──
app.get('/api/vendors', (req, res) => {
  try {
    const vendors = db.prepare('SELECT * FROM vendors ORDER BY name').all();
    res.json(vendors.map(v => ({ ...v, aliases: JSON.parse(v.aliases||'[]') })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/vendors', (req, res) => {
  try {
    const { name, account, aliases, tag } = req.body;
    if (!name||!account) return res.status(400).json({ error: 'Name and account required' });
    const result = db.prepare('INSERT OR REPLACE INTO vendors (name,account,aliases,tag,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)').run(name, account, JSON.stringify(aliases||[]), tag||'');
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/vendors/:id', (req, res) => {
  try {
    const { name, account, aliases, tag } = req.body;
    if (!name||!account) return res.status(400).json({ error: 'Name and account required' });
    db.prepare('UPDATE vendors SET name=?,account=?,aliases=?,tag=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name, account, JSON.stringify(aliases||[]), tag||'', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/vendors/:id', (req, res) => {
  try { db.prepare('DELETE FROM vendors WHERE id=?').run(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/vendors/import', (req, res) => {
  try {
    const { vendors } = req.body;
    const upsert = db.prepare('INSERT OR REPLACE INTO vendors (name,account,aliases,tag,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)');
    db.transaction((list) => { for (const v of list) upsert.run(v.name, v.account, JSON.stringify(v.aliases||[]), v.tag||''); })(vendors||[]);
    res.json({ success: true, count: vendors?.length||0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SERVE FRONTEND — catch-all must be LAST ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 LedgerAI server running on http://localhost:${PORT}`);
  console.log(`📊 Database: ${dbPath}`);
  console.log(`🤖 Gemini API: ${GEMINI_KEY ? '✓ configured' : '✗ GEMINI_API_KEY not set'}\n`);
});
