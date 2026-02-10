import { randomUUID } from 'crypto';
import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, ClientRecord, ColorPayload } from './types.js';

const clients = new Map<string, ClientRecord>();
const ipGroups = new Map<string, Set<string>>();

// deviceId → clientId: tracks the active connection per device for same-device dedup
const deviceConnections = new Map<string, string>();

// 3-digit pairing code → clientId: for cross-network code-based pairing
const pairingCodes = new Map<string, string>();

function assignPairingCode(clientId: string, deviceId: string): string {
  // Derive a 3-digit code from deviceId hash, increment+wrap if taken
  let code = parseInt(deviceId.slice(0, 6), 16) % 1000;
  for (let i = 0; i < 1000; i++) {
    const padded = String(code).padStart(3, '0');
    const existing = pairingCodes.get(padded);
    if (!existing || existing === clientId) {
      pairingCodes.set(padded, clientId);
      return padded;
    }
    code = (code + 1) % 1000;
  }
  // Fallback (all 1000 taken — extremely unlikely)
  const fallback = String(code).padStart(3, '0');
  pairingCodes.set(fallback, clientId);
  return fallback;
}

function releasePairingCode(clientId: string) {
  for (const [code, id] of pairingCodes) {
    if (id === clientId) {
      pairingCodes.delete(code);
      return;
    }
  }
}

// Phones currently on the "enter code" screen (cross-IP pairing fallback)
const phonesInCodeEntry = new Set<string>();

function phoneEnterCodeEntry(phoneId: string) {
  if (!phonesInCodeEntry.has(phoneId)) {
    phonesInCodeEntry.add(phoneId);
    broadcastCodeVisibility();
  }
}

function phoneLeaveCodeEntry(phoneId: string) {
  if (phonesInCodeEntry.has(phoneId)) {
    phonesInCodeEntry.delete(phoneId);
    broadcastCodeVisibility();
  }
}

function broadcastCodeVisibility() {
  const visible = phonesInCodeEntry.size > 0;
  for (const [, client] of clients) {
    if (client.role === 'laptop') {
      send(client.ws, { type: 'code-visible', visible });
    }
  }
}

