import { randomUUID } from 'crypto';
import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, ClientRecord, ColorPayload } from './types.js';

const clients = new Map<string, ClientRecord>();
const ipGroups = new Map<string, Set<string>>();

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function generateSecret(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

function pairClients(id1: string, id2: string) {
  const c1 = clients.get(id1);
  const c2 = clients.get(id2);
  if (!c1 || !c2) return;
  console.log(`[relay] PAIRED ${c1.role}(${id1.slice(0,8)}) <-> ${c2.role}(${id2.slice(0,8)})`);

  const secret = c1.secret || c2.secret || generateSecret();
  c1.partnerId = id2;
  c2.partnerId = id1;
  c1.secret = secret;
  c2.secret = secret;

  send(c1.ws, { type: 'paired', partnerId: id2, secret });
  send(c2.ws, { type: 'paired', partnerId: id1, secret });
}

function getUnpairedLaptopsInGroup(ip: string, excludeId?: string): string[] {
  const group = ipGroups.get(ip);
  if (!group) return [];
  return [...group].filter(id => {
    if (id === excludeId) return false;
    const c = clients.get(id);
    return c && c.role === 'laptop' && !c.partnerId;
  });
}

function getUnpairedPhonesInGroup(ip: string, excludeId?: string): string[] {
  const group = ipGroups.get(ip);
  if (!group) return [];
  return [...group].filter(id => {
    if (id === excludeId) return false;
    const c = clients.get(id);
    return c && c.role === 'phone' && !c.partnerId;
  });
}

function handleRegister(clientId: string, ws: WebSocket, role: 'phone' | 'laptop', publicIp: string, secret?: string, colorway?: ColorPayload) {
  const record: ClientRecord = {
    ws,
    role,
    publicIp,
    secret,
    colorway,
    streaming: false,
  };
  clients.set(clientId, record);

  // Add to IP group
  if (!ipGroups.has(publicIp)) {
    ipGroups.set(publicIp, new Set());
  }
  ipGroups.get(publicIp)!.add(clientId);

  send(ws, { type: 'registered', clientId });
  console.log(`[relay] REGISTER ${role} id=${clientId.slice(0,8)} ip=${publicIp} secret=${secret || 'none'} clients=${clients.size} ipGroup=${ipGroups.get(publicIp)?.size || 0}`);

  // Secret-based auto-pair: find another client with same secret
  if (secret) {
    for (const [otherId, other] of clients) {
      if (otherId !== clientId && other.secret === secret && !other.partnerId && other.role !== role) {
        pairClients(clientId, otherId);
        return;
      }
    }
  }

  // IP-based pairing
  if (role === 'phone') {
    let laptops = getUnpairedLaptopsInGroup(publicIp, clientId);
    console.log(`[relay] phone: found ${laptops.length} unpaired laptop(s) in IP group ${publicIp}`);

    // Phone takeover: if no unpaired laptops, evict stale phones from the same IP
    // that are hogging a laptop (e.g. Chrome PWA backgrounded but WS still open).
    // Most-recent phone wins — mirrors desktop leader election behavior.
    if (laptops.length === 0) {
      const group = ipGroups.get(publicIp);
      if (group) {
        for (const otherId of group) {
          if (otherId === clientId) continue;
          const other = clients.get(otherId);
          if (other && other.role === 'phone' && other.partnerId) {
            console.log(`[relay] phone takeover: evicting phone ${otherId.slice(0,8)} to free laptop ${other.partnerId.slice(0,8)}`);
            const laptop = clients.get(other.partnerId);
            if (laptop) {
              laptop.partnerId = undefined;
              send(laptop.ws, { type: 'unpaired', reason: 'phone-takeover' });
            }
            other.partnerId = undefined;
            send(other.ws, { type: 'unpaired', reason: 'phone-takeover' });
            break;
          }
        }
        // Re-check after eviction
        laptops = getUnpairedLaptopsInGroup(publicIp, clientId);
      }
    }

    if (laptops.length === 0) {
      send(ws, { type: 'no-candidates' });
    } else if (laptops.length === 1) {
      // Auto-pair: one phone + one laptop on same network
      pairClients(clientId, laptops[0]);
    } else {
      // Multiple laptops — send candidates
      const candidateList = laptops.map(id => ({
        id,
        colorway: clients.get(id)?.colorway,
      }));
      send(ws, { type: 'candidates', laptops: candidateList });
    }
  } else {
    // Laptop registering — check for waiting phones
    const phones = getUnpairedPhonesInGroup(publicIp, clientId);
    for (const phoneId of phones) {
      const phone = clients.get(phoneId);
      if (!phone) continue;

      // Re-evaluate pairing for this phone
      const allLaptops = getUnpairedLaptopsInGroup(publicIp, phoneId);
      if (allLaptops.length === 1) {
        pairClients(phoneId, allLaptops[0]);
      } else if (allLaptops.length > 1) {
        const candidateList = allLaptops.map(id => ({
          id,
          colorway: clients.get(id)?.colorway,
        }));
        send(phone.ws, { type: 'candidates', laptops: candidateList });
      }
    }
  }
}

function handlePairRequest(clientId: string, targetId: string) {
  const client = clients.get(clientId);
  const target = clients.get(targetId);
  if (!client || !target) return;
  if (target.partnerId) return; // Target already paired
  pairClients(clientId, targetId);
}

function handleColorUpdate(clientId: string, colors: ColorPayload) {
  const client = clients.get(clientId);
  if (!client || !client.partnerId || !client.streaming) return;

  const partner = clients.get(client.partnerId);
  if (!partner) return;

  send(partner.ws, { type: 'color-update', colors });
}

function handleStreamStart(clientId: string, side: 'text' | 'background') {
  const client = clients.get(clientId);
  if (!client || !client.partnerId) return;

  client.streaming = true;

  const partner = clients.get(client.partnerId);
  if (!partner) return;

  send(partner.ws, { type: 'stream-start', side });
}

function handleStreamState(clientId: string, alpha: { side: 'text' | 'background' }, beta: { side: 'text' | 'background' } | null) {
  const client = clients.get(clientId);
  if (!client || !client.partnerId) return;

  const partner = clients.get(client.partnerId);
  if (!partner) return;

  send(partner.ws, { type: 'stream-state', alpha, beta });
}

function handleStreamStop(clientId: string) {
  const client = clients.get(clientId);
  if (!client) return;

  client.streaming = false;

  if (client.partnerId) {
    const partner = clients.get(client.partnerId);
    if (partner) {
      send(partner.ws, { type: 'stream-stop' });
    }
  }
}

function handleDisconnect(clientId: string) {
  const client = clients.get(clientId);
  if (!client) return;

  const publicIp = client.publicIp;
  const partnerId = client.partnerId;

  // Notify partner
  if (partnerId) {
    const partner = clients.get(partnerId);
    if (partner) {
      partner.partnerId = undefined;
      send(partner.ws, { type: 'unpaired', reason: 'partner-disconnected' });
    }
  }

  // Remove from IP group
  const group = ipGroups.get(publicIp);
  if (group) {
    group.delete(clientId);
    if (group.size === 0) {
      ipGroups.delete(publicIp);
    }
  }

  clients.delete(clientId);

  // Re-evaluate pairing for remaining unpaired clients in the same IP group.
  // Handles cross-browser switching: e.g. phone Chrome disconnects, phone Safari
  // was waiting with no-candidates — now the laptop is free and Safari can pair.
  if (partnerId) {
    const partner = clients.get(partnerId);
    if (partner && !partner.partnerId) {
      if (partner.role === 'laptop') {
        // A phone disconnected — check if other unpaired phones can now pair
        const phones = getUnpairedPhonesInGroup(publicIp);
        for (const phoneId of phones) {
          const phone = clients.get(phoneId);
          if (!phone) continue;
          const laptops = getUnpairedLaptopsInGroup(publicIp, phoneId);
          if (laptops.length === 0) {
            send(phone.ws, { type: 'no-candidates' });
          } else if (laptops.length === 1) {
            pairClients(phoneId, laptops[0]);
          } else {
            const candidateList = laptops.map(id => ({
              id,
              colorway: clients.get(id)?.colorway,
            }));
            send(phone.ws, { type: 'candidates', laptops: candidateList });
          }
        }
      } else if (partner.role === 'phone') {
        // A laptop disconnected — check if the phone can pair with another laptop
        const laptops = getUnpairedLaptopsInGroup(publicIp, partnerId);
        if (laptops.length === 0) {
          send(partner.ws, { type: 'no-candidates' });
        } else if (laptops.length === 1) {
          pairClients(partnerId, laptops[0]);
        } else {
          const candidateList = laptops.map(id => ({
            id,
            colorway: clients.get(id)?.colorway,
          }));
          send(partner.ws, { type: 'candidates', laptops: candidateList });
        }
      }
    }
  }
}

const PING_INTERVAL = 30_000;  // Send ping every 30s
const PONG_TIMEOUT = 10_000;   // Close if no pong within 10s

export function handleConnection(ws: WebSocket, publicIp: string) {
  const clientId = randomUUID();
  let registered = false;
  let alive = true;
  console.log(`[relay] WS CONNECTED id=${clientId.slice(0,8)} socketIp=${publicIp}`);

  // Keep-alive: ping every 30s, close if no pong within 10s
  const pingInterval = setInterval(() => {
    if (!alive) {
      console.log(`[relay] PING TIMEOUT id=${clientId.slice(0,8)}`);
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, PING_INTERVAL);

  ws.on('pong', () => { alive = true; });

  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'register':
        if (registered) return;
        registered = true;
        handleRegister(clientId, ws, msg.role, msg.publicIp || publicIp, msg.secret, msg.colorway);
        break;

      case 'pair-request':
        handlePairRequest(clientId, msg.targetId);
        break;

      case 'color-update':
        handleColorUpdate(clientId, msg.colors);
        break;

      case 'stream-start':
        handleStreamStart(clientId, msg.side);
        break;

      case 'stream-stop':
        handleStreamStop(clientId);
        break;

      case 'stream-state':
        handleStreamState(clientId, msg.alpha, msg.beta);
        break;

      case 'save-preset': {
        const sc = clients.get(clientId);
        if (sc?.partnerId) {
          const partner = clients.get(sc.partnerId);
          if (partner) send(partner.ws, { type: 'save-preset' });
        }
        break;
      }
    }
  });

  ws.on('close', () => { clearInterval(pingInterval); console.log(`[relay] DISCONNECTED id=${clientId.slice(0,8)}`); handleDisconnect(clientId); });
  ws.on('error', (err) => { clearInterval(pingInterval); console.log(`[relay] ERROR id=${clientId.slice(0,8)} ${err.message}`); handleDisconnect(clientId); });
}
