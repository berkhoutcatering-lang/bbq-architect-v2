// Simpele in-memory sliding-window rate limiter.
// Per-user (of per-IP bij anon) + global hard cap om 1 defecte client te
// isoleren. Draait in Next.js runtime geheugen — bij multi-instance deployment
// heeft elke instance zijn eigen teller. Voor nu prima; bij horizontal scaling
// kan dit migreren naar Redis of Supabase edge functions.

interface Window {
  timestamps: number[];
}

const buckets: Map<string, Window> = new Map();

// Periodieke cleanup om memory-leak te voorkomen. Elke 5 min oude keys weg.
let cleanupTimer: NodeJS.Timeout | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - 2 * 60_000;
    buckets.forEach((w, k) => {
      w.timestamps = w.timestamps.filter((t) => t > cutoff);
      if (w.timestamps.length === 0) buckets.delete(k);
    });
  }, 5 * 60_000);
  // Voorkom dat de timer de Node-process open houdt bij shutdown.
  if (cleanupTimer.unref) cleanupTimer.unref();
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Check of een request binnen het quotum valt.
 * @param key stabiele identifier (user_id of IP)
 * @param maxPerMinute aantal toegestane requests per 60s-window
 */
export function checkRateLimit(key: string, maxPerMinute: number): RateLimitResult {
  ensureCleanup();
  const now = Date.now();
  const windowStart = now - 60_000;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  // Hou alleen timestamps binnen het huidige 60s-venster.
  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);

  if (bucket.timestamps.length >= maxPerMinute) {
    const oldest = bucket.timestamps[0];
    const resetInSeconds = Math.max(1, Math.ceil((oldest + 60_000 - now) / 1000));
    return { allowed: false, remaining: 0, resetInSeconds };
  }

  bucket.timestamps.push(now);
  return {
    allowed: true,
    remaining: maxPerMinute - bucket.timestamps.length,
    resetInSeconds: 60,
  };
}
