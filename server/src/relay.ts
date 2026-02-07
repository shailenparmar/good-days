import { randomUUID } from 'crypto';
import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, ClientRecord, ColorPayload } from './types.js';

const clients = new Map<string, ClientRecord>();
const ipGroups = new Map<string, Set<string>>();

// Handoff grace period: when a paired laptop disconnects, delay unpairing
// the phone so a new laptop tab/browser can claim it seamlessly.
const handoffTimers = new Map<string, ReturnType<typeof setTimeout>>();
const HANDOFF_GRACE_MS = 3000;

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

  const secret = c1.secret || c2.secret || generateSecret();
  c1.partnerId = id2;
  c2.partnerId = id1;
  c1.secret = secret;
  c2.secret = secret;

  // Only learn affinity (send partnerDeviceId) in unambiguous 1:1 environments.
  // If there's more than 1 phone or 1 laptop on this IP, we can't be sure
  // this pairing is correct, so don't burn a potentially wrong affinity.
  const group = ipGroups.get(c1.publicIp);
  let phones = 0, laptops = 0;
  if (group) {
    for (const id of group) {
      const c = clients.get(id);
      if (c?.role === 'phone') phones++;
      else if (c?.role === 'laptop') laptops++;
    }
  }
  const learnAffinity = phones === 1 && laptops === 1;

  console.log(`[relay] PAIRED ${c1.role}(${id1.slice(0,8)}) <-> ${c2.role}(${id2.slice(0,8)}) affinity=${learnAffinity}`);

  send(c1.ws, { type: 'paired', partnerId: id2, secret, partnerDeviceId: learnAffinity ? c2.deviceId : undefined });
  send(c2.ws, { type: 'paired', partnerId: id1, secret, partnerDeviceId: learnAffinity ? c1.deviceId : undefined });
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

// Pick the laptop that most recently claimed focus (sent claim-laptop).
// Falls back to first laptop if none have claimed.
function pickBestLaptop(laptops: string[]): string {
  let bestId = laptops[0];
  let bestTime = 0;
  for (const id of laptops) {
    const c = clients.get(id);
    if (c?.lastClaimTime && c.lastClaimTime > bestTime) {
      bestTime = c.lastClaimTime;
      bestId = id;
    }
  }
  return bestId;
}

