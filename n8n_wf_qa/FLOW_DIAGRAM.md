# תרשים זרימת המערכת

## זרימה מלאה (E2E)

```
┌─────────────────────────────────────────────────────────────────────┐
│                          DASHBOARD (Frontend)                        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  👤 User                                                      │  │
│  │   │                                                           │  │
│  │   │ 1. Drag & Drop audio file                                │  │
│  │   ▼                                                           │  │
│  │  ┌─────────────────────────────┐                             │  │
│  │  │  🎧 Audio Drop Zone          │                             │  │
│  │  │  (MP3, WAV, M4A, OGG, FLAC) │                             │  │
│  │  └─────────────────────────────┘                             │  │
│  │   │                                                           │  │
│  │   │ 2. handleAudioFile()                                      │  │
│  │   ▼                                                           │  │
│  │  ┌─────────────────────────────┐                             │  │
│  │  │  📤 uploadAudioToN8n()       │                             │  │
│  │  │  FormData + metadata         │                             │  │
│  │  └─────────────────────────────┘                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                │ POST /api/process-audio
                                │ (multipart/form-data)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      EXPRESS SERVER (Backend)                        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  📥 /api/process-audio endpoint                               │  │
│  │   │                                                           │  │
│  │   │ 3. Receive audio file + metadata                          │  │
│  │   │    - fileName, fileSize, mimeType                         │  │
│  │   │    - callbackUrl                                          │  │
│  │   ▼                                                           │  │
│  │  ┌─────────────────────────────┐                             │  │
│  │  │  🔄 Forward to n8n           │                             │  │
│  │  │  POST N8N_WEBHOOK_URL        │                             │  │
│  │  └─────────────────────────────┘                             │  │
│  │   │                                                           │  │
│  │   │ 4. Receive job_id from n8n                                │  │
│  │   ▼                                                           │  │
│  │  ┌─────────────────────────────┐                             │  │
│  │  │  ✅ Return to frontend       │                             │  │
│  │  │  { job_id, status: queued }  │                             │  │
│  │  └─────────────────────────────┘                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  📞 /api/callback/transcription (for later)                   │  │
│  │   │                                                           │  │
│  │   │ 9. Receive results from n8n                               │  │
│  │   │    - job_id, status, segments_count, etc.                 │  │
│  │   ▼                                                           │  │
│  │  ┌─────────────────────────────┐                             │  │
│  │  │  💾 Store results            │                             │  │
│  │  │  (TODO: DB/Cache)            │                             │  │
│  │  └─────────────────────────────┘                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                │ POST /webhook/transcribe-ingest
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       N8N WORKFLOW 1 (WF1)                           │
│                   Transcribe + Diarize                               │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  🔔 Webhook Ingest                                            │  │
│  │   │                                                           │  │
│  │   │ 5. Receive audio file + metadata                          │  │
│  │   ├──────────────────────────────────────────────────────────┤  │
│  │   │                                                           │  │
│  │   ├─► 📤 Webhook Response (202)                               │  │
│  │   │    Return job_id immediately                              │  │
│  │   │                                                           │  │
│  │   └─► ⚙️  Init & Validate                                     │  │
│  │        │                                                       │  │
│  │        │ - Generate job_id (ULID)                             │  │
│  │        │ - Extract audio binary                               │  │
│  │        │ - Validate metadata                                  │  │
│  │        ▼                                                       │  │
│  │       ┌─────────────────────────────┐                         │  │
│  │       │  🤖 OpenAI Transcribe        │                         │  │
│  │       │  + Diarize                   │                         │  │
│  │       │                              │                         │  │
│  │       │  6. Send to OpenAI API       │                         │  │
│  │       │  - model: gpt-4o-transcribe  │                         │  │
│  │       │  - language: he              │                         │  │
│  │       │  - response_format:          │                         │  │
│  │       │    diarized_json             │                         │  │
│  │       │                              │                         │  │
│  │       │  ⏱️  Takes 30s - 5min         │                         │  │
│  │       └─────────────────────────────┘                         │  │
│  │        │                                                       │  │
│  │        │ 7. Receive segments + speakers                        │  │
│  │        ▼                                                       │  │
│  │       ┌─────────────────────────────┐                         │  │
│  │       │  📊 Build Minimal Payload    │                         │  │
│  │       │                              │                         │  │
│  │       │  - Merge consecutive         │                         │  │
│  │       │    segments by speaker       │                         │  │
│  │       │  - Calculate duration        │                         │  │
│  │       │  - Calculate per-speaker     │                         │  │
│  │       │    statistics                │                         │  │
│  │       │                              │                         │  │
│  │       │  Output:                     │                         │  │
│  │       │  {                           │                         │  │
│  │       │    job_id,                   │                         │  │
│  │       │    conversation_duration_ms, │                         │  │
│  │       │    segments[],               │                         │  │
│  │       │    speakers[]                │                         │  │
│  │       │  }                           │                         │  │
│  │       └─────────────────────────────┘                         │  │
│  │        │                                                       │  │
│  │        ▼                                                       │  │
│  │       ┌─────────────────────────────┐                         │  │
│  │       │  🔄 Send to WF2 (TODO)       │                         │  │
│  │       │                              │                         │  │
│  │       │  Currently: just logs        │                         │  │
│  │       │  Future: HTTP to WF2 or      │                         │  │
│  │       │          Execute Workflow    │                         │  │
│  │       └─────────────────────────────┘                         │  │
│  │        │                                                       │  │
│  │        ▼                                                       │  │
│  │       ┌─────────────────────────────┐                         │  │
│  │       │  ❓ Has Callback URL?        │                         │  │
│  │       └─────────────────────────────┘                         │  │
│  │        │                    │                                  │  │
│  │        │ YES                │ NO                               │  │
│  │        ▼                    ▼                                  │  │
│  │  ┌──────────────┐    ┌──────────────┐                        │  │
│  │  │ 📞 Callback   │    │ 📝 Final Log │                        │  │
│  │  │   Success     │    │              │                        │  │
│  │  │               │    │              │                        │  │
│  │  │ 8. POST to    │    │              │                        │  │
│  │  │ callbackUrl   │    │              │                        │  │
│  │  │               │    │              │                        │  │
│  │  │ Send:         │    │              │                        │  │
│  │  │ - job_id      │    │              │                        │  │
│  │  │ - status      │    │              │                        │  │
│  │  │ - segments_   │    │              │                        │  │
│  │  │   count       │    │              │                        │  │
│  │  │ - speakers_   │    │              │                        │  │
│  │  │   count       │    │              │                        │  │
│  │  └──────────────┘    └──────────────┘                        │  │
│  │        │                    │                                  │  │
│  │        └────────┬───────────┘                                  │  │
│  │                 ▼                                              │  │
│  │        ┌─────────────────────────────┐                         │  │
│  │        │  ✅ Complete                 │                         │  │
│  │        └─────────────────────────────┘                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ (Future: POST to WF2)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       N8N WORKFLOW 2 (WF2)                           │
│                      QA / Compliance Check                           │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  🔔 Webhook QA Control                                        │  │
│  │   │                                                           │  │
│  │   │ Receive:                                                  │  │
│  │   │ - segments[]                                              │  │
│  │   │ - speakers[]                                              │  │
│  │   │ - conversation_duration_ms                                │  │
│  │   ▼                                                           │  │
│  │  ┌─────────────────────────────┐                             │  │
│  │  │  🔍 QA Analysis               │                             │  │
│  │  │                              │                             │  │
│  │  │  Check:                      │                             │  │
│  │  │  - Greeting present?         │                             │  │
│  │  │  - ID verification?          │                             │  │
│  │  │  - Required questions?       │                             │  │
│  │  │  - Forbidden language?       │                             │  │
│  │  │  - Talk ratio balance?       │                             │  │
│  │  │  - Interruptions?            │                             │  │
│  │  └─────────────────────────────┘                             │  │
│  │   │                                                           │  │
│  │   ▼                                                           │  │
│  │  ┌─────────────────────────────┐                             │  │
│  │  │  📊 Build UI Fields           │                             │  │
│  │  │                              │                             │  │
│  │  │  Output:                     │                             │  │
│  │  │  {                           │                             │  │
│  │  │    qa: {                     │                             │  │
│  │  │      score: 87,              │                             │  │
│  │  │      flags: [...],           │                             │  │
│  │  │      notes: "..."            │                             │  │
│  │  │    },                        │                             │  │
│  │  │    ui_fields: {              │                             │  │
│  │  │      agent_name,             │                             │  │
│  │  │      customer_name,          │                             │  │
│  │  │      summary,                │                             │  │
│  │  │      action_items[]          │                             │  │
│  │  │    }                         │                             │  │
│  │  │  }                           │                             │  │
│  │  └─────────────────────────────┘                             │  │
│  │   │                                                           │  │
│  │   ▼                                                           │  │
│  │  ┌─────────────────────────────┐                             │  │
│  │  │  📞 Callback to Dashboard    │                             │  │
│  │  │                              │                             │  │
│  │  │  POST callbackUrl            │                             │  │
│  │  │  with full results           │                             │  │
│  │  └─────────────────────────────┘                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  (TODO: To be implemented)                                          │
└─────────────────────────────────────────────────────────────────────┘
```