// Handoff grace period: when a paired laptop disconnects, delay unpairing
// the phone so a new laptop tab/browser can claim it seamlessly.
const handoffTimers = new Map<string, ReturnType<typeof setTimeout>>();
const HANDOFF_GRACE_MS = 3000;

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function pairClients(id1: string, id2: string) {
  const c1 = clients.get(id1);
  const c2 = clients.get(id2);
  if (!c1 || !c2) return;

  c1.partnerId = id2;
  c2.partnerId = id1;

  // Phone leaving code-entry (if it was in it)
  phoneLeaveCodeEntry(id1);
  phoneLeaveCodeEntry(id2);

  console.log(`[relay] PAIRED ${c1.role}(${id1.slice(0,8)}) <-> ${c2.role}(${id2.slice(0,8)})`);

  send(c1.ws, { type: 'paired', partnerId: id2 });
  send(c2.ws, { type: 'paired', partnerId: id1 });
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

function replayStreamToLaptop(phoneId: string, laptopId: string) {
  const phone = clients.get(phoneId);
  const laptop = clients.get(laptopId);
  if (!phone || !laptop || !phone.streaming) return;

  console.log(`[relay] replaying stream state from phone ${phoneId.slice(0,8)} to laptop ${laptopId.slice(0,8)}`);

  if (phone.lastStreamSide) {
    send(laptop.ws, { type: 'stream-start', side: phone.lastStreamSide });
  }
  if (phone.lastStreamState) {
    send(laptop.ws, { type: 'stream-state', alpha: phone.lastStreamState.alpha, beta: phone.lastStreamState.beta });
  }
  if (phone.lastColors) {
    send(laptop.ws, { type: 'color-update', colors: phone.lastColors });
  }
}

function buildCandidatesList(laptopIds: string[]): Array<{ id: string; connectedAgo: number }> {
  const now = Date.now();
  return laptopIds.map(id => {
    const c = clients.get(id);
    return { id, connectedAgo: c ? Math.floor((now - c.connectedAt) / 1000) : 0 };
  });
}

// Notify all unpaired phones on an IP about the current desktop state
function notifyWatchingPhones(ip: string) {
  const phones = getUnpairedPhonesInGroup(ip);
  for (const phoneId of phones) {
    const phone = clients.get(phoneId);
    if (!phone) continue;

    const laptops = getUnpairedLaptopsInGroup(ip, phoneId);
    if (laptops.length === 0) {
      send(phone.ws, { type: 'enter-code' });
      phoneEnterCodeEntry(phoneId);
    } else if (laptops.length === 1) {
      // Auto-pair
      pairClients(phoneId, laptops[0]);
    } else {
      phoneLeaveCodeEntry(phoneId);
      send(phone.ws, { type: 'candidates', laptops: buildCandidatesList(laptops) });
    }
  }
}

function handleRegister(clientId: string, ws: WebSocket, role: 'phone' | 'laptop', publicIp: string, deviceId?: string) {
  // Track pending re-pair phone ID (set during same-device dedup, used after registration)
  let rePairPhoneId: string | undefined;

  // Same-device dedup: if this deviceId already has a connection, close old one atomically
  if (deviceId && deviceConnections.has(deviceId)) {
    const oldClientId = deviceConnections.get(deviceId)!;
    const oldClient = clients.get(oldClientId);
    if (oldClient) {
      console.log(`[relay] same-device dedup: replacing ${oldClientId.slice(0,8)} with ${clientId.slice(0,8)} for device ${deviceId.slice(0,8)}`);

      // If old client was paired, unpair cleanly (but don't notify phone yet for laptops)
      if (oldClient.partnerId) {
        const partner = clients.get(oldClient.partnerId);
        if (partner) {
          partner.partnerId = undefined;
          // Don't send unpaired to phone — the new laptop will re-pair atomically
        }
      }

      // Cancel any handoff timer for the old client's partner
      if (oldClient.partnerId && handoffTimers.has(oldClient.partnerId)) {
        clearTimeout(handoffTimers.get(oldClient.partnerId)!);
        handoffTimers.delete(oldClient.partnerId);
      }

      // Remove from IP group
      const oldGroup = ipGroups.get(oldClient.publicIp);
      if (oldGroup) {
        oldGroup.delete(oldClientId);
        if (oldGroup.size === 0) ipGroups.delete(oldClient.publicIp);
      }

      // Release old client's pairing code
      releasePairingCode(oldClientId);

      // Close old WS with superseded code
      oldClient.ws.close(4001, 'superseded');
      const oldPartnerId = oldClient.partnerId;
      clients.delete(oldClientId);

      // Save phone ID for synchronous re-pair after registration
      if (role === 'laptop' && oldPartnerId) {
        const phone = clients.get(oldPartnerId);
        if (phone && !phone.partnerId) {
          rePairPhoneId = oldPartnerId;
        }
      }
    }
  }

  const record: ClientRecord = {
    ws,
    role,
    publicIp,
    streaming: false,
    deviceId,
    connectedAt: Date.now(),
  };
  clients.set(clientId, record);

  // Track device → client mapping
  if (deviceId) {
    deviceConnections.set(deviceId, clientId);
  }

  // Add to IP group
  if (!ipGroups.has(publicIp)) {
    ipGroups.set(publicIp, new Set());
  }
  ipGroups.get(publicIp)!.add(clientId);

  if (role === 'laptop') {
    // Assign a 3-digit pairing code
    const code = deviceId ? assignPairingCode(clientId, deviceId) : undefined;
    if (code) record.pairingCode = code;

    send(ws, { type: 'registered', clientId, pairingCode: code });
    // Send initial code-visible state if phones are already in code-entry
    if (phonesInCodeEntry.size > 0) {
      send(ws, { type: 'code-visible', visible: true });
    }
    console.log(`[relay] REGISTER laptop id=${clientId.slice(0,8)} ip=${publicIp} deviceId=${deviceId?.slice(0,8) || 'none'} code=${code || 'none'} clients=${clients.size}`);

    // Synchronous re-pair: if dedup found a phone that was paired with the old tab,
    // pair it with this new tab immediately (no setTimeout race)
    if (rePairPhoneId) {
      const phoneNow = clients.get(rePairPhoneId);
      if (phoneNow && !record.partnerId && !phoneNow.partnerId) {
        pairClients(clientId, rePairPhoneId);
        if (phoneNow.streaming) {
          replayStreamToLaptop(rePairPhoneId, clientId);
        }
      }
    }

    // Check for unpaired phones waiting on same IP — re-evaluate pairing
    const phones = getUnpairedPhonesInGroup(publicIp, clientId);
    if (phones.length > 0) {
      notifyWatchingPhones(publicIp);
    }
  } else {
    // Phone registering
    send(ws, { type: 'registered', clientId });
    console.log(`[relay] REGISTER phone id=${clientId.slice(0,8)} ip=${publicIp} deviceId=${deviceId?.slice(0,8) || 'none'} clients=${clients.size}`);

    const laptops = getUnpairedLaptopsInGroup(publicIp, clientId);
    console.log(`[relay] phone: found ${laptops.length} unpaired laptop(s) in IP group ${publicIp}`);

    if (laptops.length === 0) {
      // Phone takeover: if no unpaired laptops, evict stale phones from the same IP
      const group = ipGroups.get(publicIp);
      if (group) {
        for (const otherId of group) {
          if (otherId === clientId) continue;
          const other = clients.get(otherId);
          if (other && other.role === 'phone' && other.partnerId) {
            const freedLaptopId = other.partnerId;
            console.log(`[relay] phone takeover: evicting phone ${otherId.slice(0,8)} to free laptop ${freedLaptopId.slice(0,8)}`);
            const laptop = clients.get(freedLaptopId);
            if (laptop) {
              laptop.partnerId = undefined;
              send(laptop.ws, { type: 'unpaired', reason: 'phone-takeover' });
            }
            other.partnerId = undefined;
            send(other.ws, { type: 'unpaired', reason: 'phone-takeover' });

            if (handoffTimers.has(otherId)) {
              clearTimeout(handoffTimers.get(otherId)!);
              handoffTimers.delete(otherId);
            }
            if (handoffTimers.has(freedLaptopId)) {
              clearTimeout(handoffTimers.get(freedLaptopId)!);
              handoffTimers.delete(freedLaptopId);
            }

            if (laptop && !laptop.partnerId) {
              pairClients(clientId, freedLaptopId);
              return;
            }
            break;
          }
        }
      }

      // Re-check after eviction
      const laptopsAfter = getUnpairedLaptopsInGroup(publicIp, clientId);
      if (laptopsAfter.length === 0) {
        send(ws, { type: 'enter-code' });
        phoneEnterCodeEntry(clientId);
      } else if (laptopsAfter.length === 1) {
        pairClients(clientId, laptopsAfter[0]);
      } else {
        send(ws, { type: 'candidates', laptops: buildCandidatesList(laptopsAfter) });
      }
    } else if (laptops.length === 1) {
      pairClients(clientId, laptops[0]);
    } else {
      send(ws, { type: 'candidates', laptops: buildCandidatesList(laptops) });
    }
  }
}

function handlePairByCode(clientId: string, code: string) {
  const client = clients.get(clientId);
  if (!client || client.role !== 'phone') {
    console.log(`[relay] pair-by-code: rejected (client ${clientId.slice(0,8)} not found or not phone)`);
    return;
  }

  const laptopId = pairingCodes.get(code);
  if (!laptopId) {
    console.log(`[relay] pair-by-code: code "${code}" not found (${pairingCodes.size} codes in map)`);
    // Send enter-code back so phone knows the attempt failed
    send(client.ws, { type: 'enter-code' });
    return;
  }

  const laptop = clients.get(laptopId);
  if (!laptop) {
    console.log(`[relay] pair-by-code: laptop ${laptopId.slice(0,8)} for code "${code}" no longer connected`);
    pairingCodes.delete(code);
    send(client.ws, { type: 'enter-code' });
    return;
  }

  if (laptop.partnerId) {
    console.log(`[relay] pair-by-code: laptop ${laptopId.slice(0,8)} already paired with ${laptop.partnerId.slice(0,8)}`);
    send(client.ws, { type: 'enter-code' });
    return;
  }

  console.log(`[relay] pair-by-code: pairing phone ${clientId.slice(0,8)} with laptop ${laptopId.slice(0,8)} via code "${code}"`);
  pairClients(clientId, laptopId);
}

function handlePairRequest(clientId: string, targetId: string) {
  const client = clients.get(clientId);
  const target = clients.get(targetId);
  if (!client || !target) return;
  if (target.partnerId) return;
  pairClients(clientId, targetId);
}

function handleColorUpdate(clientId: string, colors: ColorPayload) {
  const client = clients.get(clientId);
  if (!client || !client.streaming) return;

  // Always snapshot latest colors (even during grace period with no partner)
  client.lastColors = colors;

  if (!client.partnerId) return;
  const partner = clients.get(client.partnerId);
  if (!partner) return;

  send(partner.ws, { type: 'color-update', colors });
}

function handleStreamStart(clientId: string, side: 'text' | 'background') {
  const client = clients.get(clientId);
  if (!client || !client.partnerId) return;

  client.streaming = true;
  client.lastStreamSide = side;

  const partner = clients.get(client.partnerId);
  if (!partner) return;

  send(partner.ws, { type: 'stream-start', side });
}

function handleStreamState(clientId: string, alpha: { side: 'text' | 'background' }, beta: { side: 'text' | 'background' } | null) {
  const client = clients.get(clientId);
  if (!client) return;

  // Always snapshot (may be in grace period with no partner)
  client.lastStreamState = { alpha, beta };

  if (!client.partnerId) return;
  const partner = clients.get(client.partnerId);
  if (!partner) return;

  send(partner.ws, { type: 'stream-state', alpha, beta });
}

function handleStreamStop(clientId: string) {
  const client = clients.get(clientId);
  if (!client) return;

  client.streaming = false;
  client.lastColors = undefined;
  client.lastStreamSide = undefined;
  client.lastStreamState = undefined;

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

  // Cancel any handoff timer keyed to this client
  if (handoffTimers.has(clientId)) {
    clearTimeout(handoffTimers.get(clientId)!);
    handoffTimers.delete(clientId);
  }

  if (partnerId) {
    const partner = clients.get(partnerId);
    if (partner) {
      if (client.role === 'laptop' && partner.role === 'phone') {
        // LAPTOP disconnected while paired with a phone.
        // Start a grace period — don't unpair the phone yet.
        partner.partnerId = undefined;

        console.log(`[relay] laptop ${clientId.slice(0,8)} disconnected — starting ${HANDOFF_GRACE_MS}ms handoff grace for phone ${partnerId.slice(0,8)}`);

        const timer = setTimeout(() => {
          handoffTimers.delete(partnerId);
          const phoneNow = clients.get(partnerId);
          if (phoneNow && !phoneNow.partnerId) {
            // Grace expired, no new laptop showed up. Unpair phone.
            phoneNow.lastColors = undefined;
            phoneNow.lastStreamSide = undefined;
            phoneNow.lastStreamState = undefined;
            phoneNow.streaming = false;

            console.log(`[relay] handoff grace expired for phone ${partnerId.slice(0,8)} — sending unpaired`);
            send(phoneNow.ws, { type: 'unpaired', reason: 'partner-disconnected' });

            // Re-evaluate: notify phone about available desktops
            const laptops = getUnpairedLaptopsInGroup(publicIp, partnerId);
            if (laptops.length === 0) {
              send(phoneNow.ws, { type: 'enter-code' });
              phoneEnterCodeEntry(partnerId);
            } else if (laptops.length === 1) {
              pairClients(partnerId, laptops[0]);
            } else {
              send(phoneNow.ws, { type: 'candidates', laptops: buildCandidatesList(laptops) });
            }
          }
        }, HANDOFF_GRACE_MS);

        handoffTimers.set(partnerId, timer);
      } else {
        // Phone disconnected (or any other role combo) — immediate unpair
        partner.partnerId = undefined;
        send(partner.ws, { type: 'unpaired', reason: 'partner-disconnected' });
      }
    }
  }

  // Phone leaving code-entry tracking
  phoneLeaveCodeEntry(clientId);

  // Clean up pairing code
  releasePairingCode(clientId);

  // Clean up device connection tracking
  if (client.deviceId && deviceConnections.get(client.deviceId) === clientId) {
    deviceConnections.delete(client.deviceId);
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

  // Re-evaluate pairing for remaining unpaired clients on this IP.
  // Only for phone disconnect (laptop disconnect uses grace period above).
  if (partnerId && client.role === 'phone') {
    notifyWatchingPhones(publicIp);
  }
}

const PING_INTERVAL = 30_000;  // Send ping every 30s

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
      const preview = data.toString().slice(0, 120);
      console.log(`[relay] MALFORMED JSON id=${clientId.slice(0,8)}: ${preview}`);
      return;
    }

    switch (msg.type) {
      case 'register':
        if (registered) return;
        registered = true;
        handleRegister(clientId, ws, msg.role, publicIp, msg.deviceId);
        break;

      case 'pair-request':
        handlePairRequest(clientId, msg.targetId);
        break;

      case 'pair-by-code':
        handlePairByCode(clientId, msg.code);
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

  let disconnected = false;
  ws.on('close', () => {
    if (disconnected) return;
    disconnected = true;
    clearInterval(pingInterval);
    console.log(`[relay] DISCONNECTED id=${clientId.slice(0,8)}`);
    handleDisconnect(clientId);
  });
  ws.on('error', (err) => {
    if (disconnected) return;
    disconnected = true;
    clearInterval(pingInterval);
    console.log(`[relay] ERROR id=${clientId.slice(0,8)} ${err.message}`);
    handleDisconnect(clientId);
  });
}
