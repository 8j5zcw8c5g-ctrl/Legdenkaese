/* =====================================================================
   Leg den Käse – KI-Server (Cloudflare Worker)
   Die App schickt Chat-Anfragen hierher. Nur dieser Worker kennt den Claude-API-Schlüssel.

   Einstellungen im Cloudflare-Dashboard (Worker → Settings):
     ANTHROPIC_API_KEY  (Secret, Pflicht)   dein Claude-API-Schlüssel „sk-ant-…“
     DB                 (D1-Bindung, Pflicht) Datenbank für Tageslimits und Meldungen
   Freiwillig (Variables):
     DAILY_LIMIT  Nachrichten pro Gerät und Tag      (Standard 100)
     IP_LIMIT     Nachrichten pro Internet-Anschluss (Standard 300)
     GLOBAL_LIMIT Nachrichten für alle zusammen      (Standard 5000 – Kostenbremse)
     MODEL        Claude-Modell                       (Standard claude-haiku-5-5)
     TZ           Zeitzone für „Mitternacht“          (Standard Europe/Zurich)
     ADMIN_KEY    Passwort, um Meldungen anzusehen:  https://<worker>/reports?key=<ADMIN_KEY>
   Natürliche Stimmen (freiwillig, Microsoft Azure – Gratis-Tarif F0):
     AZURE_SPEECH_KEY    (Secret)  Schlüssel 1 deiner Azure-Speech-Ressource
     AZURE_SPEECH_REGION (Text)    Region der Ressource, z. B. westeurope
     TTS_LIMIT           vorgelesene Sätze pro Gerät und Tag (Standard 150)
   ===================================================================== */
const VERSION = '1.1';
const TOOLS = ['antworten', 'bewerten'];
const MAX_BODY = 3_000_000;          // Zeichen (Fotos sind schon klein gerechnet)
const MAX_TOKENS = 800;
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
/* Diese Modelle erlauben kein erzwungenes Werkzeug → dort „auto“ */
const NO_FORCED_TOOL = /opus-5-5|sonnet-5-5|fable-5-1|mythos/;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-device-id, x-app-version',
  'access-control-expose-headers': 'x-remaining, x-limit, x-voice',
  'access-control-max-age': '86400',
};
function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra } });
}
const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };
function dayKey(env, offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 864e5);
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: env.TZ || 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
  catch (_) { return d.toISOString().slice(0, 10); }
}
async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ldk:' + s));
  return [...new Uint8Array(b)].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('');
}

/* ---------- Datenbank (D1) ---------- */
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS usage (k TEXT PRIMARY KEY, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, device TEXT, person TEXT, name TEXT, reason TEXT, note TEXT, place TEXT, last TEXT, app TEXT)'),
  ]);
  schemaReady = true;
}
const UPSERT = 'INSERT INTO usage (k, day, n) VALUES (?1, ?2, 1) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN usage.day = excluded.day THEN usage.n + 1 ELSE 1 END, day = excluded.day RETURNING n';
async function bump(db, keys, day) {
  let res;
  try { res = await db.batch(keys.map(k => db.prepare(UPSERT).bind(k, day))); }
  catch (e) {
    /* Tabelle fehlt (z. B. neue Datenbank verbunden) → anlegen und nochmal */
    if (!/no such table/i.test(String(e && e.message))) throw e;
    schemaReady = false; await ensureSchema(db);
    res = await db.batch(keys.map(k => db.prepare(UPSERT).bind(k, day)));
  }
  return res.map(r => (r.results && r.results[0] ? r.results[0].n : 0));
}
async function refund(db, keys, day) {
  try { await db.batch(keys.map(k => db.prepare('UPDATE usage SET n = MAX(0, n - 1) WHERE k = ?1 AND day = ?2').bind(k, day))); } catch (_) {}
}