function findAffinityMatch(
  clientId: string,
  role: 'phone' | 'laptop',
  publicIp: string,
  deviceId?: string,
  partnerDeviceId?: string
): string | null {
  if (!deviceId && !partnerDeviceId) return null;

  const group = ipGroups.get(publicIp);
  if (!group) return null;

  const oppositeRole = role === 'phone' ? 'laptop' : 'phone';
  let mutualMatch: string | null = null;
  let oneSidedMatch: string | null = null;

  for (const otherId of group) {
    if (otherId === clientId) continue;
    const other = clients.get(otherId);
    if (!other || other.role !== oppositeRole || other.partnerId) continue;

    const theyClaimUs = other.partnerDeviceId === deviceId;
    const weClaimThem = partnerDeviceId && partnerDeviceId === other.deviceId;

    if (theyClaimUs && weClaimThem) {
      mutualMatch = otherId;
      break;
    }
    if ((theyClaimUs || weClaimThem) && !oneSidedMatch) {
      oneSidedMatch = otherId;
    }
  }

  return mutualMatch || oneSidedMatch;
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

function handleRegister(clientId: string, ws: WebSocket, role: 'phone' | 'laptop', publicIp: string, secret?: string, colorway?: ColorPayload, deviceId?: string, partnerDeviceId?: string) {
  const record: ClientRecord = {
    ws,
    role,
    publicIp,
    secret,
    colorway,
    streaming: false,
    deviceId,
    partnerDeviceId,
  };
  clients.set(clientId, record);

  // Add to IP group
  if (!ipGroups.has(publicIp)) {
    ipGroups.set(publicIp, new Set());
  }
  ipGroups.get(publicIp)!.add(clientId);

  send(ws, { type: 'registered', clientId });
  console.log(`[relay] REGISTER ${role} id=${clientId.slice(0,8)} ip=${publicIp} secret=${secret || 'none'} deviceId=${deviceId?.slice(0,8) || 'none'} clients=${clients.size} ipGroup=${ipGroups.get(publicIp)?.size || 0}`);

  // Secret-based auto-pair: find another client with same secret
  if (secret) {
    for (const [otherId, other] of clients) {
      if (otherId !== clientId && other.secret === secret && !other.partnerId && other.role !== role) {
        // Cancel any handoff grace timer (laptop reconnecting during grace period)
        if (handoffTimers.has(otherId)) {
          clearTimeout(handoffTimers.get(otherId)!);
          handoffTimers.delete(otherId);
          console.log(`[relay] handoff grace cancelled for ${otherId.slice(0,8)} — new laptop ${clientId.slice(0,8)} claimed it`);
        }

        pairClients(clientId, otherId);

        // Replay streaming state if the partner is a streaming phone
        if (other.role === 'phone' && other.streaming) {
          replayStreamToLaptop(otherId, clientId);
        }
        return;
      }
    }
  }

  // Affinity-based auto-pair: match by remembered device IDs
  const affinityMatch = findAffinityMatch(clientId, role, publicIp, record.deviceId, record.partnerDeviceId);
  if (affinityMatch) {
    if (handoffTimers.has(affinityMatch)) {
      clearTimeout(handoffTimers.get(affinityMatch)!);
      handoffTimers.delete(affinityMatch);
      console.log(`[relay] handoff grace cancelled for ${affinityMatch.slice(0,8)} — affinity match`);
    }
    console.log(`[relay] affinity-pairing ${role} ${clientId.slice(0,8)} with ${affinityMatch.slice(0,8)}`);
    pairClients(clientId, affinityMatch);
    const partner = clients.get(affinityMatch);
    if (partner?.role === 'phone' && partner.streaming) {
      replayStreamToLaptop(affinityMatch, clientId);
    }
    return;
  }

  // IP-based pairing
  if (role === 'phone') {
    let laptops = getUnpairedLaptopsInGroup(publicIp, clientId);
    console.log(`[relay] phone: found ${laptops.length} unpaired laptop(s) in IP group ${publicIp}`);

    // Phone takeover: if no unpaired laptops, evict stale phones from the same IP
    // that are hogging a laptop (e.g. Chrome PWA backgrounded but WS still open).
    // Most-recent phone wins — mirrors desktop leader election behavior.
    // Directly pair with the freed laptop (skip candidates even if multiple desktops).
    if (laptops.length === 0) {
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
            // Directly pair with the freed laptop — no candidates screen
            if (laptop && !laptop.partnerId) {
              pairClients(clientId, freedLaptopId);
              return;
            }
            break;
          }
        }
        // Re-check after eviction (only if direct pair didn't happen)
        laptops = getUnpairedLaptopsInGroup(publicIp, clientId);
      }
    }

    if (laptops.length === 0) {
      send(ws, { type: 'no-candidates' });
    } else {
      // Auto-pair with the most recently focused laptop (or the only one)
      const bestLaptop = laptops.length === 1 ? laptops[0] : pickBestLaptop(laptops);
      if (laptops.length > 1) {
        console.log(`[relay] auto-pairing phone with focused laptop ${bestLaptop.slice(0,8)} (${laptops.length} candidates)`);
      }
      pairClients(clientId, bestLaptop);
    }
  } else {
    // Laptop registering — check for waiting phones
    const phones = getUnpairedPhonesInGroup(publicIp, clientId);
    for (const phoneId of phones) {
      const phone = clients.get(phoneId);
      if (!phone) continue;

      // Re-evaluate pairing for this phone
      const allLaptops = getUnpairedLaptopsInGroup(publicIp, phoneId);
      if (allLaptops.length > 0) {
        const bestLaptop = allLaptops.length === 1 ? allLaptops[0] : pickBestLaptop(allLaptops);
        pairClients(phoneId, bestLaptop);
        if (phone.streaming) {
          replayStreamToLaptop(phoneId, bestLaptop);
        }
      }
    }
  }
}

