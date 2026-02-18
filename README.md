# QASmart - מערכת ניהול איכות שיחות 🎯

מערכת חכמה לניהול, ניתוח ובקרת איכות של שיחות מכירה ושירות.
כולל אינטגרציה עם n8n לעיבוד אוטומטי, השוואה עמוקה בין AI לאנושי, וזיהוי לפי מספר מנוי.

**Production:** https://qasmart.vercel.app

## ✨ תכונות עיקריות

- **ייבוא מאקסל/CSV/JSON** — העלאה מהירה של נתוני שיחות
- **מערכת Datasets** — ניהול מספר קבוצות נתונים במקביל
- **זיהוי מספר מנוי** — חילוץ אוטומטי מ-JSON, שם קובץ, או metadata
- **חיפוש וסינון** — לפי מספר מנוי, שם קובץ, או סטטוס
- **עיבוד אודיו** — Drag & Drop → n8n → Whisper + GPT-4
- **השוואה עמוקה** — AI vs Human per-section, matching by subscriberId or fileName
- **ניתוח ו-Pivot** — גרפים, KPIs, ניתוח רב-ממדי
- **עיצוב מודרני** — RTL, responsive, glass-morphism UI

## 🏗️ ארכיטקטורה

```
qasmart/
├── api/
│   └── index.js              # Vercel serverless function (Express)
├── public/
│   └── dashboard.html        # UI — served from Vercel CDN
├── lib/
│   ├── storage.js            # Supabase Postgres KV abstraction
│   └── migration.sql         # SQL to create kv_store table
├── server.js                 # Legacy Express server (local/Render fallback)
├── vercel.json               # Vercel routing & function config
├── package.json              # Dependencies & scripts
├── .env.example              # Environment variables template
└── .gitignore
```

### Stack
- **Runtime:** Node.js 18+ / Express 5
- **Hosting:** Vercel (serverless functions + CDN)
- **Storage:** Supabase Postgres (`kv_store` table with JSONB)
- **Local fallback:** In-memory Maps (no DB needed for dev)
- **File handling:** multer memoryStorage (no disk writes)
- **Automation:** n8n (Whisper + GPT-4)

### Data Model
כל רשומה (record) מכילה:
- `subscriberId` — מספר מנוי (חילוץ אוטומטי)
- `fileName` — שם הקובץ המקורי
- `status` — סטטוס סופי (תקין/טעון שיפור/לא תקין)
- **7 סקשנים:** `methods`, `charge`, `address`, `birthDate`, `winPromise`, `credit`, `reflection`
- `transcript` — תמלול השיחה
- `metadata` — fileId, timestamp, track, confidence, etc.

### השוואה (Compare)
- **התאמה לפי subscriberId** (עדיפות ראשונה), fallback לפי fileName
- **Per-section accuracy** — כל סקשן נבדק בנפרד
- **KPIs:** totalCompared, matchedBySubscriber, matchedByFileName, overallStatusAccuracy, sectionAccuracy

## 🚀 התקנה

### פיתוח מקומי
```bash
npm install
node api/index.js          # http://localhost:3000 (in-memory storage)
```

### עם hot-reload
```bash
npm run dev                # nodemon api/index.js
```

### משתני סביבה
```bash
cp .env.example .env
# ערוך את .env עם הערכים שלך
```

## ☁️ Deployment (Vercel)

הפרויקט מחובר ל-GitHub — כל push ל-`main` עושה auto-deploy.

### Deploy ידני
```bash
vercel --prod
```

### Supabase Setup
1. חבר Supabase דרך Vercel Dashboard → Storage
2. הרץ את `lib/migration.sql` ב-Supabase SQL Editor
3. ה-env vars מוגדרים אוטומטית: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## 📊 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/datasets` | רשימת כל ה-datasets |
| `GET` | `/api/dataset/:id` | dataset ספציפי |
| `POST` | `/api/upload-excel` | ייבוא Excel/CSV |
| `POST` | `/api/upload-json` | ייבוא JSON (n8n format) |
| `POST` | `/api/process-audio` | שליחת אודיו ל-n8n |
| `POST` | `/api/transcription-callback` | callback מ-n8n |
| `GET` | `/api/transcription-result/:jobId` | תוצאת תמלול |
| `POST` | `/api/qa-result` | קבלת תוצאות QA מ-n8n |
| `GET` | `/api/compare?a=ID&b=ID` | השוואה עמוקה בין datasets |
| `GET` | `/healthz` | בדיקת תקינות |

## 🔐 אבטחה

- הגבלת סוגי וגודל קבצים (10MB Excel, 50MB אודיו)
- multer memoryStorage — אין כתיבה לדיסק
- משתני סביבה למידע רגיש
- Supabase RLS + service_role key

## 📝 הוספת שדות / התאמה

1. **Backend:** עדכן `mapRowToRecord` / `mapJsonToRecord` ב-`api/index.js` (ו-`server.js` לתאימות)
2. **Frontend:** עדכן את הטבלה ב-`public/dashboard.html`
3. **Compare:** עדכן `sectionKeys` ו-`sectionLabels` ב-endpoint `/api/compare`

---

**נבנה עם ❤️ לצורך בקרת איכות שיחות**