/* ---------- Prüfen, ob die Anfrage wirklich von der App kommt und nicht zu groß ist ---------- */
function checkChat(b) {
  if (!b || typeof b !== 'object') return 'Leere Anfrage';
  if (typeof b.system !== 'string' || b.system.length < 20 || b.system.length > 30000) return 'system';
  if (!b.system.includes('Leg den Käse')) return 'system';
  if (!Array.isArray(b.messages) || !b.messages.length || b.messages.length > 90) return 'messages';
  let images = 0;
  for (const m of b.messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return 'role';
    if (typeof m.content === 'string') { if (m.content.length > 4000) return 'content'; continue; }
    if (!Array.isArray(m.content) || m.content.length > 4) return 'content';
    for (const c of m.content) {
      if (c.type === 'text') { if (typeof c.text !== 'string' || c.text.length > 4000) return 'text'; }
      else if (c.type === 'image') {
        images++;
        const s = c.source || {};
        if (s.type !== 'base64' || !/^image\/(jpeg|png|webp|gif)$/.test(s.media_type || '') || typeof s.data !== 'string' || s.data.length > 1_500_000) return 'image';
      } else return 'type';
    }
  }
  if (images > 2) return 'images';
  const t = b.tool;
  if (!t || !TOOLS.includes(t.name) || !t.input_schema || JSON.stringify(t).length > 8000) return 'tool';
  return null;
}

async function handleChat(req, env, ctx) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'setup', message: 'ANTHROPIC_API_KEY fehlt im Worker' }, 503);
  if (!env.DB) return json({ error: 'setup', message: 'D1-Datenbank (Bindung DB) fehlt im Worker' }, 503);
  const dev = req.headers.get('x-device-id') || '';
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(dev)) return json({ error: 'bad', message: 'Geräte-ID fehlt' }, 400);
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: 'bad', message: 'Anfrage zu groß' }, 413);
  let b; try { b = JSON.parse(text); } catch (_) { return json({ error: 'bad', message: 'Kein JSON' }, 400); }
  const bad = checkChat(b);
  if (bad) return json({ error: 'bad', message: 'Ungültige Anfrage (' + bad + ')' }, 400);

  /* Tageslimits: pro Gerät, pro Internet-Anschluss und für alle zusammen */
  const db = env.DB; await ensureSchema(db);
  const day = dayKey(env);
  const L = { dev: num(env.DAILY_LIMIT, 100), ip: num(env.IP_LIMIT, 300), all: num(env.GLOBAL_LIMIT, 5000) };
  const ip = req.headers.get('cf-connecting-ip') || 'unbekannt';
  const keys = ['d:' + await sha(dev), 'i:' + await sha(ip), 'g:alle'];
  const [nDev, nIp, nAll] = await bump(db, keys, day);
  const left = Math.max(0, L.dev - nDev);
  const hdr = { 'x-remaining': String(left), 'x-limit': String(L.dev) };
  if (nDev > L.dev) return json({ error: 'limit', limit: L.dev }, 429, { 'x-remaining': '0', 'x-limit': String(L.dev) });
  if (nIp > L.ip || nAll > L.all) { await refund(db, keys.slice(0, 1), day); return json({ error: 'global' }, 429, hdr); }
  /* ab und zu alte Zähler löschen (Datensparsamkeit) */
  if (Math.random() < 0.02) ctx.waitUntil(db.prepare('DELETE FROM usage WHERE day < ?1').bind(dayKey(env, -3)).run().catch(() => {}));

  const model = env.MODEL || 'claude-haiku-5-5';
  const body = {
    model,
    max_tokens: Math.min(MAX_TOKENS, Math.max(50, parseInt(b.max_tokens, 10) || 600)),
    system: b.system,
    messages: b.messages,
    tools: [{ name: b.tool.name, description: String(b.tool.description || '').slice(0, 500), input_schema: b.tool.input_schema }],
    tool_choice: NO_FORCED_TOOL.test(model) ? { type: 'auto' } : { type: 'tool', name: b.tool.name },
  };
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 40000);
  let r;
  try {
    r = await fetch(ANTHROPIC, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    clearTimeout(timer); await refund(db, keys, day);
    return json({ error: 'busy', message: 'Claude nicht erreichbar' }, 503, { 'x-remaining': String(left + 1), 'x-limit': String(L.dev) });
  }
  clearTimeout(timer);
  if (!r.ok) {
    await refund(db, keys, day);
    let detail = ''; try { detail = (await r.text()).slice(0, 300); } catch (_) {}
    console.log('Claude-Fehler', r.status, detail);
    const back = { 'x-remaining': String(left + 1), 'x-limit': String(L.dev) };
    if (r.status === 401 || r.status === 403) return json({ error: 'setup', message: 'API-Schlüssel ungültig oder ohne Guthaben' }, 503, back);
    if (r.status === 429 || r.status === 529 || r.status >= 500) return json({ error: 'busy' }, 503, back);
    return json({ error: 'bad', message: 'Claude hat die Anfrage abgelehnt (' + r.status + ')' }, 502, back);
  }
  let out; try { out = await r.json(); } catch (_) { return json({ error: 'busy' }, 503, hdr); }
  /* Nur das Nötigste an die App zurück */
  const content = (out.content || []).filter(c => c.type === 'tool_use' || c.type === 'text').map(c => c.type === 'tool_use' ? { type: 'tool_use', name: c.name, input: c.input } : { type: 'text', text: c.text });
  return json({ content, stop_reason: out.stop_reason }, 200, hdr);
}

