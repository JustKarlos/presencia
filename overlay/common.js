/* Base compartida de los widgets: conexión, parámetros de la URL y emotes */
(function(){
  const P = new URLSearchParams(location.search);
  const CFG = window.OVERLAY_CONFIG || {};
  const num = (k, d) => { const v = parseFloat(P.get(k)); return Number.isFinite(v) ? v : d; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const KEY = P.get('key') || '';
  const FN = `${CFG.SUPABASE_URL}/functions/v1/kick-webhook`;
  const db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

  function loadFont(name, weights){
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(name).replace(/%20/g, '+') + (weights ? ':wght@' + weights : '') + '&display=swap';
    document.head.append(l);
  }
  loadFont('Barlow Condensed', '500;700');
  const custom = P.get('font');                                   // ?font=Nombre de Google Fonts
  if(custom){ loadFont(custom); document.documentElement.style.setProperty('--display', `"${custom}","Barlow Condensed",sans-serif`); }

  function warn(t){
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;top:8px;left:8px;background:#a00;color:#fff;padding:4px 8px;font:14px sans-serif;z-index:99;text-shadow:none';
    d.textContent = t; document.body.append(d);
  }
  // Eventos en tiempo real que envía la Edge Function (el canal lleva tu clave secreta)
  function listen(handlers){
    if(!KEY){ warn('Falta ?key=TU_CLAVE en la URL'); return null; }
    const ch = db.channel('overlay-' + KEY);
    Object.entries(handlers).forEach(([ev, fn]) => ch.on('broadcast', { event: ev }, (m) => fn(m.payload)));
    ch.subscribe();
    return ch;
  }

  // Emotes: los de Kick vienen en el texto como [emote:ID:nombre]; los de 7TV se buscan por nombre
  const e7 = new Map(), loaded = {};
  function load7tv(kickId){
    kickId = P.get('kickid') || kickId || '';
    const k = kickId || 'global';
    if(loaded[k]) return loaded[k];
    const add = (list) => (list || []).forEach(e => e7.set(e.name, `https://cdn.7tv.app/emote/${e.id}/2x.webp`));
    const j = (u) => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
    loaded.global = loaded.global || j('https://7tv.io/v3/emote-sets/global').then(d => add(d && d.emotes));
    loaded[k] = kickId ? Promise.all([loaded.global, j(`https://7tv.io/v3/users/kick/${kickId}`).then(d => add(d && d.emote_set && d.emote_set.emotes))]) : loaded.global;
    return loaded[k];
  }
  function parseParts(text){
    const out = [], re = /\[emote:(\d+):([^\]]*)\]/g;
    let last = 0, m;
    const pushText = (s) => s.split(/(\s+)/).forEach(w => { if(!w) return; const u = e7.get(w); out.push(u ? { t:'emote', url:u, name:w } : { t:'text', v:w }); });
    while((m = re.exec(text))){
      pushText(text.slice(last, m.index));
      out.push({ t:'emote', url:`https://files.kick.com/emotes/${m[1]}/fullsize`, name:m[2] });
      last = re.lastIndex;
    }
    pushText(text.slice(last));
    return out;
  }
  const partsHtml = (parts) => parts.map(p => p.t === 'emote' ? `<img class="emote" src="${esc(p.url)}" alt="${esc(p.name)}">` : esc(p.v)).join('');
  const hue = (s) => { let h = 0; for(const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const colorOf = (name, c) => /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : `hsl(${hue(name)} 75% 68%)`;
  const initials = (n) => esc(String(n || '?').trim().slice(0, 2).toUpperCase());
  const fmtMin = (m) => { m = Number(m) || 0; return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

  // Diferencia entre el reloj del servidor y el de este PC
  async function clockOffset(){
    const t0 = Date.now();
    const { data } = await db.rpc('server_time');
    const t1 = Date.now();
    return data ? new Date(data).getTime() - (t0 + t1) / 2 : 0;
  }

  window.OV = { P, num, esc, KEY, FN, db, warn, listen, loadFont, load7tv, parseParts, partsHtml, colorOf, initials, fmtMin, clockOffset };
})();
