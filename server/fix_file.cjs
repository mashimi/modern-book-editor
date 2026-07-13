const fs = require('fs');
const content = fs.readFileSync('index.ts', 'utf8');
const lines = content.split('\n');
// Keep lines 0-499 (0-indexed), and the last 14 lines (Start section onward)
const kept = lines.slice(0, 499); // first 499 lines
const last = lines.slice(lines.length - 14); // last 14 lines (Start + PORT + app.listen)
// Remove duplicate }); at line 499 (0-indexed) by keeping 498
kept.pop(); // remove the duplicate });
kept.push('// ---------------------------------------------------------------------------');
kept.push('// Start');
kept.push('// ---------------------------------------------------------------------------');
kept.push('// ---------------------------------------------------------------------------');
kept.push(...last);
fs.writeFileSync('index.ts', kept.join('\n'), 'utf8');
console.log('Fixed. Total lines:', kept.length);