# מערכת תמלול ודיאריזציה אוטומטית

## תיאור המערכת

מערכת מלאה לעיבוד קבצי אודיו עם תמלול (Transcription) ודיאריזציה (Speaker Diarization) באמצעות:
- **Frontend**: דשבורד עם Drag & Drop להעלאת קבצי אודיו
- **Backend**: Express.js server
- **Processing**: n8n workflow עם OpenAI API

## התחלה מהירה

### 1. הכנה

```bash
# התקנת תלויות
npm install

# יצירת קובץ .env
cp .env.example .env
```

ערוך את `.env` והגדר:
```
N8N_WEBHOOK_URL=http://localhost:5678/webhook/transcribe-ingest
```

### 2. ייבוא Workflow ל-n8n

1. פתח n8n (`http://localhost:5678`)
2. Import → בחר קובץ: `n8n_wf_qa/WF1_Transcribe_Diarize_Production.json`
3. הגדר OpenAI API Key בצומת "OpenAI Transcribe + Diarize"
4. הפעל את ה-Workflow (Active)

### 3. הפעלת הדשבורד

```bash
npm start
```

פתח דפדפן: `http://localhost:3000`

### 4. שימוש

1. גרור קובץ אודיו (MP3, WAV, M4A) לאיזור ההעלאה
2. המערכת תעבד את הקובץ ותחזיר תמלול עם זיהוי דוברים
3. עקוב אחר התהליך ב-n8n Executions

## מבנה הפרויקט

```
/Users/shavi/qasmart/
├── server.js                 # Express server
├── dashboard.html            # Frontend UI
├── package.json
├── .env                      # הגדרות (לא במאגר)
├── .env.example              # דוגמה להגדרות
└── n8n_wf_qa/
    ├── WF1_Transcribe_Diarize_Production.json  # Workflow ל-n8n
    └── SETUP_INSTRUCTIONS.md                    # הוראות מפורטות
```

## תיעוד מלא

ראה: `n8n_wf_qa/SETUP_INSTRUCTIONS.md`

## דרישות מערכת

- Node.js 18+
- n8n (מותקן ורץ)
- OpenAI API Key עם גישה ל-`gpt-4o-transcribe-diarize`

## פורמטים נתמכים

- MP3
- WAV
- M4A
- OGG
- FLAC

גודל מקסימלי: 50MB

## תמיכה

בעיות? בדוק:
1. Console logs (דשבורד ו-n8n)
2. n8n Executions
3. הוראות מפורטות ב-`SETUP_INSTRUCTIONS.md`
