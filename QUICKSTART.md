# 🚀 QASmart - Quick Start Guide

Get up and running in 5 minutes!

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Start the Server

```bash
# Smart start (recommended) - automatically finds available port
npm run smart-start

# Or regular start on port 3000
npm start
```

The server will start on `http://localhost:3000` (or next available port)

---

## שימושים בסיסיים

### 📥 ייבוא נתוני שיחות מאקסל
1. לחץ **"📥 ייבוא אקסל"**
2. בחר קובץ Excel/CSV
3. הנתונים יופיעו בטבלה

### 🎤 בדיקת קובץ אודיו (עם n8n)
1. גרור קובץ MP3/WAV לאזור ההעלאה
2. המערכת תתמלל ותנתח אוטומטית
3. התוצאות יופיעו בחלון

---

## אינטגרציה עם n8n (אופציונלי)

### רוצה תמלול ואנליזה אוטומטית?

#### אופציה 1: n8n Cloud (קל ומהיר)
1. פתח חשבון ב-[n8n.cloud](https://n8n.cloud) (חינם)
2. ייבא את `n8n-workflow-example.json`
3. הגדר OpenAI API key
4. העתק את ה-Webhook URL
5. צור קובץ `.env`:
```bash
N8N_WEBHOOK_URL=https://your-n8n.cloud/webhook/audio-qa-check
```
6. הפעל מחדש את השרת

#### אופציה 2: n8n מקומי (Docker)
```bash
docker run -it --rm --name n8n -p 5678:5678 -v ~/.n8n:/home/node/.n8n n8nio/n8n
```
אז עקוב אחרי השלבים באופציה 1 (עם `http://localhost:5678`)

#### ללא n8n?
המערכת תעבוד עם תשובות דמה (mock) - אפשר לייבא Excel/CSV ולעבוד עם הנתונים בלי בעיה!

---

## קבצי עזר

- **README.md** - תיעוד מלא
- **N8N-SETUP.md** - מדריך מפורט ל-n8n
- **n8n-workflow-example.json** - workflow מוכן לשימוש

---

## שאלות נפוצות

**איך מייבאים אקסל?**
הקובץ צריך עמודות: שם קובץ, סטטוס, הסבר שיטות, חיוב, כתובת...

**איך מוסיפים רשומה ידנית?**
לחץ **"➕ הוסף רשומה"** ומלא את השדות.

**למה הדשבורד ריק?**
צריך לייבא Excel או להוסיף רשומות. אין נתונים מראש.

**למה האודיו לא עובד?**
צריך להגדיר n8n והוסיף N8N_WEBHOOK_URL ל-.env

---

**זה הכל! בהצלחה! 🚀**


