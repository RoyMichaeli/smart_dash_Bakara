import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Reduce fingerprinting surface
app.disable('x-powered-by');

// Serve static frontend files
app.use(express.static(__dirname));

// In-memory datasets index
// Structure: { [datasetId]: { id, name, createdAt, records, fields } }
const datasetsIndex = {};

// In-memory transcription results cache
// Structure: { [job_id]: { fileName, status, segments, speakers, ... } }
const transcriptionResults = {};

// Unified header normalization used across mapping and debug helpers
function normalizeHeader(raw) {
  return String(raw || '')
    .toLowerCase()
    // Remove spaces, RTL marks, and various separators/punctuation
    .replace(/[\s\u200f\u200e:_\-–—\.\/|()\[\]{}.,+*?#!@%^&=]+/g, '')
    // Remove quotes variations
    .replace(/["'“”׳״`´]/g, '')
    .trim();
}

function detectAiFormat(sheetName, firstRow) {
  if (normalizeHeader(sheetName) === normalizeHeader('בקרת שיחות')) return true;
  if (normalizeHeader(sheetName) === normalizeHeader('Smart')) return false;
  const headers = Object.keys(firstRow);
  return headers.filter(h => h.trim().startsWith('(AI)')).length >= 3;
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
  return {
    total: records.length,
    statusCounts
  };
}

// Ensure uploads directory exists (use /tmp on Vercel)
const uploadsDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (_req, file, cb) {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['.xls', '.xlsx', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Only .xls, .xlsx, .csv files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Configure multer for JSON uploads
const jsonUpload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.json') return cb(null, true);
    cb(new Error('Only .json files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Configure multer for audio uploads
const audioUpload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['.mp3', '.wav', '.m4a', '.ogg', '.flac'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedMimes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-m4a', 'audio/ogg', 'audio/flac'];
    if (allowed.includes(ext) || allowedMimes.includes(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error('Only audio files are allowed (MP3, WAV, M4A, OGG, FLAC)'));
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB for audio files
});

// Parse structured Hebrew text from AI-generated XLSX columns into rich field objects
function parseAiFieldContent(text) {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (trimmed.length <= 10) return trimmed;

  const statusMap = {
    'תקין': '✅',
    'לא תקין': '❌',
    'טעון שיפור': '⚠️',
    'חסר': '⬜',
    'לא רלוונטי': '⬜'
  };

  let status = '⬜';
  let summary = '';
  let evidence = [];
  let critical = false;

  // Extract status from סטטוס: line
  const statusMatch = trimmed.match(/סטטוס\s*:\s*(.+)/);
  if (statusMatch) {
    const rawStatus = statusMatch[1].trim();
    for (const [heb, icon] of Object.entries(statusMap)) {
      if (rawStatus.includes(heb)) { status = icon; break; }
    }
  } else {
    // Try first line as status
    const firstLine = trimmed.split('\n')[0].trim();
    for (const [heb, icon] of Object.entries(statusMap)) {
      if (firstLine.includes(heb)) { status = icon; break; }
    }
  }

  // Extract explanation from הסבר: line
  const explainMatch = trimmed.match(/הסבר\s*:\s*(.+)/);
  if (explainMatch) {
    summary = explainMatch[1].trim();
  }

  // Extract quoted evidence
  const quoteRegex = /"([^"]+)"/g;
  let m;
  while ((m = quoteRegex.exec(trimmed)) !== null) {
    evidence.push(m[1]);
  }

  // Detect critical flag
  if (/קריטי/.test(trimmed)) {
    critical = true;
  }

  return {
    status,
    summary,
    evidence,
    ...(critical ? { critical: true } : {}),
    rawText: trimmed
  };
}

// Normalize AI status text to a canonical Hebrew status string
function normalizeAiStatus(text) {
  if (!text || typeof text !== 'string') return text || '';
  const trimmed = text.trim();
  if (trimmed === 'תקין' || trimmed === 'לא תקין' || trimmed === 'טעון שיפור') return trimmed;
  if (trimmed.includes('לא תקין')) return 'לא תקין';
  if (trimmed.includes('טעון שיפור')) return 'טעון שיפור';
  if (trimmed.includes('תקין')) return 'תקין';
  return trimmed;
}

// Map sheet rows to our dashboard schema
function mapRowToRecord(row, isAiFormat = false) {
  const rowKeys = Object.keys(row);
  const normalizedKeyToOriginal = new Map();
  for (const k of rowKeys) {
    normalizedKeyToOriginal.set(normalizeHeader(k), k);
  }

  // Track which original headers we actually consumed for mapped fields
  const usedOriginalKeys = new Set();

  const get = (...keys) => {
    for (const key of keys) {
      // 1) Exact key
      if (row[key] !== undefined && row[key] !== null) {
        usedOriginalKeys.add(key);
        return row[key];
      }
      // 2) Normalized match on header variations
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

  // AI-aware getter: when isAiFormat, tries (AI) prefixed keys first
  const getAI = (...keys) => {
    if (isAiFormat) {
      const aiKeys = keys.map(k => `(AI) ${k}`);
      const aiResult = get(...aiKeys);
      if (aiResult !== '') return aiResult;
    }
    return get(...keys);
  };

  function getByTerms(requiredTermsGroups) {
    // requiredTermsGroups: Array of Array<string>; each group is OR; all groups must match
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

  const rawDate = getAI('birthDate', 'BirthDate', 'תאריך לידה', 'תאריך-לידה', 'תאריך: לידה');
  const normalizedDate = (() => {
    if (!rawDate) return '';
    if (rawDate instanceof Date) {
      return rawDate.toISOString().slice(0, 10);
    }
    // Try parse string
    const d = new Date(rawDate);
    return isNaN(d.getTime()) ? String(rawDate) : d.toISOString().slice(0, 10);
  })();

  const rawSubscriberId = get(
    'subscriberId', 'SubscriberId', 'subscriber_id',
    'מספר מנוי', 'מנוי', 'מספר_מנוי',
    'customerId', 'CustomerId', 'customer_id',
    'מספר לקוח', 'לקוח', 'מזהה מנוי', 'מזהה לקוח',
    "מס' לקוח", 'מס לקוח'
  ) || getByAnyTerm(['מנוי', 'subscriber', 'customer', 'לקוח']);

  const record = {
    fileName: get('fileName', 'FileName', 'שם קובץ', 'שם הקובץ', 'קובץ'),
    subscriberId: String(rawSubscriberId || '').trim(),
    status: getAI('status', 'Status', 'סטטוס', 'סטטוס סופי'),
    methods: getAI(
      'methods', 'Methods', 'method',
      'שיטות', 'שיטה',
      'שיטות הסבר', 'הסבר שיטות', 'הסבר-שיטות', 'הסבר: שיטות', 'הסברשיטות',
      'explanation methods', 'methods explanation'
    ) || getByTerms([
      ['הסבר','explanation'],
      ['שיטה','שיטות','method','methods']
    ]) || getByAnyTerm(['שיטה','שיטות','method','methods']),
    charge: getAI(
      'charge', 'Charge',
      'חיוב', 'הסבר חיוב', 'הסבר-חיוב', 'הסבר: חיוב', 'הסברחיוב',
      'charge explanation', 'explanation charge'
    ) || getByTerms([
      ['הסבר','explanation'],
      ['חיוב','חיובים','charge','charges']
    ]),
    address: getAI('address', 'Address', 'כתובת'),
    birthDate: normalizedDate,
    winPromise: getAI(
      'winPromise', 'WinPromise', 'הבטחת זכייה', 'הבטחת זכיה', 'הבטחה לזכייה', 'הבטחה לזכיה', 'זכייה', 'זכיה'
    ) || getByTerms([
      ['הבטחה','הבטחת','promise'],
      ['זכיה','זכייה','win','winning','prize']
    ]),
    credit: getAI(
      'credit', 'Credit', 'אשראי', 'כרטיס אשראי', 'מספר אשראי', 'credit card', 'card', 'cc'
    ) || getByTerms([
      ['אשראי','credit'],
      ['כרטיס','card','cc']
    ]),
    reflection: getAI(
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

  // Capture unmatched columns as extras (by original header names)
  const extras = {};
  for (const originalKey of rowKeys) {
    if (!usedOriginalKeys.has(originalKey)) {
      const val = row[originalKey];
      if (val !== undefined && val !== null && String(val) !== '') {
        extras[originalKey] = val;
      }
    }
  }
  if (Object.keys(extras).length > 0) {
    record.extras = extras;
  }

  // Post-processing for AI format: parse rich text fields into structured objects
  if (isAiFormat) {
    const qaFields = ['methods', 'charge', 'address', 'birthDate', 'winPromise', 'credit', 'reflection'];
    for (const field of qaFields) {
      const val = record[field];
      if (typeof val === 'string' && val.length > 10) {
        record[field] = parseAiFieldContent(val);
      }
    }
    // Normalize status to canonical Hebrew
    if (typeof record.status === 'string') {
      record.status = normalizeAiStatus(record.status);
    }
    record.sourceFormat = 'ai';
  }

  return record;
}

function extractSubscriberId(json, uploadFileName) {
  // 1) Explicit field
  if (json.subscriberId) return String(json.subscriberId).trim();
  if (json.subscriber_id) return String(json.subscriber_id).trim();
  if (json.customerId) return String(json.customerId).trim();
  if (json.customer_id) return String(json.customer_id).trim();
  if (json.מספר_מנוי) return String(json.מספר_מנוי).trim();
  if (json.מנוי) return String(json.מנוי).trim();
  // 2) From metadata
  if (json.metadata) {
    if (json.metadata.subscriberId) return String(json.metadata.subscriberId).trim();
    if (json.metadata.subscriber_id) return String(json.metadata.subscriber_id).trim();
    if (json.metadata.customerId) return String(json.metadata.customerId).trim();
    if (json.metadata.customer_id) return String(json.metadata.customer_id).trim();
  }
  // 3) Parse from filename pattern: customer_XXXXXXX_date or XXXXXXX_date
  const candidates = [uploadFileName, json.originalFileName, json.fileName].filter(Boolean);
  for (const fname of candidates) {
    const m = fname.match(/customer[_\-]?(\d{4,})/i);
    if (m) return m[1];
  }
  // 4) Try any leading number sequence of 6+ digits in any filename
  for (const fname of candidates) {
    const m2 = fname.match(/(\d{6,})/);
    if (m2) return m2[1];
  }
  return '';
}

// Map section-based JSON (from n8n QA automation) to dashboard record format
// Supports the rich JSON structure with sections[].name/status/reason/evidence
function mapJsonToRecord(json, uploadFileName) {
  const sections = json.sections || {};

  // Map section name → dashboard field key (normalized matching)
  const sectionNameToField = {
    'הסבר שיטות': 'methods',
    'שיטות': 'methods',
    'אשראי': 'credit',
    'כרטיס אשראי': 'credit',
    'הבטחת זכייה': 'winPromise',
    'הבטחת זכיה': 'winPromise',
    'תאריך לידה': 'birthDate',
    'כתובת': 'address',
    'הסבר חיוב': 'charge',
    'חיוב': 'charge',
    'שיקוף שיחה': 'reflection',
    'שיקוף': 'reflection'
  };

  // Convert Hebrew status text to dashboard status icon
  function statusToIcon(status) {
    if (!status) return '⬜';
    const s = String(status).trim();
    if (s === 'תקין' || s.toLowerCase() === 'valid') return '✅';
    if (s === 'טעון שיפור' || s.toLowerCase().includes('improve')) return '⚠️';
    if (s === 'לא תקין' || s.toLowerCase().includes('invalid') || s.toLowerCase().includes('fail')) return '❌';
    return '⬜';
  }

  // Extract flat evidence text array from rich evidence objects
  function flattenEvidence(evidenceArr) {
    if (!Array.isArray(evidenceArr)) return [];
    return evidenceArr.map(e => {
      if (typeof e === 'string') return e;
      if (typeof e === 'object' && e !== null) return e.text || e.fullText || JSON.stringify(e);
      return String(e);
    }).filter(Boolean);
  }

  // Build a rich field object from a section
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

  const subscriberId = extractSubscriberId(json, uploadFileName);

  // Initialize record with defaults
  const record = {
    fileName: json.originalFileName || json.fileName || 'unknown',
    subscriberId: subscriberId,
    status: json.finalStatus || 'לא ידוע',
    methods: '⬜',
    charge: '⬜',
    address: '⬜',
    birthDate: '⬜',
    winPromise: '⬜',
    credit: '⬜',
    reflection: '⬜',
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

  // Map each section to the correct dashboard field
  for (const [_key, section] of Object.entries(sections)) {
    if (!section || !section.name) continue;
    const sectionName = String(section.name).trim();
    const fieldKey = sectionNameToField[sectionName];
    if (!fieldKey) continue;

    const field = buildField(section);

    // Enrich specific fields with extra data from the section
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

app.post('/api/upload-excel', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const workbook = XLSX.readFile(filePath, { cellDates: true, codepage: 65001 });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const isAiFormat = detectAiFormat(sheetName, rows[0] || {});
    console.log(`[Excel Upload] File: ${req.file.originalname}, Format: ${isAiFormat ? 'AI' : 'Human'}, Rows: ${rows.length}`);

    const records = rows.map(r => mapRowToRecord(r, isAiFormat));

    // Build header debug info from the first row's keys
    const firstRow = rows[0] || {};
    const originalHeaders = Object.keys(firstRow);
    const nk2o = new Map();
    for (const k of originalHeaders) nk2o.set(normalizeHeader(k), k);

    const tryMatch = (candidates, termGroups) => {
      // 1) direct
      for (const c of candidates) {
        const norm = normalizeHeader(c);
        if (nk2o.has(norm)) return nk2o.get(norm);
      }
      // 2) term groups contains
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

    // Optionally delete uploaded file after parsing
    fs.unlink(filePath, () => {});

    const datasetId = generateDatasetId(req.file.originalname || 'dataset');
    // Compute union of fields across all records, excluding 'extras'
    const fieldSet = new Set();
    for (const r of records) {
      for (const k of Object.keys(r)) {
        if (k !== 'extras') fieldSet.add(k);
      }
    }
    const fields = Array.from(fieldSet);
    const createdAt = new Date().toISOString();
    const name = req.file.originalname || datasetId;

    datasetsIndex[datasetId] = {
      id: datasetId,
      name,
      createdAt,
      records,
      fields,
      formatType: isAiFormat ? 'ai' : 'human'
    };

    const stats = computeDatasetStats(records);

    return res.json({
      datasetId,
      dataset: {
        id: datasetId,
        name,
        createdAt,
        fields,
        numRecords: stats.total,
        statusCounts: stats.statusCounts
      },
      debug: {
        originalHeaders,
        matched: { methods: matchedMethodsHeader, charge: matchedChargeHeader },
        formatType: isAiFormat ? 'ai' : 'human'
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Failed to parse file' });
  }
});

// JSON import endpoint – accepts .json files with section-based QA results
app.post('/api/upload-json', jsonUpload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'לא הועלה קובץ' });
    }

    const filePath = req.file.path;
    const raw = fs.readFileSync(filePath, 'utf-8');

    // Clean up uploaded file immediately
    fs.unlink(filePath, () => {});

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_e) {
      return res.status(400).json({ error: 'הקובץ אינו JSON תקין' });
    }

    // Support both single object and array of objects
    const items = Array.isArray(parsed) ? parsed : [parsed];

    if (items.length === 0) {
      return res.status(400).json({ error: 'קובץ ה-JSON ריק' });
    }

    const uploadFileName = req.file.originalname || '';
    const records = items.map(item => mapJsonToRecord(item, uploadFileName));

    const datasetId = generateDatasetId(req.file.originalname || 'json-import');
    const fields = ['subscriberId', 'fileName', 'status', 'methods', 'charge', 'address', 'birthDate', 'winPromise', 'credit', 'reflection', 'transcript'];
    const createdAt = new Date().toISOString();
    const name = req.file.originalname || `ייבוא JSON - ${new Date().toLocaleDateString('he-IL')}`;

    datasetsIndex[datasetId] = {
      id: datasetId,
      name,
      createdAt,
      records,
      fields
    };

    const stats = computeDatasetStats(records);

    console.log(`[JSON Import] File: ${req.file.originalname}, Records: ${records.length}, Dataset: ${datasetId}`);

    return res.json({
      datasetId,
      dataset: {
        id: datasetId,
        name,
        createdAt,
        fields,
        numRecords: stats.total,
        statusCounts: stats.statusCounts
      }
    });
  } catch (err) {
    console.error('[JSON Import Error]', err);
    return res.status(500).json({ error: err.message || 'שגיאה בעיבוד קובץ ה-JSON' });
  }
});

// List datasets (metadata only)
app.get('/api/datasets', (_req, res) => {
  try {
    const list = Object.values(datasetsIndex).map(ds => {
      const stats = computeDatasetStats(ds.records || []);
      return {
        id: ds.id,
        name: ds.name,
        createdAt: ds.createdAt,
        fields: ds.fields || [],
        numRecords: stats.total,
        statusCounts: stats.statusCounts
      };
    });
    res.json({ datasets: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch datasets' });
  }
});

// Get dataset by id (includes records)
app.get('/api/dataset/:id', (req, res) => {
  const { id } = req.params;
  const ds = datasetsIndex[id];
  if (!ds) return res.status(404).json({ error: 'Dataset not found' });
  res.json({
    id: ds.id,
    name: ds.name,
    createdAt: ds.createdAt,
    fields: ds.fields || [],
    records: ds.records || []
  });
});

// Process audio file endpoint - sends to n8n webhook
app.post('/api/process-audio', audioUpload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const filePath = req.file.path;
    const fileName = req.body.fileName || req.file.originalname;
    
    // Get n8n webhook URL from environment variable
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/transcribe-ingest';
    
    console.log(`[Audio Upload] File: ${fileName}, Size: ${req.file.size} bytes`);
    console.log(`[Audio Upload] Sending to n8n: ${n8nWebhookUrl}`);

    // Send audio file to n8n webhook with metadata
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(filePath), {
      filename: fileName,
      contentType: req.file.mimetype
    });
    
    // Add metadata
    formData.append('fileName', fileName);
    formData.append('fileSize', req.file.size.toString());
    formData.append('mimeType', req.file.mimetype);
    formData.append('uploadedAt', new Date().toISOString());
    
    // Callback URL for n8n to send results back
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/callback/transcription`;
    formData.append('callbackUrl', callbackUrl);

    const fetch = (await import('node-fetch')).default;
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
      timeout: 300000 // 5 minutes timeout for processing
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error(`[n8n Error] Status: ${n8nResponse.status}, Response: ${errorText}`);
      throw new Error(`n8n webhook returned status ${n8nResponse.status}`);
    }

    const n8nResult = await n8nResponse.json();
    console.log(`[n8n Response] Job ID: ${n8nResult.job_id || 'N/A'}, Status: ${n8nResult.status || 'N/A'}`);

    // Clean up uploaded file after sending to n8n
    fs.unlink(filePath, (err) => {
      if (err) console.error('Failed to delete temp file:', err);
    });

    // Return the result from n8n (should include job_id and status)
    return res.json({ 
      result: n8nResult,
      success: true
    });

  } catch (err) {
    console.error('[Audio Processing Error]', err);
    
    // Clean up file on error
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    
    return res.status(500).json({ 
      error: err.message || 'Failed to process audio file',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Callback endpoint for n8n to send transcription results
app.post('/api/callback/transcription', express.json(), (req, res) => {
  try {
    const { job_id, fileName, status, segments, speakers, conversation_duration_ms, segments_count, speakers_count } = req.body;
    
    console.log(`[Transcription Callback] Job: ${job_id}, File: ${fileName}, Status: ${status}`);
    console.log(`[Transcription Callback] Segments: ${segments_count}, Speakers: ${speakers_count}, Duration: ${conversation_duration_ms}ms`);
    
    // Parse segments and speakers if they're strings
    const parsedSegments = typeof segments === 'string' ? JSON.parse(segments) : segments;
    const parsedSpeakers = typeof speakers === 'string' ? JSON.parse(speakers) : speakers;
    
    // Store results in memory cache
    transcriptionResults[job_id] = {
      job_id,
      fileName,
      status,
      segments: parsedSegments,
      speakers: parsedSpeakers,
      conversation_duration_ms,
      segments_count,
      speakers_count,
      receivedAt: new Date().toISOString()
    };
    
    console.log(`[Transcription Callback] Stored results for job ${job_id} (file: ${fileName})`);
    
    res.status(200).json({ received: true, job_id, fileName });
  } catch (err) {
    console.error('[Callback Error]', err);
    res.status(500).json({ error: 'Failed to process callback' });
  }
});

// Get transcription result by job_id
app.get('/api/transcription/:job_id', (req, res) => {
  const { job_id } = req.params;
  const result = transcriptionResults[job_id];
  
  if (!result) {
    return res.status(404).json({ error: 'Transcription not found' });
  }
  
  res.json(result);
});

// Receive QA results from n8n automation
app.post('/api/qa-result', express.json(), (req, res) => {
  try {
    const qaData = req.body;
    console.log(`[QA Result] Received for file: ${qaData.fileName}`);
    
    // Transform the data structure from automation format to dashboard format
    const record = {
      fileName: qaData.fileName || 'unknown',
      subscriberId: qaData.subscriberId || qaData.subscriber_id || qaData.customerId || qaData.customer_id || qaData.מספר_מנוי || '',
      status: qaData.final_status || qaData.overall || 'לא ידוע',
      
      methods: {
        status: qaData.s1_status || '⬜',
        summary: qaData.s1_why || '',
        evidence: [qaData.s1_e1, qaData.s1_e2].filter(Boolean),
        timestamp: qaData.s1_timestamp || ''
      },
      
      charge: {
        status: qaData.s2_status || '⬜',
        summary: qaData.s2_why || '',
        evidence: [qaData.s2_e1, qaData.s2_e2].filter(Boolean),
        timestamp: qaData.s2_timestamp || ''
      },
      
      address: {
        status: qaData.s3_status || '⬜',
        summary: qaData.s3_why || '',
        evidence: [qaData.s3_e1, qaData.s3_e2].filter(Boolean),
        details: {
          street_number: qaData.address_street_number || '',
          locality: qaData.address_locality || '',
          zip: qaData.address_zip || '',
          completeness: qaData.address_completeness || ''
        },
        timestamp: qaData.s3_timestamp || ''
      },
      
      birthDate: {
        status: qaData.s4_status || '⬜',
        summary: qaData.s4_why || '',
        evidence: [qaData.s4_e1].filter(Boolean),
        value: qaData.dob_text || '',
        timestamp: qaData.s4_timestamp || ''
      },
      
      winPromise: {
        status: qaData.s5_status || '⬜',
        summary: qaData.s5_why || '',
        evidence: [qaData.s5_e1].filter(Boolean),
        timestamp: qaData.s5_timestamp || ''
      },
      
      credit: {
        status: qaData.s6_status || '⬜',
        summary: qaData.s6_why || '',
        evidence: [qaData.s6_e1].filter(Boolean),
        timestamp: qaData.s6_timestamp || ''
      },
      
      reflection: {
        status: qaData.s7_status || '⬜',
        summary: qaData.s7_why || '',
        evidence: [qaData.s7_e1].filter(Boolean),
        timestamp: qaData.s7_timestamp || ''
      },
      
      transcript: qaData.transcript || '',
      
      metadata: {
        fileId: qaData.fileId || '',
        timestamp: qaData.timestamp || new Date().toISOString(),
        track: qaData.track || '',
        approved: qaData.approved || false
      }
    };
    
    // Create or update dataset for this automation run
    const datasetId = qaData.datasetId || generateDatasetId('qa-automation');
    
    if (!datasetsIndex[datasetId]) {
      datasetsIndex[datasetId] = {
        id: datasetId,
        name: `QA Automation - ${new Date().toLocaleDateString('he-IL')}`,
        createdAt: new Date().toISOString(),
        records: [],
        fields: ['subscriberId', 'fileName', 'status', 'methods', 'charge', 'address', 'birthDate', 'winPromise', 'credit', 'reflection', 'transcript']
      };
    }
    
    // Add or update record in dataset
    const existingIndex = datasetsIndex[datasetId].records.findIndex(r => r.fileName === record.fileName);
    if (existingIndex >= 0) {
      datasetsIndex[datasetId].records[existingIndex] = record;
    } else {
      datasetsIndex[datasetId].records.push(record);
    }
    
    console.log(`[QA Result] Stored in dataset ${datasetId}, total records: ${datasetsIndex[datasetId].records.length}`);
    
    res.status(200).json({ 
      success: true, 
      datasetId,
      fileName: record.fileName,
      status: record.status
    });
    
  } catch (err) {
    console.error('[QA Result Error]', err);
    res.status(500).json({ error: 'Failed to process QA result' });
  }
});

// Deep comparison endpoint – AI (dataset A) vs Human (dataset B)
app.get('/api/compare/:idA/:idB', (req, res) => {
  try {
    const { idA, idB } = req.params;
    const dsA = datasetsIndex[idA];
    const dsB = datasetsIndex[idB];
    if (!dsA) return res.status(404).json({ error: 'Dataset A not found' });
    if (!dsB) return res.status(404).json({ error: 'Dataset B not found' });

    const sectionKeys = ['methods', 'charge', 'address', 'birthDate', 'winPromise', 'credit', 'reflection'];
    const sectionLabels = {
      methods: 'הסבר שיטות',
      charge: 'הסבר חיוב',
      address: 'כתובת',
      birthDate: 'תאריך לידה',
      winPromise: 'הבטחת זכייה',
      credit: 'אשראי',
      reflection: 'שיקוף שיחה'
    };

    // Normalize a status value to a canonical form for comparison
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

    // Build lookup map from dataset B by subscriberId
    const bBySubscriber = new Map();
    for (const rec of (dsB.records || [])) {
      const subId = (rec.subscriberId || '').trim();
      if (subId && !bBySubscriber.has(subId)) bBySubscriber.set(subId, rec);
    }

    // Match by subscriberId only
    function findMatch(recA) {
      const subId = (recA.subscriberId || '').trim();
      if (subId && bBySubscriber.has(subId)) return { rec: bBySubscriber.get(subId), matchedBy: 'subscriberId' };
      return null;
    }

    // Per-section stats
    const sectionStats = {};
    for (const k of sectionKeys) {
      sectionStats[k] = { label: sectionLabels[k], matches: 0, mismatches: 0, total: 0 };
    }

    let overallStatusMatches = 0;
    let totalCompared = 0;
    let matchedBySubscriber = 0;

    const comparisons = [];

    for (const recA of (dsA.records || [])) {
      const match = findMatch(recA);

      if (!match) {
        comparisons.push({
          fileName: recA.fileName, subscriberId: recA.subscriberId || '',
          matched: false, matchedBy: null,
          overallA: recA.status, overallB: null, sections: null
        });
        continue;
      }

      const recB = match.rec;
      totalCompared++;
      matchedBySubscriber++;

      const normOverallA = normalizeStatus({ status: recA.status === 'תקין' ? '✅' : recA.status === 'טעון שיפור' ? '⚠️' : recA.status === 'לא תקין' ? '❌' : recA.status });
      const normOverallB = normalizeStatus({ status: recB.status === 'תקין' ? '✅' : recB.status === 'טעון שיפור' ? '⚠️' : recB.status === 'לא תקין' ? '❌' : recB.status });
      if (normOverallA === normOverallB) overallStatusMatches++;

      const sectionComparisons = {};
      for (const k of sectionKeys) {
        const valA = recA[k];
        const valB = recB[k];
        const normA = normalizeStatus(valA);
        const normB = normalizeStatus(valB);
        const matchSec = normA === normB;

        if (normA !== 'unknown' || normB !== 'unknown') {
          sectionStats[k].total++;
          if (matchSec) sectionStats[k].matches++;
          else sectionStats[k].mismatches++;
        }

        sectionComparisons[k] = {
          label: sectionLabels[k],
          match: matchSec,
          ai: { status: displayStatus(valA), summary: getSummary(valA), evidence: getEvidence(valA) },
          human: { status: displayStatus(valB), summary: getSummary(valB), evidence: getEvidence(valB) }
        };
      }

      comparisons.push({
        fileName: recA.fileName,
        subscriberId: recA.subscriberId || recB.subscriberId || '',
        fileNameB: recB.fileName,
        matched: true,
        matchedBy: match.matchedBy,
        overallA: recA.status,
        overallB: recB.status,
        overallMatch: normOverallA === normOverallB,
        sections: sectionComparisons
      });
    }

    // Summary
    const sectionAccuracy = {};
    for (const k of sectionKeys) {
      const s = sectionStats[k];
      sectionAccuracy[k] = {
        label: s.label,
        matches: s.matches,
        mismatches: s.mismatches,
        total: s.total,
        accuracy: s.total > 0 ? Math.round((s.matches / s.total) * 100) : null
      };
    }

    const totalSectionChecks = sectionKeys.reduce((sum, k) => sum + sectionStats[k].total, 0);
    const totalSectionMatches = sectionKeys.reduce((sum, k) => sum + sectionStats[k].matches, 0);

    res.json({
      datasetA: { id: dsA.id, name: dsA.name, totalRecords: (dsA.records || []).length },
      datasetB: { id: dsB.id, name: dsB.name, totalRecords: (dsB.records || []).length },
      summary: {
        totalCompared,
        unmatched: comparisons.filter(c => !c.matched).length,
        matchedBySubscriber,
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

// Lightweight health endpoint for deploy platforms/load balancers
app.get('/healthz', (_req, res) => {
  try {
    // Basic readiness: server booted and in-memory index exists
    if (typeof datasetsIndex === 'object') {
      return res.status(200).send('ok');
    }
    return res.status(500).send('unhealthy');
  } catch (_err) {
    return res.status(500).send('unhealthy');
  }
});

// Fallback: serve dashboard.html at root
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Only start listening when running directly (not on Vercel serverless)
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
    console.log(`[Config] N8N_WEBHOOK_URL: ${process.env.N8N_WEBHOOK_URL || 'NOT SET'}`);
  });
}

export default app;


