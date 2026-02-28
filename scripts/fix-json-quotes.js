const fs = require('fs');
const filePath = 'c:/Repositories/na-project/Data/contents3.json';
let content = fs.readFileSync(filePath, 'utf8');

// The problem: create_file interpreted \" as literal " characters.
// We need to find these bare " inside JSON string values and replace with smart quotes.
// 
// Strategy: For each line matching a JSON key-value string pattern,
// extract the raw value substring between the FIRST ': "' and the LAST '"' (before optional comma),
// then replace any inner " with Unicode smart quotes.

const lines = content.split('\n');
const fixedLines = [];
let fixes = 0;

for (const line of lines) {
  // Find lines that look like JSON string properties:  "key": "value",
  const kvStart = line.indexOf('": "');
  if (kvStart === -1) {
    fixedLines.push(line);
    continue;
  }
  
  // Find the end of the value - it's the last " before optional comma and end of line
  const trimmed = line.trimEnd();
  let valueEnd;
  if (trimmed.endsWith('",')) {
    valueEnd = trimmed.length - 2; // position of the closing "
  } else if (trimmed.endsWith('"')) {
    valueEnd = trimmed.length - 1;
  } else {
    fixedLines.push(line);
    continue;
  }
  
  const valueStart = kvStart + 4; // after ': "'
  
  if (valueStart >= valueEnd) {
    fixedLines.push(line);
    continue;
  }
  
  const value = line.substring(valueStart, valueEnd);
  
  // Check for unescaped quotes
  if (value.includes('"')) {
    // Replace with smart quotes alternating left/right
    let open = true;
    const fixed = value.replace(/"/g, () => {
      const r = open ? '\u201C' : '\u201D';
      open = !open;
      return r;
    });
    const newLine = line.substring(0, valueStart) + fixed + line.substring(valueEnd);
    fixedLines.push(newLine);
    fixes++;
  } else {
    fixedLines.push(line);
  }
}

const result = fixedLines.join('\n');
try {
  const parsed = JSON.parse(result);
  console.log('Valid JSON! Entries:', parsed.length, '| Fixed', fixes, 'lines');
  parsed.forEach(e => console.log(' ', e.id, '-', Object.keys(e.title).length, 'langs'));
  fs.writeFileSync(filePath, result, 'utf8');
  console.log('File saved successfully.');
} catch (e) {
  console.error('Still invalid:', e.message);
  const pos = parseInt(e.message.match(/position (\d+)/)?.[1] || '0');
  if (pos) {
    console.error('Context:', result.substring(Math.max(0,pos-50), pos+50));
  }
}
