import { createServer } from 'http';
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
  const publicIp = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket.remoteAddress || 'unknown';

  handleConnection(ws, publicIp);
});

server.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT}`);
});
