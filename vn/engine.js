'use strict';
/* ===== เครื่องเล่น Visual Novel (ไม่ผูกกับเกมการ์ด) =====
   อ่านเรื่องจาก window.STORY (ดู story/chapter1.js และ README.md)
   ขั้นตอนแต่ละ step เป็น object — ดูชนิดที่รองรับในฟังก์ชัน run() */
const $ = id => document.getElementById(id);
const SAVE_KEY = 'fvnVNSave';

const V = { label: null, idx: 0, flags: {}, bg: '', chars: {}, busy: false, waiting: null, typing: null };

/* ---------- เซฟ / โหลด (localStorage) ---------- */
function storeGet() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }
function storeSet(d) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); return true; } catch (e) { return false; } }
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 1500); }
function snapshot() { return { label: V.label, idx: V.idx, flags: V.flags, bg: V.bg, chars: V.chars }; }

/* ---------- ภาพ ---------- */
function setBg(file) {
  V.bg = file;
  const el = $('bg'); el.classList.add('fade');
  setTimeout(() => {
    el.style.backgroundImage = file ? `url("assets/bg/${file}")` : 'none';
    el.classList.remove('fade');
  }, 200);
}
function drawChars() {
  $('chars').innerHTML = Object.entries(V.chars).map(([id, c]) =>
    `<div class="char ${c.img ? '' : 'ph'}" data-pos="${c.pos || 'center'}" style="${c.img ? `background-image:url('assets/chars/${c.img}')` : ''}">${c.img ? '' : id}</div>`).join('');
}

/* ---------- ข้อความ (พิมพ์ทีละตัว คลิกเพื่อข้าม/ไปต่อ) ---------- */
function say(name, text) {
  return new Promise(res => {
    $('name').textContent = name || '';
    const t = $('text'); t.classList.toggle('narr', !name); t.textContent = '';
    $('next').style.visibility = 'hidden';
    const chars = [...text]; let i = 0;
    const done = () => { clearInterval(V.typing); V.typing = null; t.textContent = text; $('next').style.visibility = 'visible'; V.waiting = res; };
    V.typing = setInterval(() => { t.textContent += chars[i++]; if (i >= chars.length) done(); }, 28);
    V.skipTyping = done;
  });
}
function advance() {
  if (V.typing) return V.skipTyping();      // กำลังพิมพ์ → แสดงข้อความเต็มทันที
  if (V.waiting) { const r = V.waiting; V.waiting = null; r(); }
}

/* ---------- ตัวเลือก ---------- */
function choose(options) {
  return new Promise(res => {
    const box = $('choices'); box.innerHTML = '';
    options.forEach(o => {
      if (o.if && !V.flags[o.if]) return;      // ซ่อนตัวเลือกที่เงื่อนไข flag ยังไม่ผ่าน
      const b = document.createElement('button'); b.className = 'vbtn'; b.textContent = o.text;
      b.onclick = () => { box.classList.add('hidden'); res(o); };
      box.appendChild(b);
    });
    box.classList.remove('hidden');
  });
}

/* ---------- ดวลการ์ด (จุดเชื่อมกับเกมการ์ด) ----------
   ถ้ามี window.FVN_startBattle(config) → เรียกใช้และรอผล 'win' | 'lose' | 'draw'
   ถ้ายังไม่มี → ให้เลือกผลเองไปก่อน (ตัวจำลอง) */
async function battle(cfg) {
  if (typeof window.FVN_startBattle === 'function') return await window.FVN_startBattle(cfg);
  const o = await choose([{ text: `⚔️ [ตัวจำลองดวล] ชนะ — ${cfg.opponent || 'คู่ต่อสู้'}`, r: 'win' }, { text: '💀 [ตัวจำลองดวล] แพ้', r: 'lose' }]);
  return o.r;
}

/* ---------- ประมวลผล step ---------- */
async function run() {
  while (true) {
    const scene = STORY.scenes[V.label];
    if (!scene) { toast(`ไม่พบฉาก "${V.label}"`); return; }
    if (V.idx >= scene.length) { toast('จบฉาก (ไม่มี goto/end)'); return; }
    const s = scene[V.idx++];
    if (s.set) Object.assign(V.flags, s.set);
    if (s.bg !== undefined) setBg(s.bg);
    if (s.show) { V.chars[s.show.id] = { img: s.show.img, pos: s.show.pos }; drawChars(); }
    if (s.hide) { delete V.chars[s.hide]; drawChars(); }
    if (s.clear) { V.chars = {}; drawChars(); }
    if (s.text !== undefined) await say(s.say, s.text);
    if (s.choice) { const o = await choose(s.choice); if (o.set) Object.assign(V.flags, o.set); if (o.goto) { V.label = o.goto; V.idx = 0; } }
    if (s.if) { if (V.flags[s.if.flag]) { V.label = s.if.goto; V.idx = 0; } }
    if (s.battle) { const r = await battle(s.battle); V.label = s.battle[r] || s.battle.win; V.idx = 0; }
    if (s.goto) { V.label = s.goto; V.idx = 0; }
    if (s.end) { await say('', s.end === true ? '— จบ —' : s.end); showTitle(); return; }
  }
}

/* ---------- เมนู / เริ่ม / โหลด ---------- */
function showTitle() { $('stage').classList.add('hidden'); $('title').classList.remove('hidden'); $('btn-continue').disabled = !storeGet(); }
function start(from) {
  const d = from || { label: STORY.start, idx: 0, flags: {}, bg: '', chars: {} };
  Object.assign(V, { label: d.label, idx: d.idx, flags: d.flags, bg: '', chars: d.chars || {}, waiting: null });
  clearInterval(V.typing); V.typing = null;
  $('title').classList.add('hidden'); $('stage').classList.remove('hidden'); $('choices').classList.add('hidden');
  $('text').textContent = ''; $('name').textContent = '';
  setBg(d.bg || ''); drawChars(); run();
}
$('btn-new').onclick = () => start();
$('btn-continue').onclick = () => { const d = storeGet(); if (d) start(d); };
$('btn-save').onclick = e => { e.stopPropagation(); toast(storeSet(snapshot()) ? 'เซฟแล้ว' : 'เซฟไม่ได้ (เบราว์เซอร์บล็อกที่เก็บข้อมูล)'); };
$('btn-load').onclick = e => { e.stopPropagation(); const d = storeGet(); if (d) start(d); else toast('ยังไม่มีเซฟ'); };
$('btn-menu').onclick = e => { e.stopPropagation(); showTitle(); };
$('dialog').onclick = advance;
document.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!$('stage').classList.contains('hidden')) advance(); } });
showTitle();
