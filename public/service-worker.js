const CACHE='26motor-mobile-v2';
const SHELL=['/','/style.css?v=mobile-app-1','/app.js?v=mobile-app-1','/row-exports.js','/pdf-preview.js','/vendor/pdf.min.mjs','/vendor/pdf.worker.min.mjs','/mobile.js','/mobile-actions.js','/dashboard-config.js','/vehicle-frequency.js','/crm-reminder-tools.js','/counters.js','/process-steps.js','/rupiah-input.js','/estimate-math.js','/assets/logo-premium.png','/assets/workshop.webp','/assets/dm-sans.ttf','/assets/app-icon.svg','/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('26motor-mobile-')&&key!==CACHE).map(key=>caches.delete(key)))))});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
 if(!SHELL.some(item=>new URL(item,location.origin).pathname===url.pathname))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)))}return response}).catch(async()=>await caches.match(event.request)||await caches.match(url.pathname,{ignoreSearch:true})));
});
