/* Motor de colas de video / música: lee media_queue, reproduce de a uno y avisa a la función */
(function(){
  let ytP;
  function loadYT(){
    if(ytP) return ytP;
    ytP = new Promise(res => {
      if(window.YT && YT.Player) return res();
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if(prev) prev(); res(); };
      const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.append(s);
    });
    return ytP;
  }

  // o: { kind, volume, tiktokSecs, onStart(item)->idDelContenedor, onStop(item)->Promise, onTick(cur,dur), onQueue(queue,cur) }
  OV.runQueue = function(o){
    const { db, FN, KEY } = OV;
    if(!KEY) OV.warn('Falta ?key=TU_CLAVE en la URL');
    let queue = [], cur = null, player = null, tmo = [], tick = null, ending = false, played = false;

    const ack = (id, status) => fetch(FN + '/overlay/media', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-overlay-key': KEY }, body: JSON.stringify({ id, status }),
    }).catch(() => {});
    const clear = () => { tmo.forEach(clearTimeout); tmo = []; clearInterval(tick); tick = null; window.removeEventListener('message', onMsg); };
    function onMsg(e){                                   // el reproductor de TikTok avisa por postMessage (mejor esfuerzo)
      const d = e.data;
      if(d && d['x-tiktok-player'] && d.type === 'onStateChange' && (d.value === 0 || d.value === 'ended')) finish('done');
    }

    async function load(){
      const { data } = await db.from('media_queue').select('*').eq('kind', o.kind).in('status', ['queued', 'playing']).order('id');
      queue = data || [];
      check();
      if(o.onQueue) o.onQueue(queue, cur);               // después de check(): ya sabemos cuál suena
    }
    function check(){
      if(ending) return;
      if(cur && !queue.some(r => r.id === cur.id)) return finish(null);     // lo saltaron desde el chat
      if(!cur && queue.length) start(queue[0]);
    }
    async function start(item){
      cur = item; played = false; ack(item.id, 'playing');
      const slot = o.onStart(item);
      if(item.provider === 'youtube'){
        await loadYT();
        if(cur !== item) return;
        player = new YT.Player(slot, {
          videoId: item.video_id, width: '100%', height: '100%',
          playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3 },
          events: {
            onReady: (e) => { e.target.setVolume(o.volume); e.target.playVideo(); },
            onStateChange: (e) => { if(e.data === 1) played = true; if(e.data === 0) finish('done'); },
            onError: () => finish('error'),
          },
        });
        tick = setInterval(() => { try { if(o.onTick) o.onTick(player.getCurrentTime(), player.getDuration()); } catch {} }, 500);
        tmo.push(setTimeout(() => { if(!played) finish('error'); }, 20000));       // no arrancó: pasa al siguiente
      } else {
        document.getElementById(slot).innerHTML =
          `<iframe src="https://www.tiktok.com/player/v1/${encodeURIComponent(item.video_id)}?autoplay=1&music_info=0&description=0&rel=0&loop=0" allow="autoplay; fullscreen" style="width:100%;height:100%;border:0"></iframe>`;
        window.addEventListener('message', onMsg);
        tmo.push(setTimeout(() => finish('done'), (o.tiktokSecs || 90) * 1000));    // TikTok no informa siempre cuándo termina
      }
    }
    async function finish(status){
      if(ending || !cur) return;
      ending = true;
      const item = cur;
      clear();
      if(status) ack(item.id, status);
      try { if(player) player.destroy(); } catch {}
      player = null;
      if(o.onStop) await o.onStop(item);
      cur = null; ending = false;
      setTimeout(load, 800);
    }

    db.channel('mq-' + o.kind)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'media_queue', filter: `kind=eq.${o.kind}` }, () => load())
      .subscribe();
    setInterval(load, 20000);
    load();
  };
})();
