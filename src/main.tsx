import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initStorage, isElectron, getItem, setItem } from '@shared/storage'

// Seed test entries for development
const seedTestEntries = () => {
  const existing = getItem('journalEntries');
  if (existing && JSON.parse(existing).length > 1) return; // Already has data

  const sampleContent = [
    "Today was a good day. Got a lot of work done on the app and feeling productive.",
    "Spent the morning reading and the afternoon coding. Found a tricky bug but eventually fixed it.",
    "Rainy day. Perfect for staying inside and working on side projects. Made good progress.",
    "Had coffee with a friend. Good conversations about life and tech. Feeling inspired.",
    "Quiet day. Did some refactoring and cleaned up the codebase. Small wins add up.",
    "Tried a new recipe for dinner. It turned out pretty well. Also finished a book I've been reading.",
    "Productive morning, lazy afternoon. Balance is important. Watched a documentary in the evening.",
    "Worked on some UI tweaks. The details matter. Also went for a walk to clear my head.",
    "Deep work session today. No distractions. Got into a nice flow state for a few hours.",
    "Planning out next week. Setting intentions helps me stay focused. Excited about upcoming projects.",
    "Learned something new today about React hooks. Always more to discover.",
    "Took a break from screens. Spent time outside. Nature recharges the mind.",
    "Debugging session. Finally found the issue after hours of searching. Relief.",
    "Creative day. Sketched some ideas for new features. Not all will make it but that's okay.",
  ];

  const entries = [];
  const today = new Date();

  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const timestamp = date.getTime();

    entries.push({
      date: dateStr,
      content: sampleContent[i % sampleContent.length],
      startedAt: timestamp,
      lastModified: timestamp + 3600000,
    });
  }

  setItem('journalEntries', JSON.stringify(entries));
};

// Initialize storage before rendering (critical for Electron mode)
const startApp = async () => {
  if (isElectron()) {
    await initStorage();
  }

  seedTestEntries();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

startApp();
