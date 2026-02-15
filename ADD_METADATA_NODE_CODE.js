// Add Metadata to AI Agent
// מעביר את ה-fileName המקורי ל-AI Agent

const originalFileName = $input.item.json.originalFileName || 
                         $input.item.binary?.data0?.originalFileName ||
                         $input.item.json.fileName ||
                         'unknown.wav';

const fileId = $input.item.json.fileId || 
               $input.item.json.id || 
               '';

const timestamp = $input.item.json.timestamp || 
                  new Date().toISOString();

// שמור את כל הנתונים הקיימים + הוסף metadata
return {
  json: {
    ...($input.item.json || {}),
    originalFileName: originalFileName,
    fileName: originalFileName,
    fileId: fileId,
    timestamp: timestamp
  },
  binary: $input.item.binary
};
