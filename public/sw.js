// ─── BBQ Architect Service Worker ─────────────────────────────────────────────
// Offline support, background sync for HACCP records, push notifications

const CACHE_VERSION = '874997aaafe8';
const STATIC_CACHE = 'bbq-static-' + CACHE_VERSION;
const DYNAMIC_CACHE = 'bbq-dynamic-' + CACHE_VERSION;
const HACCP_STORE = 'haccp-offline-queue';
const OFFLINE_URL = '/offline.html';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/login',
  '/welkom',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

// ─── IndexedDB helpers for HACCP offline queue ───────────────────────────────

function openHaccpDB() {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open('bbq-architect-offline', 1);

    request.onupgradeneeded = function (event) {
      var db = event.target.result;
      if (!db.objectStoreNames.contains('haccp_queue')) {
        db.createObjectStore('haccp_queue', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('haccp_records')) {
        var store = db.createObjectStore('haccp_records', { keyPath: 'localId', autoIncrement: true });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('event_id', 'event_id', { unique: false });
      }
    };

    request.onsuccess = function () {
      resolve(request.result);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

function addToHaccpQueue(record) {
  return openHaccpDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('haccp_queue', 'readwrite');
      var store = tx.objectStore('haccp_queue');
      var request = store.add(record);
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  });
}

function getAllFromHaccpQueue() {
  return openHaccpDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('haccp_queue', 'readonly');
      var store = tx.objectStore('haccp_queue');
      var request = store.getAll();
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  });
}

function clearHaccpQueue() {
  return openHaccpDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('haccp_queue', 'readwrite');
      var store = tx.objectStore('haccp_queue');
      var request = store.clear();
      request.onsuccess = function () { resolve(); };
      request.onerror = function () { reject(request.error); };
    });
  });
}

function removeFromHaccpQueue(id) {
  return openHaccpDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('haccp_queue', 'readwrite');
      var store = tx.objectStore('haccp_queue');
      var request = store.delete(id);
      request.onsuccess = function () { resolve(); };
      request.onerror = function () { reject(request.error); };
    });
  });
}

// ─── Install: Pre-cache static assets ────────────────────────────────────────

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function (cache) {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// ─── Activate: Clean old caches ──────────────────────────────────────────────

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (name) {
            return name !== STATIC_CACHE && name !== DYNAMIC_CACHE;
          })
          .map(function (name) {
            console.log('[SW] Removing old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// ─── Fetch: Cache strategies ─────────────────────────────────────────────────

function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept') && request.headers.get('accept').includes('text/html'));
}

function isApiRequest(request) {
  return request.url.includes('/api/') ||
    request.url.includes('supabase.co') ||
    request.url.includes('/rest/v1/');
}

function isStaticAsset(request) {
  var url = new URL(request.url);
  return url.pathname.match(/\.(js|css|svg|png|jpg|jpeg|webp|woff2?|ttf|ico)$/);
}

self.addEventListener('fetch', function (event) {
  var request = event.request;

  // Skip non-GET requests (POST, PUT, DELETE handled by background sync)
  if (request.method !== 'GET') {
    return;
  }

  // Navigation requests: Network-first with offline fallback
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          // Cache the successful navigation response
          var responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then(function (cache) {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(function () {
          return caches.match(request).then(function (cached) {
            return cached || caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // API requests: Network-first with cache fallback
  if (isApiRequest(request)) {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          // Only cache successful GET API responses
          if (response.ok) {
            var responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then(function (cache) {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match(request).then(function (cached) {
            if (cached) {
              return cached;
            }
            // Return empty JSON response when offline and no cache
            return new Response(JSON.stringify({ data: [], error: 'offline' }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // Static assets: Cache-first with network fallback
  if (isStaticAsset(request)) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) {
          // Return cache immediately, update in background (stale-while-revalidate)
          fetch(request).then(function (response) {
            if (response.ok) {
              caches.open(STATIC_CACHE).then(function (cache) {
                cache.put(request, response);
              });
            }
          }).catch(function () { /* offline, skip update */ });
          return cached;
        }
        // Not in cache, fetch from network
        return fetch(request).then(function (response) {
          if (response.ok) {
            var responseClone = response.clone();
            caches.open(STATIC_CACHE).then(function (cache) {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Default: Network-first
  event.respondWith(
    fetch(request).catch(function () {
      return caches.match(request);
    })
  );
});

// ─── Background Sync: HACCP temperature recordings ───────────────────────────

self.addEventListener('sync', function (event) {
  if (event.tag === 'sync-haccp-records') {
    event.waitUntil(syncHaccpRecords());
  }
});

function syncHaccpRecords() {
  return getAllFromHaccpQueue().then(function (records) {
    if (!records || records.length === 0) {
      return Promise.resolve();
    }

    console.log('[SW] Syncing ' + records.length + ' HACCP records');

    var syncPromises = records.map(function (record) {
      // Build the payload without the queue id
      var payload = Object.assign({}, record);
      delete payload.id;

      return fetch('/api/haccp/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (response) {
        if (response.ok) {
          return removeFromHaccpQueue(record.id);
        }
        throw new Error('Sync failed for record ' + record.id);
      });
    });

    return Promise.all(syncPromises).then(function () {
      // Notify the client that sync is complete
      return self.clients.matchAll().then(function (clients) {
        clients.forEach(function (client) {
          client.postMessage({
            type: 'HACCP_SYNC_COMPLETE',
            count: records.length
          });
        });
      });
    });
  }).catch(function (error) {
    console.error('[SW] HACCP sync error:', error);
  });
}

// ─── Message handler: Queue HACCP records from client ────────────────────────

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'QUEUE_HACCP_RECORD') {
    event.waitUntil(
      addToHaccpQueue(event.data.record).then(function () {
        // Try to trigger background sync
        if (self.registration.sync) {
          return self.registration.sync.register('sync-haccp-records');
        }
      })
    );
  }

  if (event.data && event.data.type === 'GET_QUEUE_STATUS') {
    event.waitUntil(
      getAllFromHaccpQueue().then(function (records) {
        event.source.postMessage({
          type: 'QUEUE_STATUS',
          pendingCount: records ? records.length : 0
        });
      })
    );
  }

  if (event.data && event.data.type === 'FORCE_SYNC') {
    event.waitUntil(syncHaccpRecords());
  }

  // Skip waiting when new version is available
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Push Notifications ──────────────────────────────────────────────────────

self.addEventListener('push', function (event) {
  var data = {
    title: 'BBQ Architect',
    body: 'Je hebt een nieuwe melding',
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag: 'bbq-notification',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      var payload = event.data.json();
      data = Object.assign(data, payload);
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      vibrate: [200, 100, 200],
      data: data.data,
      actions: data.actions || []
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var targetUrl = '/';
  if (event.notification.data && event.notification.data.url) {
    targetUrl = event.notification.data.url;
  }

  // Handle action buttons on notifications
  if (event.action === 'view') {
    targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // Focus existing window if available
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Open new window if none exists
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ─── Periodic background sync (if supported) ────────────────────────────────

self.addEventListener('periodicsync', function (event) {
  if (event.tag === 'sync-haccp-periodic') {
    event.waitUntil(syncHaccpRecords());
  }
});
