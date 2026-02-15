# 🔗 חיבור האוטומציה לדשבורד - מדריך מלא

## 📋 סקירה כללית

נוסיף 2 תחנות (nodes) חדשות לאוטומציה שלך:
1. **Parse QA Results** - מעבד את תוצאות ה-AI Agent
2. **Send to Dashboard** - שולח לדשבורד

---

## 🎯 שלב 1: הוסף Node "Parse QA Results"

### 1.1 פתח את האוטומציה ב-n8n

```
Workflows → OpenAI Transcribe + Diarize irit
```

### 1.2 הוסף Code Node חדש

1. לחץ על **+** ליד ה-node **"AI Agent"**
2. חפש **"Code"**
3. בחר **"Code"** (JavaScript)
4. שנה את השם ל-**"Parse QA Results"**

### 1.3 הדבק את הקוד הבא:

```javascript
// Parse AI Agent output and structure for dashboard
const agentOutput = $input.item.json.output || $input.item.json.text || '';
const originalFileName = $input.item.json.originalFileName || 'unknown.wav';
const transcript = $input.item.json.segments ? 
  $input.item.json.segments.map(s => `${s.speaker}: ${s.text}`).join('\n') : 
  $input.item.json.text || '';

// Extract status from AI output (looking for ✅ ⚠️ ❌)
function extractFieldStatus(text, sectionNumber) {
  const sectionRegex = new RegExp(`סעיף ${sectionNumber}[:\\s]+([^\\n]+)`, 'i');
  const match = text.match(sectionRegex);
  if (!match) return { status: '⬜', why: '', e1: '', e2: '' };
  
  const line = match[1];
  let status = '⬜';
  if (line.includes('✅')) status = '✅';
  else if (line.includes('⚠️')) status = '⚠️';
  else if (line.includes('❌')) status = '❌';
  
  // Extract explanation and evidence
  const whyMatch = text.match(new RegExp(`סעיף ${sectionNumber}[^\\n]*\\n([^\\n]+)`, 'i'));
  const why = whyMatch ? whyMatch[1].replace(/[✅⚠️❌]/g, '').trim() : '';
  
  // Extract evidence quotes
  const evidenceRegex = new RegExp(`סעיף ${sectionNumber}[\\s\\S]{0,200}?["״]([^"״]+)["״]`, 'gi');
  const evidences = [];
  let eMatch;
  while ((eMatch = evidenceRegex.exec(text)) && evidences.length < 2) {
    evidences.push(eMatch[1].trim());
  }
  
  return {
    status,
    why: why.substring(0, 200),
    e1: evidences[0] || '',
    e2: evidences[1] || ''
  };
}

// Extract overall status
let final_status = 'לא ידוע';
if (agentOutput.includes('סטטוס סופי: תקין') || agentOutput.includes('✅ תקין')) {
  final_status = 'תקין';
} else if (agentOutput.includes('סטטוס סופי: טעון שיפור') || agentOutput.includes('⚠️')) {
  final_status = 'טעון שיפור';
} else if (agentOutput.includes('סטטוס סופי: לא תקין') || agentOutput.includes('❌')) {
  final_status = 'לא תקין';
}

// Parse all 8 sections
const s1 = extractFieldStatus(agentOutput, 1); // הסבר שיטות
const s2 = extractFieldStatus(agentOutput, 2); // אשראי
const s3 = extractFieldStatus(agentOutput, 3); // הבטחת זכייה
const s4 = extractFieldStatus(agentOutput, 4); // הסבר חיוב
const s5 = extractFieldStatus(agentOutput, 5); // כתובת
const s6 = extractFieldStatus(agentOutput, 6); // תאריך לידה
const s7 = extractFieldStatus(agentOutput, 7); // שיקוף שיחה
const s8 = extractFieldStatus(agentOutput, 8); // SMS

// Extract address details
const addressMatch = agentOutput.match(/כתובת[:\\s]+([^\\n]+)/i);
const address_text = addressMatch ? addressMatch[1] : '';

// Extract DOB
const dobMatch = agentOutput.match(/תאריך לידה[:\\s]+(\\d{1,2}[\\.\\/-]\\d{1,2}[\\.\\/-]\\d{2,4})/i);
const dob_text = dobMatch ? dobMatch[1] : '';

