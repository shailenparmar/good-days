import { createServer } from 'http';
import { createHash } from 'crypto';
import { WebSocketServer } from 'ws';
import { handleConnection } from './relay.js';

const PORT = Number(process.env.PORT) || 3001;

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('good-days relay server');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  // Extract public IP from headers (Cloudflare/proxy) or socket
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket.remoteAddress || 'unknown';

  // Hash immediately — raw IP never reaches application code.
  // Same-network devices produce the same hash, so grouping still works.
  const hashedIp = createHash('sha256').update(rawIp).digest('hex').slice(0, 16);

  handleConnection(ws, hashedIp);
});

server.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT}`);
});
