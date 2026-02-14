import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStreamDebugStats, refreshSnapshot } from './streamDebugStats';

export function StreamDebugOverlay() {
  const stats = useStreamDebugStats();
  const [, setTick] = useState(0);
  const intervalRef = useRef(0);

  // 2fps update loop — refreshes the snapshot and forces re-render
  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      refreshSnapshot();
      setTick(t => t + 1);
    }, 500);
    return () => clearInterval(intervalRef.current);
  }, []);

  // Auto-hide: visible when active, or within 2s of stream stop
  const now = performance.now();
  const ended = !stats.isActive && stats.pausedAt > 0;
  const timeSinceStop = ended ? now - stats.pausedAt : 0;
  const visible = stats.isActive || (ended && timeSinceStop < 2000);

  if (!visible) return null;

  const status = stats.isActive ? 'LIVE' : 'ENDED';
  const statusColor = stats.isActive ? '#4f4' : '#f84';

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        background: 'rgba(0, 0, 0, 0.82)',
        color: '#ddd',
        fontFamily: 'ui-monospace, "SF Mono", Monaco, "Cascadia Code", monospace',
        fontSize: 12,
        lineHeight: 1.5,
        padding: '8px 12px',
        borderRadius: 6,
        zIndex: 10000,
        pointerEvents: 'none',
        whiteSpace: 'pre',
      }}
    >
      <span style={{ color: statusColor, fontWeight: 700 }}>{status}</span>
      {' '}
      <span style={{ color: '#999' }}>{stats.duration.toFixed(1)}s</span>
      {'\n'}
      <span style={{ color: '#aaa' }}>msg/s    </span>
      <span style={{ color: '#fff' }}>{stats.msgPerSec}</span>
      {'\n'}
      <span style={{ color: '#aaa' }}>render   </span>
      <span style={{ color: '#fff' }}>{stats.renderFps}</span>
      <span style={{ color: '#666' }}> fps</span>
      {'\n'}
      <span style={{ color: '#aaa' }}>latency  </span>
      <span style={{ color: '#fff' }}>{stats.avgLatency.toFixed(1)}</span>
      <span style={{ color: '#666' }}> ms</span>
      {'\n'}
      <span style={{ color: '#aaa' }}>jitter   </span>
      <span style={{ color: '#fff' }}>{stats.jitter.toFixed(1)}</span>
      <span style={{ color: '#666' }}> ms</span>
      {'\n'}
      <span style={{ color: '#aaa' }}>coalesced </span>
      <span style={{ color: stats.coalesced > 0 ? '#f84' : '#fff' }}>{stats.coalesced}</span>
    </div>,
    document.body
  );
}