return {
  json: {
    fileName: originalFileName,
    fileId: $input.item.json.fileId || '',
    timestamp: new Date().toISOString(),
    final_status: final_status,
    overall: final_status,
    
    // Section 1: Methods
    s1_status: s1.status,
    s1_why: s1.why || 'הסבר שיטות',
    s1_e1: s1.e1,
    s1_e2: s1.e2,
    s1_timestamp: '',
    
    // Section 2: Credit
    s2_status: s2.status,
    s2_why: s2.why || 'אשראי',
    s2_e1: s2.e1,
    s2_e2: s2.e2,
    s2_timestamp: '',
    
    // Section 3: Win Promise
    s3_status: s3.status,
    s3_why: s3.why || 'הבטחת זכייה',
    s3_e1: s3.e1,
    s3_e2: s3.e2,
    s3_timestamp: '',
    
    // Section 4: Charge Explanation
    s4_status: s4.status,
    s4_why: s4.why || 'הסבר חיוב',
    s4_e1: s4.e1,
    s4_e2: s4.e2,
    s4_timestamp: '',
    
    // Section 5: Address
    s5_status: s5.status,
    s5_why: s5.why || 'כתובת',
    s5_e1: s5.e1 || address_text,
    s5_e2: s5.e2,
    s5_timestamp: '',
    address_street_number: '',
    address_locality: '',
    address_zip: '',
    address_completeness: s5.status === '✅' ? 'full' : (s5.status === '⚠️' ? 'partial' : 'none'),
    
    // Section 6: Birth Date
    s6_status: s6.status,
    s6_why: s6.why || 'תאריך לידה',
    s6_e1: s6.e1 || dob_text,
    s6_timestamp: '',
    dob_text: dob_text,
    
    // Section 7: Reflection
    s7_status: s7.status,
    s7_why: s7.why || 'שיקוף שיחה',
    s7_e1: s7.e1,
    s7_timestamp: '',
    
    // Section 8: SMS
    s8_status: s8.status,
    s8_why: s8.why || 'SMS',
    s8_e1: s8.e1,
    s8_timestamp: '',
    
    // Transcript
    transcript: transcript,
    transcript_normalized: transcript,
    
    // Metadata
    track: '',
    approved: final_status === 'תקין',
    detectionSource: 'ai_agent',
    
    // Raw output for debugging
    raw_agent_output: agentOutput
  }
};
```

### 1.4 חבר את ה-Node

1. חבר מ-**"AI Agent"** ל-**"Parse QA Results"**
2. לחץ **Save**

---

## 🎯 שלב 2: הוסף Node "Send to Dashboard"

### 2.1 הוסף HTTP Request Node

1. לחץ על **+** ליד **"Parse QA Results"**
2. חפש **"HTTP Request"**
3. בחר **"HTTP Request"**
4. שנה את השם ל-**"Send to Dashboard"**

### 2.2 הגדר את הפרמטרים:

#### Method:
```
POST
```

#### URL:
```
http://localhost:3001/api/qa-result
```

**שים לב:** אם אין לך גישה ל-Environment Variables (מנוי Starter), פשוט שים את ה-URL ישירות כמו למעלה.

#### Authentication:
```
None
```

#### Send Body:
```
✅ Yes
```

#### Body Content Type:
```
JSON
```

#### JSON Body:
```
={{ JSON.stringify($json) }}
```

#### Options → Timeout:
```
30000
```

### 2.3 חבר את ה-Node

1. חבר מ-**"Parse QA Results"** ל-**"Send to Dashboard"**
2. לחץ **Save**

---

## 🎯 שלב 3: ~~הגדר משתנה סביבה~~ (לא נדרש!)

**אם יש לך מנוי Starter:** אין צורך בשלב זה! ה-URL כבר hardcoded ב-node.

**אם בעתיד תרצה לשנות ל-production:**
1. פתח את ה-node "Send to Dashboard"
2. שנה את ה-URL מ-`http://localhost:3001/api/qa-result` ל-`https://your-dashboard.onrender.com/api/qa-result`
3. שמור

---

## 🎯 שלב 4: עדכן חיבורים קיימים (אופציונלי)

אם אתה רוצה ששמירת ה-JSON תהיה **אחרי** העיבוד:

### 4.1 נתק חיבור קיים

1. מצא את החיבור מ-**"Code in JavaScript"** ל-**"OneDrive JSON"**
2. לחץ עליו ובחר **Delete**

