// Parse AI Agent output - FIXED VERSION
// התוצאה מגיעה כ-JSON string, לא כטקסט חופשי

const agentOutput = $input.item.json.output || $input.item.json.text || '';
const originalFileName = $input.item.json.originalFileName || 'unknown.wav';

// נסה לפרסר את ה-JSON שבתוך ה-output
let parsedData = null;
try {
  parsedData = JSON.parse(agentOutput);
} catch (e) {
  console.log('Failed to parse JSON, trying as text:', e);
}

// אם הצלחנו לפרסר - השתמש בנתונים ישירות
if (parsedData && typeof parsedData === 'object') {
  // ה-AI Agent כבר החזיר את הפורמט הנכון!
  return {
    json: {
      fileName: parsedData.fileName || originalFileName,
      fileId: parsedData.fileId || $input.item.json.fileId || '',
      timestamp: parsedData.timestamp || new Date().toISOString(),
      final_status: parsedData.final_status || parsedData.overall || 'לא ידוע',
      overall: parsedData.overall || parsedData.final_status || 'לא ידוע',
      
      // Section 1: Methods
      s1_status: parsedData.s1_status || '⬜',
      s1_why: parsedData.s1_why || 'הסבר שיטות',
      s1_e1: parsedData.s1_e1 || '',
      s1_e2: parsedData.s1_e2 || '',
      s1_timestamp: parsedData.s1_timestamp || '',
      
      // Section 2: Credit
      s2_status: parsedData.s2_status || '⬜',
      s2_why: parsedData.s2_why || 'אשראי',
      s2_e1: parsedData.s2_e1 || '',
      s2_e2: parsedData.s2_e2 || '',
      s2_timestamp: parsedData.s2_timestamp || '',
      
      // Section 3: Win Promise
      s3_status: parsedData.s3_status || '⬜',
      s3_why: parsedData.s3_why || 'הבטחת זכייה',
      s3_e1: parsedData.s3_e1 || '',
      s3_e2: parsedData.s3_e2 || '',
      s3_timestamp: parsedData.s3_timestamp || '',
      
      // Section 4: Charge Explanation (s4 ב-AI = DOB, אבל s6 = חיוב)
      s4_status: parsedData.s6_status || '⬜',
      s4_why: parsedData.s6_why || 'הסבר חיוב',
      s4_e1: parsedData.s6_e1 || '',
      s4_e2: parsedData.s6_e2 || '',
      s4_timestamp: parsedData.s6_timestamp || '',
      
      // Section 5: Address
      s5_status: parsedData.s5_status || '⬜',
      s5_why: parsedData.s5_why || 'כתובת',
      s5_e1: parsedData.s5_e1 || '',
      s5_e2: parsedData.s5_e2 || '',
      s5_timestamp: parsedData.s5_timestamp || '',
      address_street_number: parsedData.address_street_number || '',
      address_locality: parsedData.address_locality || '',
      address_zip: parsedData.address_zip || '',
      address_completeness: parsedData.address_completeness || 'none',
      
      // Section 6: Birth Date (s4 ב-AI)
      s6_status: parsedData.s4_status || '⬜',
      s6_why: parsedData.s4_why || 'תאריך לידה',
      s6_e1: parsedData.s4_e1 || '',
      s6_timestamp: parsedData.s4_timestamp || '',
      dob_text: parsedData.dob_text || '',
      
      // Section 7: Reflection
      s7_status: parsedData.s7_status || '⬜',
      s7_why: parsedData.s7_why || 'שיקוף שיחה',
      s7_e1: parsedData.s7_e1 || '',
      s7_timestamp: parsedData.s7_timestamp || '',
      
      // Section 8: SMS
      s8_status: parsedData.s8_status || '⬜',
      s8_why: parsedData.s8_why || 'SMS',
      s8_e1: parsedData.s8_e1 || '',
      s8_timestamp: parsedData.s8_timestamp || '',
      
      // Transcript
      transcript: parsedData.transcript || '',
      transcript_normalized: parsedData.transcript_normalized || '',
      
      // Metadata
      track: parsedData.track || '',
      approved: parsedData.approved || false,
      detectionSource: 'ai_agent',
      needs_human_review: parsedData.needs_human_review || false,
      confidence: parsedData.confidence || 0,
      
      // Raw output for debugging
      raw_agent_output: agentOutput
    }
  };
}

