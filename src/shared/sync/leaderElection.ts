const CHANNEL_NAME = 'good-days-ws-leader';
const HEARTBEAT_MS = 3000;
const TIMEOUT_MS = 6000;
const RACE_MS = 100;

type LeaderMessage =
  | { type: 'claim'; tabId: string; timestamp: number }
  | { type: 'heartbeat'; tabId: string }
  | { type: 'release'; tabId: string };

export function createLeaderElection(
  onBecomeLeader: () => void,
  onLoseLeadership: () => void,
) {
  const tabId = Math.random().toString(36).slice(2);
  let isLeader = false;
  let currentLeader: string | null = null;
  let lastHeartbeat = 0;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let watchdogInterval: ReturnType<typeof setInterval> | null = null;
  let channel: BroadcastChannel | null = null;

  function cleanup() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (watchdogInterval) clearInterval(watchdogInterval);
    heartbeatInterval = null;
    watchdogInterval = null;
  }

  function becomeLeader() {
    if (isLeader) return;
    isLeader = true;
    currentLeader = tabId;
    onBecomeLeader();

    // Start heartbeat
    heartbeatInterval = setInterval(() => {
      channel?.postMessage({ type: 'heartbeat', tabId } satisfies LeaderMessage);
    }, HEARTBEAT_MS);
  }

  function loseLeadership() {
    if (!isLeader) return;
    isLeader = false;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    onLoseLeadership();
  }

  function claim() {
    const timestamp = Date.now();
    channel?.postMessage({ type: 'claim', tabId, timestamp } satisfies LeaderMessage);

    // Wait for race window, then check if we won
    setTimeout(() => {
      if (currentLeader === null || currentLeader === tabId) {
        becomeLeader();
      }
    }, RACE_MS);
  }

  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    // BroadcastChannel not supported — become leader immediately
    becomeLeader();
    return { isLeader: () => true, destroy: cleanup };
  }

  channel.onmessage = (e: MessageEvent<LeaderMessage>) => {
    const msg = e.data;

    switch (msg.type) {
      case 'claim':
        if (msg.tabId !== tabId) {
          // Another tab is claiming — if they claimed first (lower timestamp), yield
          if (isLeader && msg.timestamp < lastHeartbeat) {
            loseLeadership();
          }
          currentLeader = msg.tabId;
          lastHeartbeat = Date.now();
        }
        break;

      case 'heartbeat':
        if (msg.tabId !== tabId) {
          currentLeader = msg.tabId;
          lastHeartbeat = Date.now();
          if (isLeader) {
            loseLeadership();
          }
        }
        break;

      case 'release':
        if (msg.tabId === currentLeader) {
          currentLeader = null;
          // Try to claim leadership
          claim();
        }
        break;
    }
  };

  // Watchdog: if no heartbeat from leader in TIMEOUT_MS, try to claim
  watchdogInterval = setInterval(() => {
    if (!isLeader && Date.now() - lastHeartbeat > TIMEOUT_MS) {
      currentLeader = null;
      claim();
    }
  }, TIMEOUT_MS);

  // Visibility change: re-run election when tab becomes visible
  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && !isLeader) {
      if (Date.now() - lastHeartbeat > TIMEOUT_MS) {
        currentLeader = null;
        claim();
      }
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // Release on unload
  const handleUnload = () => {
    if (isLeader) {
      channel?.postMessage({ type: 'release', tabId } satisfies LeaderMessage);
    }
  };
  window.addEventListener('beforeunload', handleUnload);

  // Start by claiming
  claim();

  return {
    isLeader: () => isLeader,
    destroy: () => {
      cleanup();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
      if (isLeader) {
        channel?.postMessage({ type: 'release', tabId } satisfies LeaderMessage);
      }
      channel?.close();
    },
  };
}
