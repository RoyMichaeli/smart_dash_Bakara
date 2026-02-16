import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import XLSX from 'xlsx';
import {
  getAllDatasets, getDataset, setDataset,
  getTranscription, setTranscription
} from '../lib/storage.js';

const app = express();

app.use(cors());
app.use(express.json());
app.disable('x-powered-by');

// ─── Multer: memory storage (no filesystem writes) ───
const memStorage = multer.memoryStorage();

const upload = multer({
  storage: memStorage,
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname || '').split('.').pop().toLowerCase();
    if (['xls', 'xlsx', 'csv'].includes(ext)) return cb(null, true);
    cb(new Error('Only .xls, .xlsx, .csv files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

const jsonUpload = multer({
  storage: memStorage,
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname || '').split('.').pop().toLowerCase();
    if (ext === 'json') return cb(null, true);
    cb(new Error('Only .json files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

const audioUpload = multer({
  storage: memStorage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['mp3', 'wav', 'm4a', 'ogg', 'flac'];
    const ext = (file.originalname || '').split('.').pop().toLowerCase();
    const allowedMimes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-m4a', 'audio/ogg', 'audio/flac'];
    if (allowed.includes(ext) || allowedMimes.includes(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error('Only audio files are allowed (MP3, WAV, M4A, OGG, FLAC)'));
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ─── Helpers ───

function normalizeHeader(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[\s\u200f\u200e:_\-–—\.\/|()\[\]{}.,+*?#!@%^&=]+/g, '')
    .replace(/["'""׳״`´]/g, '')
    .trim();
}

function generateDatasetId(originalName = '') {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${safe ? '-' + safe : ''}`;
}

function computeDatasetStats(records) {
  const statusCounts = { valid: 0, improvement: 0, invalid: 0, other: 0 };
  for (const r of records) {
    const s = String(r.status || '').trim();
    if (s === 'תקין' || s.toLowerCase() === 'valid') statusCounts.valid++;
    else if (s === 'טעון שיפור' || s.toLowerCase().includes('improve')) statusCounts.improvement++;
    else if (s === 'לא תקין' || s.toLowerCase().includes('invalid')) statusCounts.invalid++;
    else statusCounts.other++;
  }
  return { total: records.length, statusCounts };
}

// ─── mapRowToRecord ───

function mapRowToRecord(row) {
  const rowKeys = Object.keys(row);
  const normalizedKeyToOriginal = new Map();
  for (const k of rowKeys) {
    normalizedKeyToOriginal.set(normalizeHeader(k), k);
  }

  const usedOriginalKeys = new Set();

  const get = (...keys) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null) {
        usedOriginalKeys.add(key);
        return row[key];
      }
      const normalized = normalizeHeader(key);
      const original = normalizedKeyToOriginal.get(normalized);
      if (original !== undefined) {
        const val = row[original];
        if (val !== undefined && val !== null) {
          usedOriginalKeys.add(original);
          return val;
        }
      }
    }
    return '';
  };

  function getByTerms(requiredTermsGroups) {
    const normalizedCandidates = Array.from(normalizedKeyToOriginal.keys());
    for (const normKey of normalizedCandidates) {
      const isMatch = requiredTermsGroups.every(group => {
        return group.some(term => normKey.includes(normalizeHeader(term)));
      });
      if (isMatch) {
        const original = normalizedKeyToOriginal.get(normKey);
        const val = row[original];
        if (val !== undefined && val !== null) {
          usedOriginalKeys.add(original);
          return val;
        }
      }
    }
    return '';
  }

  function getByAnyTerm(terms) {
    const normalizedCandidates = Array.from(normalizedKeyToOriginal.keys());
    for (const normKey of normalizedCandidates) {
      const isMatch = terms.some(term => normKey.includes(normalizeHeader(term)));
      if (isMatch) {
        const original = normalizedKeyToOriginal.get(normKey);
        const val = row[original];
        if (val !== undefined && val !== null) {
          usedOriginalKeys.add(original);
          return val;
        }
      }
    }
    return '';
  }

  const rawDate = get('birthDate', 'BirthDate', 'תאריך לידה', 'תאריך-לידה', 'תאריך: לידה');
  const normalizedDate = (() => {
    if (!rawDate) return '';
    if (rawDate instanceof Date) return rawDate.toISOString().slice(0, 10);
    const d = new Date(rawDate);
    return isNaN(d.getTime()) ? String(rawDate) : d.toISOString().slice(0, 10);
  })();

  const record = {
    fileName: get('fileName', 'FileName', 'שם קובץ', 'שם הקובץ', 'קובץ'),
    status: get('status', 'Status', 'סטטוס', 'סטטוס סופי'),
    methods: get(
      'methods', 'Methods', 'method',
      'שיטות', 'שיטה',
      'שיטות הסבר', 'הסבר שיטות', 'הסבר-שיטות', 'הסבר: שיטות', 'הסברשיטות',
      'explanation methods', 'methods explanation'
    ) || getByTerms([
      ['הסבר','explanation'],
      ['שיטה','שיטות','method','methods']
    ]) || getByAnyTerm(['שיטה','שיטות','method','methods']),
    charge: get(
      'charge', 'Charge',
      'חיוב', 'הסבר חיוב', 'הסבר-חיוב', 'הסבר: חיוב', 'הסברחיוב',
      'charge explanation', 'explanation charge'
    ) || getByTerms([
      ['הסבר','explanation'],
      ['חיוב','חיובים','charge','charges']
    ]),
    address: get('address', 'Address', 'כתובת'),
    birthDate: normalizedDate,
    winPromise: get(
      'winPromise', 'WinPromise', 'הבטחת זכייה', 'הבטחת זכיה', 'הבטחה לזכייה', 'הבטחה לזכיה', 'זכייה', 'זכיה'
    ) || getByTerms([
      ['הבטחה','הבטחת','promise'],
      ['זכיה','זכייה','win','winning','prize']
    ]),
    credit: get(
      'credit', 'Credit', 'אשראי', 'כרטיס אשראי', 'מספר אשראי', 'credit card', 'card', 'cc'
    ) || getByTerms([
      ['אשראי','credit'],
      ['כרטיס','card','cc']
    ]),
    reflection: get(
      'reflection', 'Reflection', 'שיקוף שיחה', 'שיקוף', 'שיקוף-שיחה', 'שיקוף: שיחה'
    ) || getByTerms([
      ['שיקוף','reflection'],
      ['שיחה','call']
    ]),
    transcript: get(
      'transcript', 'Transcript', 'תמלול', 'תמליל', 'תמלול שיחה', 'טקסט שיחה', 'transcription'
    ) || getByTerms([
      ['תמלול','תמליל','transcript','transcription']
    ])
  };

  const extras = {};
  for (const originalKey of rowKeys) {
    if (!usedOriginalKeys.has(originalKey)) {
      const val = row[originalKey];
      if (val !== undefined && val !== null && String(val) !== '') {
        extras[originalKey] = val;
      }
    }
  }
  if (Object.keys(extras).length > 0) record.extras = extras;

  return record;
}

// ─── mapJsonToRecord ───

function mapJsonToRecord(json) {
  const sections = json.sections || {};

  const sectionNameToField = {
    'הסבר שיטות': 'methods', 'שיטות': 'methods',
    'אשראי': 'credit', 'כרטיס אשראי': 'credit',
    'הבטחת זכייה': 'winPromise', 'הבטחת זכיה': 'winPromise',
    'תאריך לידה': 'birthDate',
    'כתובת': 'address',
    'הסבר חיוב': 'charge', 'חיוב': 'charge',
    'שיקוף שיחה': 'reflection', 'שיקוף': 'reflection'
  };

  function statusToIcon(status) {
    if (!status) return '⬜';
    const s = String(status).trim();
    if (s === 'תקין' || s.toLowerCase() === 'valid') return '✅';
    if (s === 'טעון שיפור' || s.toLowerCase().includes('improve')) return '⚠️';
    if (s === 'לא תקין' || s.toLowerCase().includes('invalid') || s.toLowerCase().includes('fail')) return '❌';
    return '⬜';
  }

  function flattenEvidence(evidenceArr) {
    if (!Array.isArray(evidenceArr)) return [];
    return evidenceArr.map(e => {
      if (typeof e === 'string') return e;
      if (typeof e === 'object' && e !== null) return e.text || e.fullText || JSON.stringify(e);
      return String(e);
    }).filter(Boolean);
  }

  function buildField(section) {
    if (!section) return '⬜';
    return {
      status: statusToIcon(section.status),
      summary: section.reason || '',
      evidence: flattenEvidence(section.evidence),
      timestamp: (section.evidence && section.evidence[0] && section.evidence[0].time) || '',
      ...(section.critical ? { critical: true } : {}),
      ...(section.note !== undefined ? { note: section.note } : {})
    };
  }

  const record = {
    fileName: json.originalFileName || json.fileName || 'unknown',
    status: json.finalStatus || 'לא ידוע',
    methods: '⬜', charge: '⬜', address: '⬜', birthDate: '⬜',
    winPromise: '⬜', credit: '⬜', reflection: '⬜',
    transcript: json.transcript || '',
    metadata: {
      fileId: json.fileId || '',
      timestamp: json.timestamp || new Date().toISOString(),
      track: json.track || '',
      approved: json.approved || false,
      confidence: json.confidence || null,
      needsHumanReview: json.needsHumanReview || false,
      durationSec: json.durationSec || null,
      summary: json.summary || null
    }
  };

  for (const [_key, section] of Object.entries(sections)) {
    if (!section || !section.name) continue;
    const sectionName = String(section.name).trim();
    const fieldKey = sectionNameToField[sectionName];
    if (!fieldKey) continue;

    const field = buildField(section);

    if (fieldKey === 'address' && section.address) {
      field.details = {
        'רחוב ומספר': section.address.street || '',
        'עיר': section.address.city || '',
        'שלמות': section.address.completeness === 'full' ? 'מלאה' : (section.address.completeness || '')
      };
    }

    if (fieldKey === 'birthDate') {
      field.value = section.value || '';
      if (section.age !== undefined) field.details = {
        'גיל': section.age,
        'קטין': section.isMinor ? 'כן' : 'לא',
        ...(section.value ? { 'תאריך לידה': section.value } : {})
      };
    }

    record[fieldKey] = field;
  }

  return record;
}

// ═══════════════════════════════════════════
// ─── API Routes ───
// ═══════════════════════════════════════════

// Upload Excel/CSV
app.post('/api/upload-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Read from buffer (memoryStorage)
    const workbook = XLSX.read(req.file.buffer, { cellDates: true, codepage: 65001 });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const records = rows.map(mapRowToRecord);

    const firstRow = rows[0] || {};
    const originalHeaders = Object.keys(firstRow);
    const nk2o = new Map();
    for (const k of originalHeaders) nk2o.set(normalizeHeader(k), k);

    const tryMatch = (candidates, termGroups) => {
      for (const c of candidates) {
        const norm = normalizeHeader(c);
        if (nk2o.has(norm)) return nk2o.get(norm);
      }
      for (const normKey of nk2o.keys()) {
        const isMatch = termGroups.every(group => group.some(t => normKey.includes(normalizeHeader(t))));
        if (isMatch) return nk2o.get(normKey);
      }
      return null;
    };

    const matchedMethodsHeader = tryMatch(
      ['methods', 'Methods', 'שיטות הסבר', 'הסבר שיטות', 'הסבר-שיטות', 'הסבר: שיטות', 'הסברשיטות'],
      [['הסבר','explanation'], ['שיטה','שיטות','method','methods']]
    );
    const matchedChargeHeader = tryMatch(
      ['charge', 'Charge', 'חיוב', 'הסבר חיוב', 'הסבר-חיוב', 'הסבר: חיוב', 'הסברחיוב'],
      [['הסבר','explanation'], ['חיוב','חיובים','charge','charges']]
    );

    const datasetId = generateDatasetId(req.file.originalname || 'dataset');
    const fieldSet = new Set();
    for (const r of records) {
      for (const k of Object.keys(r)) {
        if (k !== 'extras') fieldSet.add(k);
      }
    }
    const fields = Array.from(fieldSet);
    const createdAt = new Date().toISOString();
    const name = req.file.originalname || datasetId;

    await setDataset(datasetId, { id: datasetId, name, createdAt, records, fields });

    const stats = computeDatasetStats(records);

    return res.json({
      datasetId,
      dataset: { id: datasetId, name, createdAt, fields, numRecords: stats.total, statusCounts: stats.statusCounts },
      debug: { originalHeaders, matched: { methods: matchedMethodsHeader, charge: matchedChargeHeader } }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Failed to parse file' });
  }
});

// Upload JSON
app.post('/api/upload-json', jsonUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'לא הועלה קובץ' });

    // Read from buffer (memoryStorage)
    const raw = req.file.buffer.toString('utf-8');

    let parsed;
    try { parsed = JSON.parse(raw); } catch (_e) {
      return res.status(400).json({ error: 'הקובץ אינו JSON תקין' });
    }

    const items = Array.isArray(parsed) ? parsed : [parsed];
    if (items.length === 0) return res.status(400).json({ error: 'קובץ ה-JSON ריק' });

    const records = items.map(mapJsonToRecord);
    const datasetId = generateDatasetId(req.file.originalname || 'json-import');
    const fields = ['fileName', 'status', 'methods', 'charge', 'address', 'birthDate', 'winPromise', 'credit', 'reflection', 'transcript'];
    const createdAt = new Date().toISOString();
    const name = req.file.originalname || `ייבוא JSON - ${new Date().toLocaleDateString('he-IL')}`;

    await setDataset(datasetId, { id: datasetId, name, createdAt, records, fields });

    const stats = computeDatasetStats(records);
    console.log(`[JSON Import] File: ${req.file.originalname}, Records: ${records.length}, Dataset: ${datasetId}`);

    return res.json({
      datasetId,
      dataset: { id: datasetId, name, createdAt, fields, numRecords: stats.total, statusCounts: stats.statusCounts }
    });
  } catch (err) {
    console.error('[JSON Import Error]', err);
    return res.status(500).json({ error: err.message || 'שגיאה בעיבוד קובץ ה-JSON' });
  }
});

// List datasets
app.get('/api/datasets', async (_req, res) => {
  try {
    const allDs = await getAllDatasets();
    const list = Object.values(allDs).map(ds => {
      const stats = computeDatasetStats(ds.records || []);
      return {
        id: ds.id, name: ds.name, createdAt: ds.createdAt,
        fields: ds.fields || [], numRecords: stats.total, statusCounts: stats.statusCounts
      };
    });
    res.json({ datasets: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch datasets' });
  }
});

// Get dataset by id
app.get('/api/dataset/:id', async (req, res) => {
  const ds = await getDataset(req.params.id);
  if (!ds) return res.status(404).json({ error: 'Dataset not found' });
  res.json({ id: ds.id, name: ds.name, createdAt: ds.createdAt, fields: ds.fields || [], records: ds.records || [] });
});

// Process audio file – sends to n8n webhook
app.post('/api/process-audio', audioUpload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

    const fileName = req.body.fileName || req.file.originalname;
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/transcribe-ingest';

    console.log(`[Audio Upload] File: ${fileName}, Size: ${req.file.size} bytes`);
    console.log(`[Audio Upload] Sending to n8n: ${n8nWebhookUrl}`);

    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    // Append buffer directly instead of file stream
    formData.append('audio', req.file.buffer, {
      filename: fileName,
      contentType: req.file.mimetype
    });
    formData.append('fileName', fileName);
    formData.append('fileSize', req.file.size.toString());
    formData.append('mimeType', req.file.mimetype);
    formData.append('uploadedAt', new Date().toISOString());

    const callbackUrl = `${req.protocol}://${req.get('host')}/api/callback/transcription`;
    formData.append('callbackUrl', callbackUrl);

    const fetch = (await import('node-fetch')).default;
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
      timeout: 300000
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error(`[n8n Error] Status: ${n8nResponse.status}, Response: ${errorText}`);
      throw new Error(`n8n webhook returned status ${n8nResponse.status}`);
    }

    const n8nResult = await n8nResponse.json();
    console.log(`[n8n Response] Job ID: ${n8nResult.job_id || 'N/A'}, Status: ${n8nResult.status || 'N/A'}`);

    return res.json({ result: n8nResult, success: true });
  } catch (err) {
    console.error('[Audio Processing Error]', err);
    return res.status(500).json({
      error: err.message || 'Failed to process audio file',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Callback endpoint for n8n transcription results
app.post('/api/callback/transcription', express.json(), async (req, res) => {
  try {
    const { job_id, fileName, status, segments, speakers, conversation_duration_ms, segments_count, speakers_count } = req.body;
    console.log(`[Transcription Callback] Job: ${job_id}, File: ${fileName}, Status: ${status}`);

    const parsedSegments = typeof segments === 'string' ? JSON.parse(segments) : segments;
    const parsedSpeakers = typeof speakers === 'string' ? JSON.parse(speakers) : speakers;

    await setTranscription(job_id, {
      job_id, fileName, status,
      segments: parsedSegments, speakers: parsedSpeakers,
      conversation_duration_ms, segments_count, speakers_count,
      receivedAt: new Date().toISOString()
    });

    console.log(`[Transcription Callback] Stored results for job ${job_id}`);
    res.status(200).json({ received: true, job_id, fileName });
  } catch (err) {
    console.error('[Callback Error]', err);
    res.status(500).json({ error: 'Failed to process callback' });
  }
});

// Get transcription result
app.get('/api/transcription/:job_id', async (req, res) => {
  const result = await getTranscription(req.params.job_id);
  if (!result) return res.status(404).json({ error: 'Transcription not found' });
  res.json(result);
});

// Receive QA results from n8n automation
app.post('/api/qa-result', express.json(), async (req, res) => {
  try {
    const qaData = req.body;
    console.log(`[QA Result] Received for file: ${qaData.fileName}`);

    const record = {
      fileName: qaData.fileName || 'unknown',
      status: qaData.final_status || qaData.overall || 'לא ידוע',
      methods: { status: qaData.s1_status || '⬜', summary: qaData.s1_why || '', evidence: [qaData.s1_e1, qaData.s1_e2].filter(Boolean), timestamp: qaData.s1_timestamp || '' },
      charge: { status: qaData.s2_status || '⬜', summary: qaData.s2_why || '', evidence: [qaData.s2_e1, qaData.s2_e2].filter(Boolean), timestamp: qaData.s2_timestamp || '' },
      address: { status: qaData.s3_status || '⬜', summary: qaData.s3_why || '', evidence: [qaData.s3_e1, qaData.s3_e2].filter(Boolean), details: { street_number: qaData.address_street_number || '', locality: qaData.address_locality || '', zip: qaData.address_zip || '', completeness: qaData.address_completeness || '' }, timestamp: qaData.s3_timestamp || '' },
      birthDate: { status: qaData.s4_status || '⬜', summary: qaData.s4_why || '', evidence: [qaData.s4_e1].filter(Boolean), value: qaData.dob_text || '', timestamp: qaData.s4_timestamp || '' },
      winPromise: { status: qaData.s5_status || '⬜', summary: qaData.s5_why || '', evidence: [qaData.s5_e1].filter(Boolean), timestamp: qaData.s5_timestamp || '' },
      credit: { status: qaData.s6_status || '⬜', summary: qaData.s6_why || '', evidence: [qaData.s6_e1].filter(Boolean), timestamp: qaData.s6_timestamp || '' },
      reflection: { status: qaData.s7_status || '⬜', summary: qaData.s7_why || '', evidence: [qaData.s7_e1].filter(Boolean), timestamp: qaData.s7_timestamp || '' },
      transcript: qaData.transcript || '',
      metadata: { fileId: qaData.fileId || '', timestamp: qaData.timestamp || new Date().toISOString(), track: qaData.track || '', approved: qaData.approved || false }
    };

    const datasetId = qaData.datasetId || generateDatasetId('qa-automation');
    let ds = await getDataset(datasetId);

    if (!ds) {
      ds = {
        id: datasetId,
        name: `QA Automation - ${new Date().toLocaleDateString('he-IL')}`,
        createdAt: new Date().toISOString(),
        records: [],
        fields: ['fileName', 'status', 'methods', 'charge', 'address', 'birthDate', 'winPromise', 'credit', 'reflection', 'transcript']
      };
    }

    const existingIndex = ds.records.findIndex(r => r.fileName === record.fileName);
    if (existingIndex >= 0) ds.records[existingIndex] = record;
    else ds.records.push(record);

    await setDataset(datasetId, ds);

    console.log(`[QA Result] Stored in dataset ${datasetId}, total records: ${ds.records.length}`);
    res.status(200).json({ success: true, datasetId, fileName: record.fileName, status: record.status });
  } catch (err) {
    console.error('[QA Result Error]', err);
    res.status(500).json({ error: 'Failed to process QA result' });
  }
});

// Deep comparison endpoint
app.get('/api/compare/:idA/:idB', async (req, res) => {
  try {
    const { idA, idB } = req.params;
    const dsA = await getDataset(idA);
    const dsB = await getDataset(idB);
    if (!dsA) return res.status(404).json({ error: 'Dataset A not found' });
    if (!dsB) return res.status(404).json({ error: 'Dataset B not found' });

    const sectionKeys = ['methods', 'charge', 'address', 'birthDate', 'winPromise', 'credit', 'reflection'];
    const sectionLabels = {
      methods: 'הסבר שיטות', charge: 'הסבר חיוב', address: 'כתובת',
      birthDate: 'תאריך לידה', winPromise: 'הבטחת זכייה', credit: 'אשראי', reflection: 'שיקוף שיחה'
    };

    function normalizeStatus(val) {
      if (!val) return 'unknown';
      const s = typeof val === 'object' ? (val.status || '') : String(val);
      const t = s.trim();
      if (t === '✅' || t === 'תקין' || t.toLowerCase() === 'valid') return 'valid';
      if (t === '⚠️' || t === 'טעון שיפור' || t.toLowerCase().includes('improve')) return 'improvement';
      if (t === '❌' || t === 'לא תקין' || t.toLowerCase().includes('invalid') || t.toLowerCase().includes('fail')) return 'invalid';
      if (t === '⬜' || t === '-' || t === '') return 'unknown';
      return 'unknown';
    }

    function displayStatus(val) {
      if (!val) return '-';
      if (typeof val === 'object' && val.status) return val.status;
      const s = String(val).trim();
      if (s === '✅' || s === 'תקין') return '✅';
      if (s === '⚠️' || s === 'טעון שיפור') return '⚠️';
      if (s === '❌' || s === 'לא תקין') return '❌';
      return s.substring(0, 2) || '-';
    }

    function getSummary(val) {
      if (!val) return '';
      if (typeof val === 'object' && val.summary) return val.summary;
      if (typeof val === 'string') return val;
      return '';
    }

    function getEvidence(val) {
      if (!val) return [];
      if (typeof val === 'object' && Array.isArray(val.evidence)) return val.evidence;
      return [];
    }

    function normalizeFileName(name) {
      return String(name || '').trim().toLowerCase()
        .replace(/\.(wav|mp3|m4a|json|xlsx?)$/i, '')
        .replace(/[_\-\s]+/g, ' ')
        .trim();
    }

    const bByName = new Map();
    for (const rec of (dsB.records || [])) {
      const key = normalizeFileName(rec.fileName);
      if (!bByName.has(key)) bByName.set(key, rec);
    }

    const sectionStats = {};
    for (const k of sectionKeys) sectionStats[k] = { label: sectionLabels[k], matches: 0, mismatches: 0, total: 0 };

    let overallStatusMatches = 0;
    let totalCompared = 0;
    const comparisons = [];

    for (const recA of (dsA.records || [])) {
      const keyA = normalizeFileName(recA.fileName);
      const recB = bByName.get(keyA);

      if (!recB) {
        comparisons.push({ fileName: recA.fileName, matched: false, overallA: recA.status, overallB: null, sections: null });
        continue;
      }

      totalCompared++;

      const normOverallA = normalizeStatus({ status: recA.status === 'תקין' ? '✅' : recA.status === 'טעון שיפור' ? '⚠️' : recA.status === 'לא תקין' ? '❌' : recA.status });
      const normOverallB = normalizeStatus({ status: recB.status === 'תקין' ? '✅' : recB.status === 'טעון שיפור' ? '⚠️' : recB.status === 'לא תקין' ? '❌' : recB.status });
      if (normOverallA === normOverallB) overallStatusMatches++;

      const sectionComparisons = {};
      for (const k of sectionKeys) {
        const valA = recA[k];
        const valB = recB[k];
        const normA = normalizeStatus(valA);
        const normB = normalizeStatus(valB);
        const match = normA === normB;

        if (normA !== 'unknown' || normB !== 'unknown') {
          sectionStats[k].total++;
          if (match) sectionStats[k].matches++;
          else sectionStats[k].mismatches++;
        }

        sectionComparisons[k] = {
          label: sectionLabels[k], match,
          ai: { status: displayStatus(valA), summary: getSummary(valA), evidence: getEvidence(valA) },
          human: { status: displayStatus(valB), summary: getSummary(valB), evidence: getEvidence(valB) }
        };
      }

      comparisons.push({
        fileName: recA.fileName, matched: true,
        overallA: recA.status, overallB: recB.status,
        overallMatch: normOverallA === normOverallB,
        sections: sectionComparisons
      });
    }

    const sectionAccuracy = {};
    for (const k of sectionKeys) {
      const s = sectionStats[k];
      sectionAccuracy[k] = { label: s.label, matches: s.matches, mismatches: s.mismatches, total: s.total, accuracy: s.total > 0 ? Math.round((s.matches / s.total) * 100) : null };
    }

    const totalSectionChecks = sectionKeys.reduce((sum, k) => sum + sectionStats[k].total, 0);
    const totalSectionMatches = sectionKeys.reduce((sum, k) => sum + sectionStats[k].matches, 0);

    res.json({
      datasetA: { id: dsA.id, name: dsA.name, totalRecords: (dsA.records || []).length },
      datasetB: { id: dsB.id, name: dsB.name, totalRecords: (dsB.records || []).length },
      summary: {
        totalCompared,
        unmatched: comparisons.filter(c => !c.matched).length,
        overallStatusAccuracy: totalCompared > 0 ? Math.round((overallStatusMatches / totalCompared) * 100) : null,
        overallStatusMatches,
        sectionAccuracy,
        totalSectionAccuracy: totalSectionChecks > 0 ? Math.round((totalSectionMatches / totalSectionChecks) * 100) : null
      },
      comparisons
    });
  } catch (err) {
    console.error('[Compare Error]', err);
    res.status(500).json({ error: 'Failed to compare datasets' });
  }
});

// Health check
app.get('/healthz', async (_req, res) => {
  try {
    return res.status(200).send('ok');
  } catch (_e) {
    return res.status(500).send('unhealthy');
  }
});

// ─── Export for Vercel Serverless + local dev ───
export default app;

// Local development: start server if run directly
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
if (!isVercel) {
  const port = process.env.PORT || 3000;
  const { dirname, join } = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const publicDir = join(__dirname, '..', 'public');
  app.use(express.static(publicDir));
  app.get('/', (_req, res) => {
    res.sendFile(join(publicDir, 'dashboard.html'));
  });
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
    console.log(`[Config] N8N_WEBHOOK_URL: ${process.env.N8N_WEBHOOK_URL || 'NOT SET'}`);
  });
}
