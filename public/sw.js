// Service Worker générique pour Siemens CalcConform PWA
// Met en cache automatiquement tous les fichiers de build

const CACHE_VERSION = 'v2.1.1';
const STATIC_CACHE = `siemens-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `siemens-runtime-${CACHE_VERSION}`;

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Installation...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('📦 Cache statique ouvert');
        // Pré-cacher seulement les ressources essentielles
        return cache.addAll([
          '/',
          '/manifest.json'
        ].map(url => new Request(url, { cache: 'reload' })));
      })
      .then(() => {
        console.log('✅ Service Worker installé');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('❌ Erreur installation:', error);
      })
  );
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker: Activation...');
  
  event.waitUntil(
    Promise.all([
      // Nettoyer les anciens caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!cacheName.includes(CACHE_VERSION)) {
              console.log('🗑️ Suppression ancien cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Prendre le contrôle immédiatement
      self.clients.claim()
    ]).then(() => {
      console.log('✅ Service Worker activé');
    })
  );
});

// Stratégie de cache pour les requêtes
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-HTTP
  if (!request.url.startsWith('http')) {
    return;
  }

  // Ignorer les requêtes vers des domaines externes
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(handleRequest(request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  try {
    // 1. Fichiers statiques de build : Cache First avec mise à jour en arrière-plan
    if (isStaticAsset(pathname)) {
      return await cacheFirstWithBackgroundUpdate(request, STATIC_CACHE);
    }

    // 2. Pages de navigation : Network First avec fallback
    if (request.mode === 'navigate') {
      return await networkFirstWithFallback(request);
    }

    // 3. API et données : Network First
    return await networkFirst(request, RUNTIME_CACHE);

  } catch (error) {
    console.error('❌ Erreur handling request:', error);
    
    // Fallback pour les pages de navigation
    if (request.mode === 'navigate') {
      return await getOfflinePage();
    }
    
    // Pour les autres requêtes, essayer le cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return new Response('Ressource non disponible', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Détecter si c'est un asset statique (générique pour tous les builds)
function isStaticAsset(pathname) {
  // Fichiers de build Expo/Metro
  if (pathname.includes('/_expo/') || 
      pathname.includes('/static/') ||
      pathname.includes('/assets/')) {
    return true;
  }
  
  // Extensions de fichiers statiques
  const staticExtensions = [
    '.js', '.css', '.html', '.json',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
    '.woff', '.woff2', '.ttf', '.eot',
    '.mp3', '.mp4', '.webm'
  ];
  
  return staticExtensions.some(ext => pathname.endsWith(ext));
}

// Stratégie Cache First avec mise à jour en arrière-plan
async function cacheFirstWithBackgroundUpdate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // Retourner immédiatement la version en cache si disponible
  if (cachedResponse) {
    console.log('📦 Cache hit:', request.url);
    
    // Mise à jour en arrière-plan (fire and forget)
    fetch(request).then(networkResponse => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
        console.log('🔄 Cache mis à jour en arrière-plan:', request.url);
      }
    }).catch(() => {
      // Ignorer les erreurs de mise à jour en arrière-plan
    });
    
    return cachedResponse;
  }
  
  // Si pas en cache, essayer le réseau
  console.log('🌐 Cache miss, fetching:', request.url);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
      console.log('💾 Nouveau fichier mis en cache:', request.url);
    }
    return networkResponse;
  } catch (error) {
    console.error('❌ Network error pour asset:', request.url);
    throw error;
  }
}

// Stratégie Network First
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      console.log('📦 Fallback cache pour:', request.url);
      return cachedResponse;
    }
    throw error;
  }
}

// Stratégie Network First avec fallback pour la navigation
async function networkFirstWithFallback(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Mettre en cache la page
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('📦 Navigation offline, trying cache or fallback');
    
    // Essayer le cache d'abord
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback vers la page d'accueil en cache
    const homeResponse = await caches.match('/');
    if (homeResponse) {
      return homeResponse;
    }
    
    // Dernière option : page offline
    return await getOfflinePage();
  }
}

// Page hors ligne
async function getOfflinePage() {
  const offlineHTML = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Siemens CalcConform - Hors ligne</title>
      <style>
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          margin: 0;
          padding: 0;
          background: linear-gradient(135deg, #009999 0%, #007A7A 100%);
          color: white;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          text-align: center;
        }
        .logo {
          font-size: 32px;
          font-weight: bold;
          letter-spacing: 2px;
          margin-bottom: 8px;
        }
        .app-name {
          font-size: 18px;
          font-weight: 500;
          margin-bottom: 40px;
        }
        .offline-icon {
          font-size: 64px;
          margin-bottom: 24px;
          opacity: 0.8;
        }
        .title {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 16px;
        }
        .message {
          font-size: 16px;
          opacity: 0.9;
          line-height: 1.5;
          max-width: 400px;
          margin-bottom: 32px;
        }
        .retry-button {
          background: rgba(255, 255, 255, 0.2);
          border: 2px solid rgba(255, 255, 255, 0.3);
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .retry-button:hover {
          background: rgba(255, 255, 255, 0.3);
          border-color: rgba(255, 255, 255, 0.5);
        }
        .features {
          margin-top: 40px;
          opacity: 0.8;
        }
        .feature {
          margin: 8px 0;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="logo">SIEMENS</div>
      <div class="app-name">CalcConform</div>
      
      <div class="offline-icon">📱</div>
      <div class="title">Mode hors ligne</div>
      <div class="message">
        Vous êtes hors ligne. L'application fonctionne avec vos données sauvegardées localement.
      </div>
      
      <button class="retry-button" onclick="window.location.reload()">
        Réessayer la connexion
      </button>
      
      <div class="features">
        <div class="feature">✅ Vos projets sont accessibles</div>
        <div class="feature">✅ Calculs de conformité disponibles</div>
        <div class="feature">✅ Notes et données sauvegardées</div>
      </div>
      
      <script>
        // Rediriger vers l'accueil après 3 secondes si en ligne
        setTimeout(() => {
          if (navigator.onLine) {
            window.location.href = '/';
          }
        }, 3000);
        
        // Écouter le retour de connexion
        window.addEventListener('online', () => {
          window.location.href = '/';
        });
      </script>
    </body>
    </html>
  `;

  return new Response(offlineHTML, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache'
    }
  });
}

console.log('🚀 Service Worker générique Siemens CalcConform initialisé');