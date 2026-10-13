/* ROM Library PWA — cache local de interface/catálogo. Nunca armazena ROMs. */
const VERSION = 'v0.1.0';
const STATIC_CACHE = `rom-library-static-${VERSION}`;
const CATALOG_CACHE = `rom-library-catalog-${VERSION}`;
const COVERS_CACHE = `rom-library-covers-${VERSION}`;
const MAX_COVERS = 70;
const STATIC_FILES = [
  './','./index.html','./styles.css','./app.js','./manifest.webmanifest',
  './assets/favicon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable-512.png'
];
const CACHE_NAMES = [STATIC_CACHE, CATALOG_CACHE, COVERS_CACHE];
const scoped = path => new URL(path, self.registration.scope);
self.addEventListener('install',event => {
  event.waitUntil((async()=> {
    const cache=await caches.open(STATIC_CACHE);
    await cache.addAll(STATIC_FILES.map(path=>scoped(path).href));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const name of await caches.keys()) {
      if(name.startsWith('rom-library-')&&!CACHE_NAMES.includes(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
async function networkFirst(request,cacheName,offlineFallback=null){
  const cache=await caches.open(cacheName);
  try {
    const response=await fetch(request);
    if(response.ok) await cache.put(request,response.clone());
    return response;
  } catch(error) {
    const cached=await cache.match(request);
    if(cached)return cached;
    if(offlineFallback){const fallback=await caches.match(scoped(offlineFallback));if(fallback)return fallback;}
    throw error;
  }
}
async function staticFirst(request){
  const cache=await caches.open(STATIC_CACHE);
  const cached=await cache.match(request);
  if(cached)return cached;
  const response=await fetch(request);
  if(response.ok)await cache.put(request,response.clone());
  return response;
}
async function cappedCover(request){
  const cache=await caches.open(COVERS_CACHE);
  const cached=await cache.match(request);
  if(cached)return cached;
  const response=await fetch(request);
  if(response.ok||response.type==='opaque') {
    try {
      await cache.put(request,response.clone());
      const keys=await cache.keys();
      for(const key of keys.slice(0,Math.max(0,keys.length-MAX_COVERS)))await cache.delete(key);
    }catch(error){console.warn('Não foi possível guardar esta capa no cache.',error);}
  }
  return response;
}
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  const sameOrigin=url.origin===self.location.origin;
  if(sameOrigin){
    const catalogUrl=scoped('./catalogo-roms.json');
    if(url.pathname===catalogUrl.pathname){event.respondWith(networkFirst(request,CATALOG_CACHE));return;}
    if(request.mode==='navigate'){event.respondWith(networkFirst(request,STATIC_CACHE,'./index.html'));return;}
    if(url.pathname.startsWith(new URL(self.registration.scope).pathname)) {
      event.respondWith(staticFirst(request));return;
    }
  }
  if(request.destination==='image' && url.hostname==='thumbnails.libretro.com' && url.protocol==='https:') {
    event.respondWith(cappedCover(request));
  }
});
