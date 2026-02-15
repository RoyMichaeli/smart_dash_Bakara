# 🔄 אינטגרציה: אוטומציה → דשבורד

## סקירה כללית

המערכת מאפשרת לאוטומציית n8n לשלוח תוצאות QA ישירות לדשבורד, עם תצוגה חכמה:
- **בטבלה הראשית**: רק אייקון סטטוס (✅/⚠️/❌) לכל שדה
- **Tooltip בריחוף**: הסבר קצר על הסטטוס
- **Modal בלחיצה**: פירוט מלא עם ציטוטים, זמנים, ובעיות

---

## 📋 שלבי הגדרה

### 1. הגדרת משתנה סביבה

הוסף ל-`.env`:
```bash
DASHBOARD_URL=http://localhost:3000
# או בפרודקשן:
# DASHBOARD_URL=https://your-dashboard.onrender.com
```

### 2. הוספת Node לאוטומציה

באוטומציית n8n שלך (`smart auto irit`), הוסף את ה-node:

1. פתח את האוטומציה ב-n8n
2. אחרי ה-node **"Parse QA Results"**, הוסף **HTTP Request** node חדש
3. העתק את ההגדרות מהקובץ: `n8n_wf_qa/Send_to_Dashboard_Node.json`

או פשוט:
- **Method**: POST
- **URL**: `{{ $env.DASHBOARD_URL }}/api/qa-result`
- **Body**: JSON (ראה למטה)

#### JSON Body לשליחה:

```json
{
  "fileName": "{{ $json.fileName }}",
  "final_status": "{{ $json.final_status || $json.overall }}",
  "overall": "{{ $json.overall }}",
  
  "s1_status": "{{ $json.s1_status }}",
  "s1_why": "{{ $json.s1_why }}",
  "s1_e1": "{{ $json.s1_e1 }}",
  "s1_e2": "{{ $json.s1_e2 }}",
  
  "s2_status": "{{ $json.s2_status }}",
  "s2_why": "{{ $json.s2_why }}",
  "s2_e1": "{{ $json.s2_e1 }}",
  "s2_e2": "{{ $json.s2_e2 }}",
  
  "s3_status": "{{ $json.s3_status }}",
  "s3_why": "{{ $json.s3_why }}",
  "s3_e1": "{{ $json.s3_e1 }}",
  "s3_e2": "{{ $json.s3_e2 }}",
  "address_street_number": "{{ $json.address_street_number || '' }}",
  "address_locality": "{{ $json.address_locality || '' }}",
  
  "s4_status": "{{ $json.s4_status }}",
  "s4_why": "{{ $json.s4_why }}",
  "s4_e1": "{{ $json.s4_e1 }}",
  "dob_text": "{{ $json.dob_text || '' }}",
  
  "s5_status": "{{ $json.s5_status }}",
  "s5_why": "{{ $json.s5_why }}",
  "s5_e1": "{{ $json.s5_e1 }}",
  
  "s6_status": "{{ $json.s6_status }}",
  "s6_why": "{{ $json.s6_why }}",
  "s6_e1": "{{ $json.s6_e1 }}",
  
  "s7_status": "{{ $json.s7_status }}",
  "s7_why": "{{ $json.s7_why }}",
  "s7_e1": "{{ $json.s7_e1 }}",
  
  "transcript": "{{ $node['Normalize Transcript'].json.transcript_normalized || '' }}"
}
```

### 3. חיבור ה-Node

```
Parse QA Results → Send to Dashboard → Save to Google Sheets
                 ↘ (parallel)
```

---

## 🎨 איך זה עובד בדשבורד

### תצוגה ראשית (טבלה)

| שם הקובץ | סטטוס סופי | שיטות | חיוב | כתובת | תאריך לידה | הבטחת זכייה | אשראי | שיקוף | תמלול | פעולות |
|---------|-----------|-------|------|-------|-----------|-------------|-------|-------|-------|--------|
| 1211907.wav | 🟢 תקין | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | 📄 | 👁️ ✏️ 🗑️ |

### Tooltip (ריחוף עם העכבר)

כשמרחפים מעל שדה, מופיע tooltip עם:
```
⚠️ כתובת חלקית - חסר מספר בית
```

### Modal (לחיצה על שדה)

כשלוחצים על שדה, נפתח modal עם:

```
┌─────────────────────────────────────┐
│ כתובת                                │
├─────────────────────────────────────┤
│ קובץ: 1211907.wav                   │
│                                      │
│ ⚠️ כתובת חלקית - חסר מספר בית      │
│                                      │
│ 📝 ציטוטים מהשיחה:                  │
│ • "רחוב הרצל תל אביב"               │
│ • "ליד הקניון הגדול"                │
│                                      │
│ ⏱️ זמן בשיחה: 00:05:20              │
│                                      │
│ פרטים נוספים:                       │
│ • locality: תל אביב                  │
│ • completeness: partial              │
└─────────────────────────────────────┘
```

---

## 🔧 מבנה הנתונים

### פורמט שהאוטומציה שולחת:

```javascript
{
  fileName: "1211907.wav",
  final_status: "תקין",
  
  // כל שדה מכיל:
  s1_status: "✅",      // אייקון הסטטוס
  s1_why: "הסבר תקין", // הסבר קצר
  s1_e1: "ציטוט 1",    // ראיה ראשונה
  s1_e2: "ציטוט 2",    // ראיה שנייה
  s1_timestamp: "00:02:15", // זמן בשיחה (אופציונלי)
  
  // שדות נוספים:
  address_street_number: "15",
  address_locality: "תל אביב",
  dob_text: "12.5.1985",
  
  transcript: "התמלול המלא..."
}
```

### פורמט שהדשבורד מציג:

```javascript
{
  fileName: "1211907.wav",
  status: "תקין",
  
  methods: {
    status: "✅",
    summary: "הסבר תקין - 3 שיטות הוזכרו",
    evidence: ["ציטוט 1", "ציטוט 2"],
    timestamp: "00:02:15"
  },
  
  charge: { ... },
  address: { ... },
  // וכו'
}
```

---

## 🧪 בדיקה

### 1. הפעל את השרת:
```bash
cd /Users/shavi/qasmart
npm start
```

### 2. בדוק את ה-API:
```bash
curl -X POST http://localhost:3000/api/qa-result \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test.wav",
    "final_status": "תקין",
    "s1_status": "✅",
    "s1_why": "הסבר תקין",
    "s1_e1": "ציטוט ראשון",
    "s1_e2": "ציטוט שני",
    "transcript": "זהו תמלול לדוגמה"
  }'
```

### 3. פתח את הדשבורד:
```
http://localhost:3000
```

אמור לראות את הרשומה החדשה בטבלה!

---

## 📊 תכונות מתקדמות

### 1. Tooltip מותאם אישית
הדשבורד מציג tooltip שונה לפי סוג השדה:
- **✅ תקין**: "עבר בהצלחה"
- **⚠️ טעון שיפור**: הסבר קצר של הבעיה
- **❌ לא תקין**: הסבר מפורט של הכשל

### 2. Modal אינטראקטיבי
- לחיצה על כל שדה פותחת modal עם פירוט מלא
- ציטוטים מהשיחה מוצגים ברשימה מעוצבת
- זמן בשיחה מסומן בבירור

### 3. צפייה מלאה
כפתור "👁️ צפייה מלאה" מציג את כל השדות ביחד בממשק אחד

---

## 🚀 פריסה לפרודקשן

### 1. עדכן את ה-URL ב-n8n:
```
{{ $env.DASHBOARD_URL }}/api/qa-result
```

### 2. הגדר ב-Render/Heroku:
```
DASHBOARD_URL=https://your-dashboard.onrender.com
```

### 3. וודא שהשרת פועל:
```bash
curl https://your-dashboard.onrender.com/healthz
# צריך להחזיר: ok
```

---

## ❓ פתרון בעיות

### הנתונים לא מגיעים לדשבורד:
1. בדוק שהשרת פועל: `curl http://localhost:3000/healthz`
2. בדוק logs של n8n: האם השליחה הצליחה?
3. בדוק console בדשבורד: `F12` → Console

### Tooltip לא מופיע:
1. וודא שהדפדפן תומך ב-CSS `::after`
2. נסה לרענן את הדף (`Ctrl+F5`)

### Modal לא נפתח:
1. בדוק שאין שגיאות JavaScript בקונסול
2. וודא ש-`showFieldDetails()` מוגדרת

---

## 📝 דוגמה מלאה

ראה את הקובץ `n8n_wf_qa/Send_to_Dashboard_Node.json` לדוגמה מלאה של node מוכן לשימוש.

---

**נוצר בתאריך:** 30 אוקטובר 2025  
**גרסה:** 1.0  
**תמיכה:** shavi@company.com