### 4.2 חבר מחדש

1. חבר מ-**"Parse QA Results"** ל-**"OneDrive JSON"**
2. עכשיו ה-JSON שיישמר יכלול את כל השדות המעובדים

---

## 📊 המבנה הסופי

```
Webhook Ingest
    ↓
Code in JavaScript1 (שומר שם קובץ)
    ↓
OpenAI Transcribe (Diarize)
    ↓
Merge
    ↓
Code in JavaScript (מעבד תמלול)
    ↓
AI Agent (בקרת איכות)
    ↓
Parse QA Results ⭐ NEW
    ↓
    ├─→ Send to Dashboard ⭐ NEW
    ├─→ OneDrive JSON
    ├─→ OneDrive SRT
    ├─→ OneDrive txt
    └─→ Plain TXT (Google Drive)
```

---

## 🧪 בדיקה

### שלב 1: הפעל את הדשבורד

```bash
cd /Users/shavi/qasmart
npm start
# Server listening on http://localhost:3001
```

### שלב 2: שלח קובץ בדיקה

```bash
curl -X POST http://your-n8n-url/webhook/transcribe-ingest \
  -F "audio=@test.wav" \
  -F "fileName=test.wav"
```

### שלב 3: בדוק בדשבורד

פתח: `http://localhost:3001`

אמור לראות את הרשומה החדשה עם:
- ✅ ⚠️ ❌ לכל שדה
- Tooltip בריחוף
- Modal בלחיצה

---

## 🔍 Debug

### אם לא מגיע לדשבורד:

1. **בדוק ב-n8n Execution Log:**
   - האם "Parse QA Results" רץ?
   - האם "Send to Dashboard" רץ?
   - מה השגיאה?

2. **בדוק את ה-URL:**
   ```bash
   echo $DASHBOARD_URL
   # צריך להחזיר: http://localhost:3001
   ```

3. **בדוק שהדשבורד פועל:**
   ```bash
   curl http://localhost:3001/healthz
   # צריך להחזיר: ok
   ```

4. **בדוק logs של הדשבורד:**
   ```bash
   # בטרמינל שבו רץ npm start
   # תראה:
   [QA Result] Received for file: test.wav
   [QA Result] Stored in dataset...
   ```

---

## 📝 דוגמה לפלט מ-Parse QA Results

```json
{
  "fileName": "1211907.wav",
  "final_status": "תקין",
  "s1_status": "✅",
  "s1_why": "הסבר תקין - 3 שיטות הוזכרו",
  "s1_e1": "קובייה אישית",
  "s1_e2": "10 קוביות עם 70 חברים",
  "s2_status": "✅",
  "s2_why": "אשראי נאסף תקין",
  "s2_e1": "**** 1234",
  "transcript": "שלום, אני מתקשר מסמארט לוטו..."
}
```

---

## 🎨 תצוגה בדשבורד

לאחר שהנתונים יגיעו, תראה בדשבורד:

```
┌────────────┬────────┬────────┬────────┬────────┐
│ שם קובץ    │ סטטוס  │ שיטות  │ חיוב   │ כתובת  │
├────────────┼────────┼────────┼────────┼────────┤
│1211907.wav │ תקין   │  ✅    │  ✅    │  ⚠️    │
└────────────┴────────┴────────┴────────┴────────┘
```

- **ריחוף** → Tooltip עם הסבר
- **לחיצה** → Modal מפורט עם ציטוטים

---

## ✅ Checklist

- [ ] הוספתי את "Parse QA Results" node
- [ ] הוספתי את "Send to Dashboard" node
- [ ] חיברתי את ה-nodes
- [ ] הגדרתי DASHBOARD_URL
- [ ] שמרתי את האוטומציה
- [ ] הפעלתי את הדשבורד
- [ ] בדקתי עם קובץ אודיו
- [ ] הנתונים מופיעים בדשבורד ✨

---

**מוכן!** עכשיו האוטומציה שלך מחוברת לדשבורד! 🎉

כל קובץ אודיו שתעלה יעבור:
1. תמלול
2. בקרת איכות
3. עיבוד
4. שליחה לדשבורד
5. תצוגה אינטראקטיבית

---

**נוצר:** 30 אוקטובר 2025  
**גרסה:** 1.0
