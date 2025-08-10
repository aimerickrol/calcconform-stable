// Service Worker pour Siemens CalcConform PWA
// Version corrigée pour fonctionner sur tous les navigateurs

const CACHE_NAME = 'siemens-calcconform-v2.1.1';
const STATIC_CACHE_NAME = 'siemens-static-v2.1.1';
const RUNTIME_CACHE_NAME = 'siemens-runtime-v2.1.1';

// Ressources statiques essentielles à mettre en cache
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/web-app-styles.css',
  // Assets images
  '/assets/images/icon1.png',
  '/assets/images/Siemens-Logo.png',
  '/assets/images/siemens-header-logo.png'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Installation...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('📦 Mise en cache des ressources statiques');
        // Ajouter les ressources une par une pour éviter les erreurs
        return Promise.allSettled(
          STATIC_ASSETS.map(asset => 
            cache.add(asset).catch(err => {
              console.warn('⚠️ Impossible de mettre en cache:', asset, err);
              return null;
            })
          )
        );
      })
      .then(() => {
        console.log('✅ Service Worker installé');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('❌ Erreur installation Service Worker:', error);
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
            if (cacheName !== STATIC_CACHE_NAME && 
                cacheName !== RUNTIME_CACHE_NAME && 
                cacheName !== CACHE_NAME) {
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

// Gestion des requêtes
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
  
  try {
    // 1. Essayer le réseau d'abord
    const networkResponse = await fetch(request);
    
    // Si succès, mettre en cache et retourner
    if (networkResponse.ok) {
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    
    throw new Error('Network response not ok');
    
  } catch (error) {
    console.log('📦 Réseau indisponible, essai du cache pour:', url.pathname);
    
    // 2. Si le réseau échoue, essayer le cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('✅ Trouvé en cache:', url.pathname);
      return cachedResponse;
    }
    
    // 3. Pour les pages de navigation, retourner la page d'accueil en cache ou fallback
    if (request.mode === 'navigate') {
      const homeResponse = await caches.match('/');
      if (homeResponse) {
        return homeResponse;
      }
      
      // Fallback page hors ligne
      return getOfflineFallback();
    }
    
    // 4. Pour les autres ressources, retourner une erreur
    return new Response('Ressource non disponible hors ligne', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Page de fallback hors ligne simplifiée
function getOfflineFallback() {
  const offlineHTML = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Siemens CalcConform - Hors ligne</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          margin: 0;
          padding: 20px;
          background: linear-gradient(135deg, #009999 0%, #007A7A 100%);
          color: white;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          text-align: center;
        }
        .logo { font-size: 28px; font-weight: bold; margin-bottom: 8px; }
        .app-name { font-size: 16px; margin-bottom: 40px; }
        .title { font-size: 20px; font-weight: bold; margin-bottom: 16px; }
        .message { font-size: 14px; line-height: 1.5; margin-bottom: 24px; max-width: 300px; }
        .retry-button {
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <div class="logo">SIEMENS</div>
      <div class="app-name">CalcConform</div>
      <div class="title">Mode hors ligne</div>
      <div class="message">
        Vous êtes hors ligne. L'application fonctionne avec vos données locales.
      </div>
      <button class="retry-button" onclick="window.location.reload()">
        Réessayer
      </button>
      <script>
        // Redirection automatique si connexion rétablie
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

console.log('🚀 Service Worker Siemens CalcConform initialisé');