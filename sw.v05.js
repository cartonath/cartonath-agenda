const CACHE="cartonath-v0.5-rc2";
const STATIC=["./","index.html","styles.v05.css","core.v05.js","app.v05.js","manifest.webmanifest","icons/icon-180.png","icons/icon-192.png","icons/icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener("fetch",e=>{
 if(e.request.method!=="GET")return;
 if(e.request.mode==="navigate"){
   e.respondWith(fetch(e.request).then(r=>{const x=r.clone();caches.open(CACHE).then(c=>c.put("index.html",x));return r}).catch(()=>caches.match("index.html")));return;
 }
 e.respondWith(caches.match(e.request).then(cached=>{
   const network=fetch(e.request).then(r=>{if(r&&r.ok){const x=r.clone();caches.open(CACHE).then(c=>c.put(e.request,x))}return r}).catch(()=>cached);
   return cached||network;
 }));
});