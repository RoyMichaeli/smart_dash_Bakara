# ⚡ הגדרה מהירה - חיבור n8n לדשבורד

## 🎯 מידע חשוב

**השרת שלך רץ על פורט:** `3001` (לא 3000!)

```
Server listening on http://localhost:3001
```

---

## 📋 3 צעדים פשוטים

### 1️⃣ הוסף 2 Nodes ב-n8n

#### Node 1: Parse QA Results
```
Type: Code (JavaScript)
Position: אחרי "AI Agent"
```

**הקוד:** ראה בקובץ `CONNECT_AUTOMATION_TO_DASHBOARD.md` (שורות 37-180)

#### Node 2: Send to Dashboard
```
Type: HTTP Request
Method: POST
URL: http://localhost:3001/api/qa-result
Body: ={{ JSON.stringify($json) }}
```

---

### 2️⃣ ~~הגדר משתנה סביבה~~ (לא נדרש!)

**אם יש לך מנוי Starter:** אין צורך! ה-URL כבר hardcoded:
```
http://localhost:3001/api/qa-result
```

⚠️ **חשוב:** הפורט הוא **3001** (לא 3000)!

**לשנות ל-production בעתיד:** פשוט ערוך את ה-node ושנה את ה-URL.

---

### 3️⃣ בדוק שזה עובד

```bash
# 1. וודא שהדשבורד רץ
curl http://localhost:3001/healthz
# צריך להחזיר: ok

# 2. העלה קובץ אודיו לאוטומציה

# 3. בדוק בדשבורד
open http://localhost:3001
```

---

## 🔗 חיבורים

```
AI Agent
    ↓
Parse QA Results (NEW)
    ↓
Send to Dashboard (NEW)
    ↓
http://localhost:3001/api/qa-result
```

---

## 🧪 בדיקה מהירה

אם הכל עובד, תראה בלוגים:

```
[QA Result] Received for file: test.wav
[QA Result] Stored in dataset qa-automation-xxx
```

ובדשבורד:
```
┌────────────┬────────┬────────┐
│ test.wav   │ תקין   │  ✅    │
└────────────┴────────┴────────┘
```

---

## 📁 קבצים למדריך מלא

- `CONNECT_AUTOMATION_TO_DASHBOARD.md` - מדריך מפורט עם קוד
- `AUTOMATION_FLOW_DIAGRAM.md` - תרשים ויזואלי
- `n8n_nodes_to_add.json` - הגדרות JSON

---

## ⚠️ שגיאות נפוצות

### "Connection refused"
```bash
# בדוק שהדשבורד רץ
ps aux | grep node
# אמור לראות: node server.js

# בדוק את הפורט
lsof -i :3001
```

### "404 Not Found"
```bash
# בדוק את ה-URL
echo $DASHBOARD_URL
# צריך: http://localhost:3001

# בדוק שה-endpoint קיים
curl -X POST http://localhost:3001/api/qa-result \
  -H "Content-Type: application/json" \
  -d '{"fileName":"test.wav"}'
```

---

**זהו!** 3 צעדים פשוטים ואתה מחובר! 🎉