function handleClaimLaptop(clientId: string) {
  const client = clients.get(clientId);
  if (!client || client.role !== 'laptop') return;

  // Always record focus time — used to pick focused browser during phone pairing
  client.lastClaimTime = Date.now();

  if (client.partnerId) return; // Already paired, nothing to claim

  // Cross-browser laptop takeover: steal the phone from another laptop on the same IP.
  // Mirrors the in-browser focus-claim leader election, but works across Chrome/Safari.
  const group = ipGroups.get(client.publicIp);
  if (!group) return;

  for (const otherId of group) {
    if (otherId === clientId) continue;
    const other = clients.get(otherId);
    if (other && other.role === 'laptop' && other.partnerId) {
      const phoneId = other.partnerId;
      const phone = clients.get(phoneId);

      console.log(`[relay] laptop takeover: ${clientId.slice(0,8)} stealing phone ${phoneId.slice(0,8)} from laptop ${otherId.slice(0,8)}`);

      // Unpair old laptop
      other.partnerId = undefined;
      send(other.ws, { type: 'unpaired', reason: 'laptop-takeover' });

      // Pair new laptop with the phone
      if (phone) {
        phone.partnerId = undefined;

        if (handoffTimers.has(phoneId)) {
          clearTimeout(handoffTimers.get(phoneId)!);
          handoffTimers.delete(phoneId);
        }

        pairClients(clientId, phoneId);

        // Replay streaming state to the new laptop
        if (phone.streaming) {
          replayStreamToLaptop(phoneId, clientId);
        }
      }
      break;
    }
  }

  // Also check for phones in handoff grace period (no partnerId, but still streaming).
  // Handles the case where the old laptop already disconnected before claim-laptop arrives
  // (same-browser tab switch where disconnect is faster than new WS handshake).
  if (!client.partnerId) {
    for (const otherId of group) {
      if (otherId === clientId) continue;
      const other = clients.get(otherId);
      if (other && other.role === 'phone' && !other.partnerId && other.secret && other.secret === client.secret) {
        console.log(`[relay] claim-laptop: pairing with grace-period phone ${otherId.slice(0,8)}`);

        if (handoffTimers.has(otherId)) {
          clearTimeout(handoffTimers.get(otherId)!);
          handoffTimers.delete(otherId);
        }

        pairClients(clientId, otherId);

        if (other.streaming) {
          replayStreamToLaptop(otherId, clientId);
        }
        break;
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

  // Cancel any handoff timer keyed to this client (e.g. phone disconnecting during grace)
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
        // A new laptop tab/browser may claim it within HANDOFF_GRACE_MS.
        partner.partnerId = undefined;

        console.log(`[relay] laptop ${clientId.slice(0,8)} disconnected — starting ${HANDOFF_GRACE_MS}ms handoff grace for phone ${partnerId.slice(0,8)}`);

        const timer = setTimeout(() => {
          handoffTimers.delete(partnerId);
          const phoneNow = clients.get(partnerId);
          if (phoneNow && !phoneNow.partnerId) {
            // Grace expired, no new laptop showed up. Unpair phone now.
            console.log(`[relay] handoff grace expired for phone ${partnerId.slice(0,8)} — sending unpaired`);
            send(phoneNow.ws, { type: 'unpaired', reason: 'partner-disconnected' });

            // Re-evaluate: maybe another laptop is available
            const laptops = getUnpairedLaptopsInGroup(publicIp, partnerId);
            if (laptops.length === 0) {
              send(phoneNow.ws, { type: 'no-candidates' });
            } else {
              const bestLaptop = laptops.length === 1 ? laptops[0] : pickBestLaptop(laptops);
              pairClients(partnerId, bestLaptop);
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

  // Remove from IP group
  const group = ipGroups.get(publicIp);
  if (group) {
    group.delete(clientId);
    if (group.size === 0) {
      ipGroups.delete(publicIp);
    }
  }

  clients.delete(clientId);

  // Re-evaluate pairing for remaining unpaired clients.
  // Only for phone disconnect (laptop disconnect uses grace period above).
  if (partnerId && client.role === 'phone') {
    const partner = clients.get(partnerId);
    if (partner && !partner.partnerId && partner.role === 'laptop') {
      const phones = getUnpairedPhonesInGroup(publicIp);
      for (const phoneId of phones) {
        const phone = clients.get(phoneId);
        if (!phone) continue;
        const laptops = getUnpairedLaptopsInGroup(publicIp, phoneId);
        if (laptops.length === 0) {
          send(phone.ws, { type: 'no-candidates' });
        } else {
          const bestLaptop = laptops.length === 1 ? laptops[0] : pickBestLaptop(laptops);
          pairClients(phoneId, bestLaptop);
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
        handleRegister(clientId, ws, msg.role, msg.publicIp || publicIp, msg.secret, msg.colorway, msg.deviceId, msg.partnerDeviceId);
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

      case 'claim-laptop':
        handleClaimLaptop(clientId);
        break;
    }
  });

  ws.on('close', () => { clearInterval(pingInterval); console.log(`[relay] DISCONNECTED id=${clientId.slice(0,8)}`); handleDisconnect(clientId); });
  ws.on('error', (err) => { clearInterval(pingInterval); console.log(`[relay] ERROR id=${clientId.slice(0,8)} ${err.message}`); handleDisconnect(clientId); });
}
