// Run: node debug-server.js
// Game POSTs log lines to http://localhost:9999/log → written to debug.log
const http = require('http');
const fs   = require('fs');
const LOG  = './debug.log';

fs.writeFileSync(LOG, `=== session ${new Date().toISOString()} ===\n`);
console.log(`Logging to ${LOG}`);

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      fs.appendFileSync(LOG, body + '\n');
      res.writeHead(200); res.end('ok');
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(9999, () => console.log('Debug server listening on :9999'));