// אם לא הצלחנו לפרסר - נסה את השיטה הישנה (טקסט חופשי)
function extractFieldStatus(text, sectionNumber) {
  const sectionRegex = new RegExp(`סעיף ${sectionNumber}[:\\s]+([^\\n]+)`, 'i');
  const match = text.match(sectionRegex);
  if (!match) return { status: '⬜', why: '', e1: '', e2: '' };
  
  const line = match[1];
  let status = '⬜';
  if (line.includes('✅')) status = '✅';
  else if (line.includes('⚠️')) status = '⚠️';
  else if (line.includes('❌')) status = '❌';
  
  const whyMatch = text.match(new RegExp(`סעיף ${sectionNumber}[^\\n]*\\n([^\\n]+)`, 'i'));
  const why = whyMatch ? whyMatch[1].replace(/[✅⚠️❌]/g, '').trim() : '';
  
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

let final_status = 'לא ידוע';
if (agentOutput.includes('סטטוס סופי: תקין') || agentOutput.includes('✅ תקין')) {
  final_status = 'תקין';
} else if (agentOutput.includes('סטטוס סופי: טעון שיפור') || agentOutput.includes('⚠️')) {
  final_status = 'טעון שיפור';
} else if (agentOutput.includes('סטטוס סופי: לא תקין') || agentOutput.includes('❌')) {
  final_status = 'לא תקין';
}

const s1 = extractFieldStatus(agentOutput, 1);
const s2 = extractFieldStatus(agentOutput, 2);
const s3 = extractFieldStatus(agentOutput, 3);
const s4 = extractFieldStatus(agentOutput, 4);
const s5 = extractFieldStatus(agentOutput, 5);
const s6 = extractFieldStatus(agentOutput, 6);
const s7 = extractFieldStatus(agentOutput, 7);
const s8 = extractFieldStatus(agentOutput, 8);

const addressMatch = agentOutput.match(/כתובת[:\\s]+([^\\n]+)/i);
const address_text = addressMatch ? addressMatch[1] : '';

const dobMatch = agentOutput.match(/תאריך לידה[:\\s]+(\\d{1,2}[\\.\\/-]\\d{1,2}[\\.\\/-]\\d{2,4})/i);
const dob_text = dobMatch ? dobMatch[1] : '';

return {
  json: {
    fileName: originalFileName,
    fileId: $input.item.json.fileId || '',
    timestamp: new Date().toISOString(),
    final_status: final_status,
    overall: final_status,
    
    s1_status: s1.status,
    s1_why: s1.why || 'הסבר שיטות',
    s1_e1: s1.e1,
    s1_e2: s1.e2,
    s1_timestamp: '',
    
    s2_status: s2.status,
    s2_why: s2.why || 'אשראי',
    s2_e1: s2.e1,
    s2_e2: s2.e2,
    s2_timestamp: '',
    
    s3_status: s3.status,
    s3_why: s3.why || 'הבטחת זכייה',
    s3_e1: s3.e1,
    s3_e2: s3.e2,
    s3_timestamp: '',
    
    s4_status: s4.status,
    s4_why: s4.why || 'הסבר חיוב',
    s4_e1: s4.e1,
    s4_e2: s4.e2,
    s4_timestamp: '',
    
    s5_status: s5.status,
    s5_why: s5.why || 'כתובת',
    s5_e1: s5.e1 || address_text,
    s5_e2: s5.e2,
    s5_timestamp: '',
    address_street_number: '',
    address_locality: '',
    address_zip: '',
    address_completeness: s5.status === '✅' ? 'full' : (s5.status === '⚠️' ? 'partial' : 'none'),
    
    s6_status: s6.status,
    s6_why: s6.why || 'תאריך לידה',
    s6_e1: s6.e1 || dob_text,
    s6_timestamp: '',
    dob_text: dob_text,
    
    s7_status: s7.status,
    s7_why: s7.why || 'שיקוף שיחה',
    s7_e1: s7.e1,
    s7_timestamp: '',
    
    s8_status: s8.status,
    s8_why: s8.why || 'SMS',
    s8_e1: s8.e1,
    s8_timestamp: '',
    
    transcript: '',
    transcript_normalized: '',
    
    track: '',
    approved: final_status === 'תקין',
    detectionSource: 'ai_agent',
    
    raw_agent_output: agentOutput
  }
};