async function handleReport(req, env) {
  if (!env.DB) return json({ error: 'setup' }, 503);
  const dev = req.headers.get('x-device-id') || '';
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(dev)) return json({ error: 'bad' }, 400);
  const text = await req.text(); if (text.length > 20000) return json({ error: 'bad' }, 413);
  let b; try { b = JSON.parse(text); } catch (_) { return json({ error: 'bad' }, 400); }
  const db = env.DB; await ensureSchema(db);
  const dh = await sha(dev); const day = dayKey(env);
  const [n] = await bump(db, ['r:' + dh], day);
  if (n > 30) return json({ error: 'limit' }, 429);
  const s = (v, l) => String(v == null ? '' : v).slice(0, l);
  const last = Array.isArray(b.last) ? b.last.slice(-8).map(m => ({ f: m && m.f === 'me' ? 'ich' : 'figur', t: s(m && m.t, 400) })) : [];
  await db.prepare('INSERT INTO reports (ts, device, person, name, reason, note, place, last, app) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
    .bind(new Date().toISOString(), dh, s(b.person, 40), s(b.name, 60), s(b.reason, 30), s(b.note, 300), s(b.where, 10), JSON.stringify(last), s(b.app, 20)).run();
  /* Datensparsamkeit: Meldungen nach spätestens 12 Monaten und alte Zähler löschen */
  await db.batch([
    db.prepare('DELETE FROM reports WHERE ts < ?1').bind(new Date(Date.now() - 365 * 864e5).toISOString()),
    db.prepare('DELETE FROM usage WHERE day < ?1').bind(dayKey(env, -3)),
  ]).catch(() => {});
  return json({ ok: true });
}

