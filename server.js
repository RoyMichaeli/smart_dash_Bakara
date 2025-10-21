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

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
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

// Map sheet rows to our dashboard schema
function mapRowToRecord(row) {
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

  const rawDate = get('birthDate', 'BirthDate', 'תאריך לידה', 'תאריך-לידה', 'תאריך: לידה');
  const normalizedDate = (() => {
    if (!rawDate) return '';
    if (rawDate instanceof Date) {
      return rawDate.toISOString().slice(0, 10);
    }
    // Try parse string
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

    const records = rows.map(mapRowToRecord);

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
      fields
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
        matched: { methods: matchedMethodsHeader, charge: matchedChargeHeader }
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Failed to parse file' });
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

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});


