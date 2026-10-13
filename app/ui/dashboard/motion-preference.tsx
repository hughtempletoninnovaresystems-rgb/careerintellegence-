'use client';

import { useEffect } from 'react';

export const motionStorageKey = 'projectgreat:reduce-motion';

export function applyMotionPreference() {
  try {
    document.documentElement.dataset.pgMotion =
      localStorage.getItem(motionStorageKey) === 'true' ? 'reduced' : 'normal';
  } catch {
    // Storage may be unavailable in private browsing; retain OS preference.
  }
}

export default function DashboardMotionPreference() {
  useEffect(() => {
    applyMotionPreference();
    window.addEventListener('projectgreat:motion-changed', applyMotionPreference);
    return () => window.removeEventListener('projectgreat:motion-changed', applyMotionPreference);
  }, []);
  return null;
}
