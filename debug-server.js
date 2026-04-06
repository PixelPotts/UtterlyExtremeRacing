// Run: node debug-server.js
// Game POSTs log lines to http://localhost:9999/log → written to pinkcircledebug.log
// Pursuer logs POST to http://localhost:9999/pursuer-log → written to pursuer.log
const http = require('http');
const fs   = require('fs');
const LOG         = './pinkcircledebug.log';
const PURSUER_LOG = './pursuer.log';

fs.writeFileSync(LOG,         `=== session ${new Date().toISOString()} ===\n`);
fs.writeFileSync(PURSUER_LOG, `=== session ${new Date().toISOString()} ===\n`);
console.log(`Logging to ${LOG} and ${PURSUER_LOG}`);

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'POST' && req.url === '/clear') {
    fs.writeFileSync(LOG,         `=== session ${new Date().toISOString()} ===\n`);
    fs.writeFileSync(PURSUER_LOG, `=== pursuer session ${new Date().toISOString()} ===\n`);
    res.writeHead(200); res.end('ok');
    return;
  }

  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      fs.appendFileSync(LOG, body + '\n');
      res.writeHead(200); res.end('ok');
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/pursuer-log') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      fs.appendFileSync(PURSUER_LOG, body + '\n');
      res.writeHead(200); res.end('ok');
    });
    return;
  }

  res.writeHead(404); res.end();
}).listen(9999, () => console.log('Debug server listening on :9999'));
