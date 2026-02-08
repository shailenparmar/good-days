import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

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
