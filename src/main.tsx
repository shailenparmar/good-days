import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Check mobile FIRST, before loading heavy imports
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

if (isMobile) {
  // Render simple mobile screen without loading the full app
  createRoot(document.getElementById('root')!).render(
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      padding: '32px',
      backgroundColor: 'hsl(84, 100%, 94%)',
    }}>
      <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>good</p>
      <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>days</p>
      <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>is</p>
      <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>not</p>
      <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>supported</p>
      <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>on</p>
      <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>mobile</p>
      <p style={{ color: 'hsl(144, 36%, 43%)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '20px', margin: '4px 0' }}>yet</p>
    </div>
  );
} else {
  // Load full app only on desktop
  import('./App.tsx').then(({ default: App }) => {
    import('@shared/storage').then(({ initStorage, isElectron }) => {
      const startApp = async () => {
        if (isElectron()) {
          await initStorage();
        }
        createRoot(document.getElementById('root')!).render(
          <StrictMode>
            <App />
          </StrictMode>,
        );
      };
      startApp();
    });
  });
}
