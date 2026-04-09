'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/pushNotifications';

/**
 * Invisible component that registers the service worker on mount.
 * Place once in the root layout.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(function () {
    registerServiceWorker();
  }, []);

  return null;
}