## מבנה נתונים בכל שלב

### 1. Dashboard → Server
```javascript
FormData {
  audio: File,
  fileName: "example.wav",
  fileSize: "1234567",
  mimeType: "audio/wav"
}
```

### 2. Server → n8n WF1
```javascript
FormData {
  audio: File,
  fileName: "example.wav",
  fileSize: "1234567",
  mimeType: "audio/wav",
  uploadedAt: "2025-10-30T12:00:00.000Z",
  callbackUrl: "http://localhost:3000/api/callback/transcription"
}
```

### 3. WF1 → Dashboard (Immediate)
```json
{
  "job_id": "01ABC123XYZ",
  "status": "queued",
  "message": "Audio file received and queued for processing"
}
```

### 4. OpenAI Response
```json
{
  "text": "שלום, איך אני יכול לעזור לך? היי, אני מעוניין...",
  "segments": [
    {
      "speaker": "A",
      "start": 0.0,
      "end": 7.54,
      "text": "שלום, איך אני יכול לעזור לך?"
    },
    {
      "speaker": "B",
      "start": 7.8,
      "end": 12.3,
      "text": "היי, אני מעוניין לשמוע על המוצר שלכם"
    }
  ]
}
```

### 5. WF1 → WF2 (Minimal Payload)
```json
{
  "job_id": "01ABC123XYZ",
  "conversation_duration_ms": 123456,
  "segments": [
    {
      "speaker": "A",
      "start": 0.0,
      "end": 7.54,
      "text": "שלום, איך אני יכול לעזור לך?"
    }
  ],
  "speakers": [
    {
      "label": "A",
      "total_talk_time_ms": 45678,
      "turns": 23
    },
    {
      "label": "B",
      "total_talk_time_ms": 77778,
      "turns": 22
    }
  ],
  "metadata": {
    "fileName": "example.wav",
    "uploadedAt": "2025-10-30T12:00:00.000Z"
  }
}
```

### 6. WF1 → Dashboard (Callback)
```json
{
  "job_id": "01ABC123XYZ",
  "status": "completed",
  "conversation_duration_ms": 123456,
  "segments_count": 45,
  "speakers_count": 2
}
```

## זמני עיבוד משוערים

| שלב | זמן |
|-----|-----|
| Dashboard → Server | < 1s |
| Server → n8n | < 1s |
| n8n Init & Validate | < 1s |
| OpenAI Transcribe | 30s - 5min (תלוי באורך) |
| Build Payload | < 1s |
| Callback | < 1s |
| **סה"כ** | **~1-5 דקות** |

## הערות חשובות

1. **Async Processing**: הדשבורד מקבל `job_id` מיד ולא ממתין לתוצאה
2. **Callback**: n8n שולח תוצאות חזרה דרך Callback URL
3. **Error Handling**: צריך להוסיף Error Trigger ב-n8n
4. **WF2**: כרגע לא מיושם - צריך ליצור Workflow נפרד
5. **Storage**: כרגע אין שמירה של תוצאות - צריך DB או Cache
