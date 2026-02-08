import { useState, useEffect, useRef } from 'react';
import { getItem, setItem } from '@shared/storage';

export function useStatistics(paused: boolean = false, isLiveStreaming: boolean = false) {
  const [totalKeystrokes, setTotalKeystrokes] = useState(() => {
    const saved = getItem('totalKeystrokes');
    return saved ? Number(saved) : 0;
  });

  const [totalSecondsOnApp, setTotalSecondsOnApp] = useState(() => {
    const saved = getItem('totalSecondsOnApp');
    return saved ? Number(saved) : 0;
  });

  const appSessionStart = useRef<number>(Date.now());
  const baseSecondsRef = useRef<number>(0);

  // Save total keystrokes to storage whenever it changes
  useEffect(() => {
    if ((window as { __resettingApp?: boolean }).__resettingApp) return;
    setItem('totalKeystrokes', String(totalKeystrokes));
  }, [totalKeystrokes]);

  // Save total seconds to storage whenever it changes
  useEffect(() => {
    if ((window as { __resettingApp?: boolean }).__resettingApp) return;
    setItem('totalSecondsOnApp', String(totalSecondsOnApp));
  }, [totalSecondsOnApp]);

  // Track time spent on app (update every second) - paused in superscramble and live streaming
  useEffect(() => {
    const savedSeconds = getItem('totalSecondsOnApp');
    baseSecondsRef.current = savedSeconds ? Number(savedSeconds) : 0;
    appSessionStart.current = Date.now();

    // Don't run interval if paused or live streaming (setState + localStorage every 1s hurts frame budget)
    if (paused || isLiveStreaming) return;

    const interval = setInterval(() => {
      if ((window as { __resettingApp?: boolean }).__resettingApp) return;
      const currentSessionSeconds = Math.floor((Date.now() - appSessionStart.current) / 1000);
      setTotalSecondsOnApp(baseSecondsRef.current + currentSessionSeconds);
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [paused, isLiveStreaming]);

  // Save before app closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      if ((window as { __resettingApp?: boolean }).__resettingApp) return;
      const currentSessionSeconds = Math.floor((Date.now() - appSessionStart.current) / 1000);
      setItem('totalSecondsOnApp', String(baseSecondsRef.current + currentSessionSeconds));
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const incrementKeystrokes = () => {
    setTotalKeystrokes(prev => prev + 1);
  };

  return {
    totalKeystrokes,
    totalSecondsOnApp,
    incrementKeystrokes,
  };
}
