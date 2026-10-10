/* TAWAL handover checklist – offline cache.
   v3.7.3 (owner R48-2, replaces the network-first page of R35-1): the saved copy of the page opens at once, with or without signal.
   The page checks for a new version in the background; when one is ready, the red bar asks to reload. Other files: saved copy first,
   refreshed in the background. Only when there is no saved copy yet is the page loaded from the network.
   Review 13: only the install step writes the page to the cache, and only a page that carries this worker's build,
   so an older worker never stores a newer page (or the reverse) and the update bar cannot loop.
   v3.6.26 (external audit R3625-03): the cache name carries the app and its web folder (scope); this worker reads only its own cache
   and deletes only older TAWAL checklist caches of the same folder, never caches of other apps or of another TAWAL folder. */
var CACHE='tawal-ho-2d76a094';
var BUILD=CACHE.slice(9);
var SCOPE=new URL(self.registration.scope).pathname;
var NAME=CACHE+'@'+SCOPE;
var OTHER=['./manifest.webmanifest','./icon-192.png','./icon-512.png'];
function html(b){ return new Response(b,{status:200,headers:{'Content-Type':'text/html; charset=utf-8'}}); }
function mine(k){ return k!==NAME && (k.slice(-(SCOPE.length+1))==='@'+SCOPE && /^tawal-ho-[0-9a-f]{8}@/.test(k) || /^tawal-ho-[0-9a-f]{8}$/.test(k)); }   /* older copies of this app in this folder; names without a folder come from v3.6.25 and older */
self.addEventListener('install',function(e){ e.waitUntil(caches.open(NAME).then(function(c){
  return fetch(new Request('./index.html',{cache:'reload'})).then(function(r){
    if(!r.ok) throw new Error('page '+r.status);
    return r.text().then(function(t){
      if(t.indexOf(BUILD)<0) throw new Error('page is not build '+BUILD);   /* server still has the old page: try again later */
      return Promise.all([c.put('./index.html',html(t)), c.put('./',html(t))]);
    });
  }).then(function(){ return Promise.all(OTHER.map(function(u){ return c.add(new Request(u,{cache:'reload'})).catch(function(){}); })); });   // v3.7.3 review: icons and manifest are not needed to open the app
}).then(function(){ return self.skipWaiting(); },function(err){
  /* v3.7.3 review: the new version could not be saved (phone storage full): the open page says so, because the saved old copy keeps opening */
  var full=err && (err.name==='QuotaExceededError' || /quota/i.test(String(err.message||'')));
  return caches.delete(NAME).then(function(){ if(full) return self.clients.matchAll({includeUncontrolled:true}).then(function(cs){ cs.forEach(function(c){ c.postMessage({type:'build',cache:CACHE,build:BUILD,fail:1}); }); }); }).then(function(){ throw err; }); })); });
function tell(){ return self.clients.matchAll({includeUncontrolled:true}).then(function(cs){ cs.forEach(function(c){ c.postMessage({type:'build',cache:CACHE,build:BUILD,fresh:1}); }); }); }
self.addEventListener('activate',function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(mine).map(function(k){return caches.delete(k);})); }).then(function(){ return self.clients.claim(); }).then(tell)); });
self.addEventListener('message',function(e){ if(e.data==='build?' && e.source) e.source.postMessage({type:'build',cache:CACHE,build:BUILD}); });
function isPage(req){ if(req.mode==='navigate') return true; var p=new URL(req.url).pathname; return /\/(index\.html)?$/.test(p); }
function own(req,opt){ return caches.open(NAME).then(function(c){ return c.match(req,opt); }); }
self.addEventListener('fetch',function(e){
  var req=e.request; if(req.method!=='GET' || new URL(req.url).origin!==location.origin) return;
  if(isPage(req)){
    e.respondWith(own('./index.html').then(function(saved){
      /* v3.7.3 (owner R48-2, field report on a slow phone): the saved copy opens at once; the page then asks for a new version in the background */
      if(saved) return saved;
      /* no saved copy (for example the browser's cached files were cleared): from the network, and saved again when it is this worker's build */
      return fetch(req,{cache:'no-cache'}).then(function(r){ if(!r.ok) throw new Error('status '+r.status); return r.text().then(function(t){
          var keep= t.indexOf(BUILD)>=0? caches.open(NAME).then(function(c){ return Promise.all([c.put('./index.html',html(t)), c.put('./',html(t))]); }).catch(function(){}) : Promise.resolve();
          return keep.then(function(){ return html(t); }); }); }).catch(function(){ return fetch(req); });
    }));
    return;
  }
  e.respondWith(own(req,{ignoreSearch:true}).then(function(hit){
    var net=fetch(req).then(function(r){ if(r && r.ok){ var cp=r.clone(); caches.open(NAME).then(function(c){ c.put(req,cp); }); } return r; }).catch(function(){ return hit || Response.error(); });
    return hit || net;
  }));
});