/* ---------- Natürliche Stimmen (Azure Speech) ---------- */
let VOICES = null, voicesAt = 0;
const VOICE_FALLBACK = ['de-DE-KatjaNeural', 'de-DE-AmalaNeural', 'de-DE-SeraphinaMultilingualNeural'];
const xml = t => String(t).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
async function germanVoices(env) {
  if (VOICES && Date.now() - voicesAt < 6 * 3600e3) return VOICES;
  try {
    const r = await fetch(`https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/voices/list`, { headers: { 'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY } });
    if (r.ok) {
      const all = await r.json();
      /* Erwachsene Frauenstimmen auf Deutsch (keine Kinderstimme, keine Spezial-HD-Stimmen) */
      const f = all.filter(v => /^de-(DE|AT|CH)$/.test(v.Locale) && v.Gender === 'Female' && !/Gisela|:|HD/i.test(v.ShortName) && (!v.VoiceType || v.VoiceType === 'Neural')).map(v => v.ShortName);
      f.sort((a, b) => (a.startsWith('de-DE') ? 0 : 1) - (b.startsWith('de-DE') ? 0 : 1) || a.localeCompare(b));
      if (f.length) { VOICES = f; voicesAt = Date.now(); return VOICES; }
    }
  } catch (_) {}
  return VOICE_FALLBACK;
}
async function handleTTS(req, env) {
  if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) return json({ error: 'notts' }, 501);
  if (!env.DB) return json({ error: 'setup' }, 503);
  const dev = req.headers.get('x-device-id') || '';
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(dev)) return json({ error: 'bad' }, 400);
  const raw = await req.text(); if (raw.length > 4000) return json({ error: 'bad' }, 413);
  let b; try { b = JSON.parse(raw); } catch (_) { return json({ error: 'bad' }, 400); }
  const text = String(b.text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!text) return json({ error: 'bad' }, 400);
  const db = env.DB; await ensureSchema(db); const day = dayKey(env);
  const key = 't:' + await sha(dev); const [n] = await bump(db, [key], day);
  if (n > num(env.TTS_LIMIT, 150)) return json({ error: 'limit' }, 429);
  const list = await germanVoices(env);
  const voice = list[(Math.abs(parseInt(b.v, 10)) || 0) % list.length];
  const cl = (v, a) => Math.max(-a, Math.min(a, Math.round(Number(v) || 0)));
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="de-DE"><voice name="${voice}"><prosody rate="${cl(b.rate, 25)}%" pitch="${cl(b.pitch, 15)}%">${xml(text)}</prosody></voice></speak>`;
  let r;
  try {
    r = await fetch(`https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST', body: ssml,
      headers: { 'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'LegDenKaese' },
    });
  } catch (_) { await refund(db, [key], day); return json({ error: 'busy' }, 503); }
  if (!r.ok) {
    await refund(db, [key], day); console.log('Azure-Fehler', r.status);
    if (r.status === 401 || r.status === 403) return json({ error: 'setup', message: 'Azure-Schlüssel oder Region falsch' }, 503);
    if (r.status === 429) return json({ error: 'quota', message: 'Gratis-Kontingent für diesen Monat aufgebraucht' }, 503);
    return json({ error: 'busy' }, 503);
  }
  return new Response(r.body, { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=86400', 'x-voice': voice, ...CORS } });
}

async function listReports(url, env) {
  if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) return json({ error: 'nein' }, 403);
  if (!env.DB) return json({ error: 'setup' }, 503);
  await ensureSchema(env.DB);
  const r = await env.DB.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT 100').all();
  const rows = (r.results || []).map(x => ({ ...x, last: (() => { try { return JSON.parse(x.last); } catch (_) { return x.last; } })() }));
  return new Response(JSON.stringify({ anzahl: rows.length, meldungen: rows }, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
        /* Selbsttest: im Browser öffnen → zeigt, ob alles eingerichtet ist */
        return json({ ok: !!(env.ANTHROPIC_API_KEY && env.DB), app: 'Leg den Käse – KI-Server', version: VERSION,
          schluessel: env.ANTHROPIC_API_KEY ? 'eingetragen ✅' : 'FEHLT ❌ (Settings → Variables and Secrets → ANTHROPIC_API_KEY)',
          datenbank: env.DB ? 'verbunden ✅' : 'FEHLT ❌ (Bindings → D1 database → Variable name DB)',
          modell: env.MODEL || 'claude-haiku-5-5', limit_pro_geraet: num(env.DAILY_LIMIT, 100),
          tts: !!(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION), stimmen: env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION ? 'Natürliche Stimmen (Azure) aktiv ✅' : 'Handy-Stimmen (für natürliche Stimmen: AZURE_SPEECH_KEY + AZURE_SPEECH_REGION eintragen)' });
      }
      if (req.method === 'GET' && url.pathname === '/reports') return listReports(url, env);
      if (req.method === 'POST' && url.pathname === '/chat') return await handleChat(req, env, ctx);
      if (req.method === 'POST' && url.pathname === '/report') return await handleReport(req, env);
      if (req.method === 'POST' && url.pathname === '/tts') return await handleTTS(req, env);
      return json({ error: 'nicht gefunden' }, 404);
    } catch (e) {
      console.log('Fehler', e && e.stack || e);
      return json({ error: 'busy', message: 'Serverfehler' }, 500);
    }
  },
};
