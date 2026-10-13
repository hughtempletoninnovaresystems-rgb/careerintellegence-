'use client';

import { useEffect } from 'react';

export const motionStorageKey = 'career-intelligence:reduce-motion';

export function applyMotionPreference() {
  try {
    document.documentElement.dataset.ciMotion =
      localStorage.getItem(motionStorageKey) === 'true' ? 'reduced' : 'normal';
  } catch {
    // Storage may be unavailable in private browsing; retain OS preference.
  }
}

export default function DashboardMotionPreference() {
  useEffect(() => {
    applyMotionPreference();
    window.addEventListener('career-intelligence:motion-changed', applyMotionPreference);
    return () => window.removeEventListener('career-intelligence:motion-changed', applyMotionPreference);
  }, []);
  return null;
}
