import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initStorage, isElectron } from '@shared/storage'

// Initialize storage before rendering (critical for Electron mode)
const startApp = async () => {
  if (isElectron()) {
    await initStorage();
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

startApp();
