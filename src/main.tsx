import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { MAINTENANCE, MESSAGE } from '@shared/maintenance'

// Custom SW registration: bypass HTTP cache so Safari always checks for new versions
if ('serviceWorker' in navigator) {
  // Reload when a new SW takes control (after skipWaiting activates it)
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    }).then(registration => {
      // Poll for SW updates every 60s (catches deploys without requiring navigation)
      setInterval(() => registration.update(), 60 * 1000)

      // Check for SW updates when PWA resumes from background
      let hiddenAt = 0
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          hiddenAt = Date.now()
        } else if (document.visibilityState === 'visible' && hiddenAt > 0 && Date.now() - hiddenAt > 3000) {
          hiddenAt = 0
          registration.update()
        }
      })
    })
  })
}

// Maintenance mode: block the entire app with a fullscreen message
if (MAINTENANCE && MESSAGE) {
  const root = document.getElementById('root')!;
  root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;padding:32px;background-color:hsl(250,70%,32%)"><p style="color:hsl(158,64%,42%);font-family:monospace;font-weight:bold;font-size:16px">${MESSAGE}</p></div>`;
} else {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobile) {
    import('./features/mobile/MobileApp').then(({ default: MobileApp }) => {
      createRoot(document.getElementById('root')!).render(<MobileApp />);
    });
  } else {
    import('./App.tsx').then(({ default: App }) => {
      createRoot(document.getElementById('root')!).render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
    });
  }
}
