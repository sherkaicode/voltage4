"use client";

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!('serviceWorker' in navigator)) return;

    // Only register in production builds (next-pwa is disabled in development by config)
    if (process.env.NODE_ENV !== 'production') return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/service-worker.js');
        // eslint-disable-next-line no-console
        console.log('Service worker registered:', reg);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Service worker registration failed:', err);
      }
    };

    register();
  }, []);

  return null;
}
