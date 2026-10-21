/* Leg den Käse – Offline-Speicher (Anfragen an den KI-Server gehen immer direkt ins Netz; config.js zuerst aus dem Netz) */
const CACHE='legdenkaese-v1.8.0';
const FILES=["./", "./index.html", "./config.js", "./manifest.json", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./foto-amara.jpg", "./foto-dani.jpg", "./foto-elira.jpg", "./foto-giulia.jpg", "./foto-isabella.jpg", "./foto-katja.jpg", "./foto-leni.jpg", "./foto-ling.jpg", "./foto-mei.jpg", "./foto-melis.jpg", "./foto-sandra.jpg"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;
  if(u.pathname.endsWith('/config.js')){e.respondWith(fetch(e.request).then(res=>{const c=res.clone();caches.open(CACHE).then(ca=>ca.put(e.request,c));return res;}).catch(()=>caches.match(e.request,{ignoreSearch:true})));return;}
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(res=>{const c=res.clone();caches.open(CACHE).then(ca=>ca.put(e.request,c));return res;}).catch(()=>caches.match('./index.html'))));});
