# 🔧 תיקון: העברת fileName ל-AI Agent

## 🐛 הבעיה

ה-AI Agent מקבל רק את התמלול (`segments`), אבל לא את שם הקובץ המקורי.

**התוצאה:** ה-fileName בפלט הוא `"smartlotto_call_20240601"` (שה-AI המציא) במקום השם האמיתי של הקובץ.

---

## ✅ הפתרון

צריך להוסיף **Code node** לפני ה-AI Agent שמעביר את ה-fileName.

---

## 📝 הוראות

### שלב 1: הוסף Code Node חדש

1. פתח את האוטומציה ב-n8n
2. לחץ **+** בין **"Code in JavaScript"** ל-**"AI Agent"**
3. בחר **"Code"** (JavaScript)
4. שנה את השם ל-**"Add Metadata to AI Agent"**

### שלב 2: הדבק את הקוד הזה:

```javascript
// העבר את ה-fileName ל-AI Agent
const originalFileName = $input.item.json.originalFileName || 
                         $input.item.binary?.data0?.originalFileName ||
                         $input.item.json.fileName ||
                         'unknown.wav';

// שמור את כל הנתונים הקיימים + הוסף fileName
return {
  json: {
    ...($input.item.json || {}),
    originalFileName: originalFileName,
    fileName: originalFileName
  },
  binary: $input.item.binary
};
```

### שלב 3: חבר את ה-Node

```
Code in JavaScript
    ↓
Add Metadata to AI Agent ⭐ NEW
    ↓
AI Agent
```

---

## 🔄 עדכן את Parse QA Results

עכשיו ה-Parse QA Results יכול לקבל את ה-fileName:

```javascript
const originalFileName = $input.item.json.originalFileName || 
                         $input.item.json.fileName || 
                         'unknown.wav';
```

---

## 🎯 אלטרנטיבה: עדכן את ה-AI Agent Prompt

אם אתה לא רוצה להוסיף node נוסף, אפשר לעדכן את ה-prompt של ה-AI Agent:

### מצא את השורה:
```
={{ $json.segments.map(s => `${s.speaker}: ${s.text}`).join('\n\n') }}
```

### החלף ב:
```
fileName: {{ $json.originalFileName || $json.fileName || 'unknown' }}

{{ $json.segments.map(s => `${s.speaker}: ${s.text}`).join('\n\n') }}
```

**ואז בהוראות ל-AI הוסף:**
```
בתחילת התשובה שלך, השתמש ב-fileName שסופק למעלה.
אל תמציא שמות קבצים!
```

---

## 🧪 בדיקה

### לפני:
```json
{
  "fileName": "smartlotto_call_20240601"  ❌ המציא
}
```

### אחרי:
```json
{
  "fileName": "1211907.wav"  ✅ השם האמיתי
}
```

---

## 📊 זרימה מלאה

```
Webhook Ingest
    ↓
Code in JavaScript1 (שומר originalFileName)
    ↓
OpenAI Transcribe
    ↓
Merge
    ↓
Code in JavaScript (מעבד תמלול)
    ↓
Add Metadata to AI Agent ⭐ מעביר fileName
    ↓
AI Agent (מקבל fileName)
    ↓
Parse QA Results (משתמש ב-fileName)
    ↓
Send to Dashboard
```

---

## 🎯 המלצה

**שיטה 1 (הכי טובה):** הוסף Code node חדש - נקי ופשוט

**שיטה 2:** עדכן את ה-prompt - פחות אמין (ה-AI עדיין יכול להמציא)

---

**בחר באחת מהשיטות ותקן את הבעיה!** 🚀
