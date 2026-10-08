/* TAWAL handover checklist – offline cache.
   v3.6.25 (owner R35-1): the page itself is loaded from the network first, so a phone with signal opens the newest version;
   without signal, on a weak signal (8 s) or on a server error, the saved copy opens. Other files: saved copy first, refreshed in the background.
   Review 13: only the install step writes the page to the cache, and only a page that carries this worker's build,
   so an older worker never stores a newer page (or the reverse) and the update bar cannot loop. */
var CACHE='tawal-ho-6f749cf1';
var BUILD=CACHE.slice(9);
var OTHER=['./manifest.webmanifest','./icon-192.png','./icon-512.png'];
function html(b){ return new Response(b,{status:200,headers:{'Content-Type':'text/html; charset=utf-8'}}); }
self.addEventListener('install',function(e){ e.waitUntil(caches.open(CACHE).then(function(c){
  return fetch(new Request('./index.html',{cache:'reload'})).then(function(r){
    if(!r.ok) throw new Error('page '+r.status);
    return r.text().then(function(t){
      if(t.indexOf(BUILD)<0) throw new Error('page is not build '+BUILD);   /* server still has the old page: try again later */
      return Promise.all([c.put('./index.html',html(t)), c.put('./',html(t))]);
    });
  }).then(function(){ return c.addAll(OTHER.map(function(u){ return new Request(u,{cache:'reload'}); })); });
}).then(function(){ return self.skipWaiting(); },function(err){ return caches.delete(CACHE).then(function(){ throw err; }); })); });
function tell(){ return self.clients.matchAll({includeUncontrolled:true}).then(function(cs){ cs.forEach(function(c){ c.postMessage({type:'build',cache:CACHE,fresh:1}); }); }); }
self.addEventListener('activate',function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);})); }).then(function(){ return self.clients.claim(); }).then(tell)); });
self.addEventListener('message',function(e){ if(e.data==='build?' && e.source) e.source.postMessage({type:'build',cache:CACHE}); });
function isPage(req){ if(req.mode==='navigate') return true; var p=new URL(req.url).pathname; return /\/(index\.html)?$/.test(p); }
self.addEventListener('fetch',function(e){
  var req=e.request; if(req.method!=='GET' || new URL(req.url).origin!==location.origin) return;
  if(isPage(req)){
    e.respondWith(caches.match('./index.html').then(function(saved){
      /* the whole page must arrive (not only its first bytes) and the server must answer OK */
      var net=fetch(req,{cache:'no-cache'}).then(function(r){ if(!r.ok) throw new Error('status '+r.status); return r.arrayBuffer().then(html); });
      if(!saved) return net.catch(function(){ return fetch(req); });
      return new Promise(function(resolve){ var done=false;
        var t=setTimeout(function(){ if(!done){ done=true; resolve(saved); } },8000);
        net.then(function(r){ if(!done){ done=true; clearTimeout(t); resolve(r); } },function(){ if(!done){ done=true; clearTimeout(t); resolve(saved); } });
      });
    }));
    return;
  }
  e.respondWith(caches.match(req,{ignoreSearch:true}).then(function(hit){
    var net=fetch(req).then(function(r){ if(r && r.ok){ var cp=r.clone(); caches.open(CACHE).then(function(c){ c.put(req,cp); }); } return r; }).catch(function(){ return hit || Response.error(); });
    return hit || net;
  }));
});
