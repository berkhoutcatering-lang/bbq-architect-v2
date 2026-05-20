// ─── Push Notifications & Service Worker Registration ────────────────────────
// Utility for registering the SW, requesting notification permission,
// and showing local notifications for prep tasks and event alerts.

let swRegistration: ServiceWorkerRegistration | null = null;
let reloadInFlight = false;

/* Periodieke update-check zodat lang-open tabs (een tablet die overnacht aan
   blijft staan in de keuken) ook een nieuwe deploy oppakken. */
const UPDATE_CHECK_INTERVAL_MS = 60_000;

/**
 * Register the service worker and store the registration for later use.
 * Call this once on app startup (e.g. in layout or a top-level effect).
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    swRegistration = registration;

    /* Update-flow: zodra een nieuwe SW is geïnstalleerd náást een actieve
       controller (= een upgrade, geen first-install), vraag de nieuwe SW om
       direct over te nemen via SKIP_WAITING. De activate-stap in sw.js doet
       clients.claim() — dat triggert hieronder een controllerchange event
       waarop we de pagina herladen zodat de gebruiker de nieuwe JS-bundle
       krijgt. Zonder deze flow blijft de oude bundle actief tot de gebruiker
       handmatig de service worker unregistert. */
    registration.addEventListener('updatefound', function () {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', function () {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    /* Controllerchange vuurt zodra de nieuwe SW de controle overneemt
       (clients.claim() in sw.js activate-handler). Reload één keer — guard
       voorkomt loops als het event om een of andere reden meerdere keren
       vuurt. useFormAutosave is in /klanten en /facturen al actief, dus
       form-data overleeft de reload in de meeste flows. */
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloadInFlight) return;
      reloadInFlight = true;
      window.location.reload();
    });

    /* Forceer een update-check elke 60s zodat tabs die uren of dagen open
       staan (Lars in de foodtruck-modus) toch deploys oppakken. update() doet
       een no-cache fetch van /sw.js — als de byte-inhoud verschilt installeert
       de browser de nieuwe SW. CACHE_VERSION wordt per build geinjecteerd
       via scripts/inject-sw-version.mjs zodat sw.js elke deploy verandert. */
    if (typeof window !== 'undefined') {
      setInterval(function () {
        registration.update().catch(function () { /* network hiccup, skip */ });
      }, UPDATE_CHECK_INTERVAL_MS);
    }

    return registration;
  } catch (error) {
    console.error('[PWA] Service Worker registratie mislukt:', error);
    return null;
  }
}

/**
 * Get the current SW registration, or register if not yet done.
 */
export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistration) return swRegistration;
  return registerServiceWorker();
}

/**
 * Request notification permission from the user.
 * Returns the permission state: 'granted', 'denied', or 'default'.
 */
export async function requestPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Check if notifications are currently permitted.
 */
export function isNotificationPermitted(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  return Notification.permission === 'granted';
}

// ─── Local notification helpers ──────────────────────────────────────────────

interface PrepTaskNotificationOptions {
  taskName: string;
  eventName: string;
  dueTime?: string;
  url?: string;
}

/**
 * Show a local notification for a prep task reminder.
 * These are triggered client-side, not from a push server.
 */
export async function showPrepTaskReminder(options: PrepTaskNotificationOptions): Promise<void> {
  const registration = await getRegistration();
  if (!registration || Notification.permission !== 'granted') return;

  const timeLabel = options.dueTime ? ' om ' + options.dueTime : '';

  await registration.showNotification('Prep herinnering', {
    body: options.taskName + ' voor ' + options.eventName + timeLabel,
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag: 'prep-' + Date.now(),
    vibrate: [200, 100, 200],
    data: {
      url: options.url || '/haccp',
    },
    actions: [
      { action: 'view', title: 'Bekijken' },
    ],
  } as NotificationOptions);
}

interface EventAlertOptions {
  eventName: string;
  message: string;
  eventDate?: string;
  url?: string;
  urgency?: 'info' | 'warning' | 'critical';
}

/**
 * Show a local notification for an event alert (e.g. event tomorrow, temp issue).
 */
export async function showEventAlert(options: EventAlertOptions): Promise<void> {
  const registration = await getRegistration();
  if (!registration || Notification.permission !== 'granted') return;

  const dateLabel = options.eventDate ? ' (' + options.eventDate + ')' : '';

  await registration.showNotification(options.eventName + dateLabel, {
    body: options.message,
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag: 'event-alert-' + Date.now(),
    vibrate: options.urgency === 'critical' ? [300, 100, 300, 100, 300] : [200, 100, 200],
    data: {
      url: options.url || '/events',
    },
    actions: [
      { action: 'view', title: 'Bekijken' },
    ],
  } as NotificationOptions);
}

/**
 * Show a generic BBQ Architect notification.
 */
export async function showNotification(title: string, body: string, url?: string): Promise<void> {
  const registration = await getRegistration();
  if (!registration || Notification.permission !== 'granted') return;

  await registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag: 'bbq-' + Date.now(),
    vibrate: [200, 100, 200],
    data: { url: url || '/' },
  } as NotificationOptions);
}

/**
 * Send a message to the active service worker.
 */
export async function sendMessageToSW(message: Record<string, unknown>): Promise<void> {
  const registration = await getRegistration();
  if (!registration || !registration.active) return;
  registration.active.postMessage(message);
}

/**
 * Listen for messages from the service worker.
 */
export function onSWMessage(callback: (data: Record<string, unknown>) => void): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return function () {};
  }

  function handler(event: MessageEvent) {
    callback(event.data);
  }

  navigator.serviceWorker.addEventListener('message', handler);
  return function () {
    navigator.serviceWorker.removeEventListener('message', handler);
  };
}
