'use strict';
/* ===== ข้อมูลพื้นฐาน ===== */
const $ = id => document.getElementById(id);
const beats = (a, b) => !!a && !!b && BEAT[a] === b;
const PH = ['Start', 'Energy', 'Pick Up Hero', 'Battle', 'End'];
const rnd = a => a[Math.floor(Math.random() * a.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
// จังหวะ 'คิด' ของบอท: สุ่มระหว่าง min–max มิลลิวินาที + มีโอกาส p ที่จะหยุดคิดนานขึ้นอีกหน่อย (ให้ผู้เล่นตามทันและดูเหมือนคนเล่น)
const think = (min, max, p = 0) => sleep((min + Math.random() * (max - min) + (Math.random() < p ? 700 + Math.random() * 1200 : 0)) * CFG.botSpeed);
// ตั้งค่าจากหน้า Setting (index.html) เก็บใน localStorage: anim = อนิเมชัน · botSpeed = คูณเวลาคิดของบอท (ยิ่งมากยิ่งช้า) · timer = ตัวนับเวลาต่อเฟส
const CFG = (() => {
  const d = { anim: true, botSpeed: 1, timer: true };
  try { return Object.assign(d, JSON.parse(localStorage.getItem('fvnSettings')) || {}); } catch (e) { return d; }
})();
if (!CFG.anim) document.body.classList.remove('fx');
const opp = s => (s === 'p' ? 'b' : 'p');
const who = s => (s === 'p' ? 'ผู้เล่น' : 'บอท');

let S, uid = 0;
const pk = s => S[s].gods[0] && S[s].gods[0].key;
const side = () => ({ hand: [], e: 0, gods: [], heroes: [], altar: [], summons: 0, bonus: false, pushed: 0, dissolved: false, atkInf: 0, awakened: false, deck: [] });
const DECK_SIZE = 8, DECK_TIME = 60; // เด็คฮีโร่ 8 ใบ (ไม่รวมเทพ) · เวลาเลือกเป็นวินาที
const ATK_INF_CAP = 3; // Influence จากการยัด Energy ใส่ศัตรู: ครั้งละ +1 รวมสูงสุดกี่แต้มต่อเทิร์น
const mkGod = key => ({ id: ++uid, type: 'god', key, energy: 5, cd: 0 });
const CENTER_RATE = 0.08; // อัตราดรอปการ์ดแกนกลาง (✦) ต่อใบ — เดิม 20% (สุ่มเท่ากันทั้ง 5 ตำแหน่ง) ปรับตัวเลขนี้เพื่อจูนความหายาก
const randCard = () => ({ color: rnd(FACTS), pos: Math.random() < CENTER_RATE ? 'c' : rnd(POS.filter(p => p !== 'c')) });

function log(msg, cls = 'sys') {
  const p = document.createElement('p');
  p.className = cls; p.textContent = msg;
  $('log').appendChild(p); $('log').scrollTop = 1e9;
}
const tag = s => (s === 'p' ? 'me' : 'bot');

/* ===== ตัวนับเวลาต่อเฟส (เฉพาะช่วงที่ผู้เล่นต้องตัดสินใจ) =====
   หมดเวลา → ข้ามไปเฟสถัดไปให้อัตโนมัติ (Battle หมดเวลา = จบเทิร์น) · หยุดนับระหว่างเปิดหน้าต่างเลือกเทพ/กฎการเล่น */
const PHASE_TIME = { 1: 30, 2: 25, 3: 45 }; // วินาที: Energy / Pick Up Hero / Battle — ปรับตัวเลขที่นี่
const pt = { key: null, left: 0, total: 0, iv: null };
const modalOpen = () => ['god-modal', 'rules-modal', 'mull-modal', 'deck-modal', 'quit-modal'].some(id => !$(id).classList.contains('hidden'));
function drawTimer() {
  $('pt-num').textContent = Math.max(0, Math.ceil(pt.left));
  $('phase-timer').style.setProperty('--p', Math.max(0, pt.left / pt.total) * 100 + '%');
  $('phase-timer').classList.toggle('low', pt.left <= 5);
}
function syncTimer() {
  const act = CFG.timer && !S.over && !S.busy && S.side === 'p' && PHASE_TIME[S.phase];
  const key = act ? `${S.turn}-${S.phase}` : null;
  if (key === pt.key) return;
  pt.key = key; clearInterval(pt.iv);
  if (!key) return $('phase-timer').classList.add('hidden');
  pt.total = pt.left = PHASE_TIME[S.phase];
  $('phase-timer').classList.remove('hidden'); drawTimer();
  const st = S;
  pt.iv = setInterval(() => {
    if (S !== st || S.over) return clearInterval(pt.iv);
    if (modalOpen()) return;
    pt.left -= 0.25; drawTimer();
    if (pt.left > 0 || S.botEn) return; // Energy Phase: รอบอทเล่นการ์ดเสร็จก่อนค่อยข้าม
    clearInterval(pt.iv);
    $('hero-modal').classList.add('hidden');
    log(`⏱ หมดเวลาเฟส ${PH[S.phase]} — ข้ามไปเฟสถัดไป`, 'sys');
    nextPhase();
  }, 250);
}

/* ===== เริ่มเกม ===== */
function init() {
  clearInterval(pt.iv); pt.key = null; fxReset();
  $('log').innerHTML = '';
  S = { turn: 1, phase: 0, side: 'p', busy: true, over: false, inf: { p: 15, b: 15 },
        p: side(), b: side(), ch: randCard(), mode: null, pending: null, burn: false, sel: [],
        played: { p: [], b: [] }, botEn: false, first: Math.random() < 0.5 ? 'p' : 'b', // สุ่มว่าใครเล่นก่อน (เทิร์นถัดไปสลับกัน)
        botStyle: { aggr: 0.8 + Math.random() * 0.5, cau: 0.8 + Math.random() * 0.5, greed: Math.random() } }; // นิสัยบอทประจำเกม: ดุ / ระวัง / ชอบลงฮีโร่
  $('end-modal').classList.add('hidden');
  render();
  pickGodsSimul((key, bkey) => {
    S.p.gods = [mkGod(key)]; S.b.gods = [mkGod(bkey)];
    log(`ผู้เล่นได้ ${GOD[key].n} | บอทได้ ${GOD[pk('b')].n}`);
    chooseDeck(beginTurn);
  });
}

/* ===== เลือกเด็คฮีโร่ 8 ใบ (มีเวลานับถอยหลังก่อนเริ่มเกม) ===== */
let deckTimer = null;
// บอทเลือกเด็ค: ให้คะแนนฮีโร่ + สุ่มรบกวน + นิสัยประจำเกม (ชอบใบแพงหรือถูก) → ไม่ซ้ำกันทุกเกม
function botDeck() {
  const st = S.botStyle;
  const w = { knight: 10, apprentice: 8, medic: 6, guardian: 9, stalker: 8, archer: 11, bard: 7, thief: 9, trickster: 8, mage: 9, paladin: 10, dragon: 12 };
  return Object.keys(HERO).map(k => ({ k, s: jit(w[k] * (1 + (HERO[k].cost - 2) * 0.12 * (st.greed - 0.5)), 0.6) }))
    .sort((a, b) => b.s - a.s).slice(0, DECK_SIZE).map(x => x.k);
}
function chooseDeck(cb) {
  const st = S, sel = [], bot = botDeck(); let left = DECK_TIME, botN = 0, done = false;
  const draw = () => {
    const full = sel.length >= DECK_SIZE;
    $('deck-need').textContent = DECK_SIZE; $('deck-timer').textContent = left; $('deck-timer').classList.toggle('low', left <= 10);
    $('deck-count').textContent = `${sel.length}/${DECK_SIZE}`; $('deck-count-b').textContent = `${botN}/${DECK_SIZE}`;
    $('deck-slots-p').innerHTML = Array.from({ length: DECK_SIZE }, (_, i) => sel[i]
      ? `<div class="dslot on" data-k="${sel[i]}" title="คลิกเพื่อเอาออก">${HERO[sel[i]].i}</div>` : '<div class="dslot"></div>').join('');
    $('deck-slots-b').innerHTML = Array.from({ length: DECK_SIZE }, (_, i) => `<div class="dslot foe ${i < botN ? 'on' : ''}">${i < botN ? '?' : ''}</div>`).join('');
    $('deck-list').innerHTML = Object.keys(HERO).map(k => {
      const h = HERO[k], p = sel.includes(k);
      return `<div class="unit ${p ? 'picked' : ''} ${full ? 'full' : ''}" data-k="${k}"><span class="cost">⚡${h.cost}</span>
        <div class="icon">${h.i}</div><div class="name">${h.n}</div>
        <div class="pips">${'●'.repeat(HERO_E0)}${'○'.repeat(5 - HERO_E0)}</div><div class="tag">ค่าร่าย ${h.cost}E</div></div>`;
    }).join('');
    $('deck-go').disabled = !full;
  };
  const finish = () => {
    if (done) return; done = true; clearInterval(deckTimer);
    const rest = Object.keys(HERO).filter(k => !sel.includes(k));
    while (sel.length < DECK_SIZE) sel.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]); // หมดเวลา → สุ่มที่เหลือ
    S.p.deck = sel.slice(); S.b.deck = bot;
    $('deck-modal').classList.add('hidden'); hideTip();
    log(`เด็คฮีโร่ผู้เล่น: ${S.p.deck.map(k => HERO[k].n).join(', ')}`);
    log('บอทเลือกเด็คฮีโร่ครบ 8 ใบแล้ว (ซ่อนไว้)');
    cb();
  };
  $('deck-list').onclick = e => {
    if (holdShown) { holdShown = false; return; }
    const el = e.target.closest('.unit'); if (!el) return;
    const k = el.dataset.k, i = sel.indexOf(k);
    if (i >= 0) sel.splice(i, 1); else if (sel.length < DECK_SIZE) sel.push(k);
    draw();
  };
  $('deck-slots-p').onclick = e => { const el = e.target.closest('.dslot.on'); if (el) { sel.splice(sel.indexOf(el.dataset.k), 1); draw(); } };
  $('deck-rand').onclick = () => {
    sel.length = 0; const a = Object.keys(HERO);
    while (sel.length < DECK_SIZE) sel.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]);
    draw();
  };
  $('deck-go').onclick = finish;
  clearInterval(deckTimer); draw(); $('deck-modal').classList.remove('hidden');
  deckTimer = setInterval(() => {
    if (S !== st) return clearInterval(deckTimer);
    left--; if (botN < DECK_SIZE && Math.random() < 0.3) botN++; // บอท "กำลังเลือก" (แสดงความคืบหน้าเฉยๆ)
    if (left <= 0) return finish();
    draw();
  }, 1000);
}

/* ===== เริ่มเทิร์น: Start Phase (จั่วทั้ง 2 ฝั่ง) → Energy Phase (ทิ้งการ์ดรับ Energy ทั้ง 2 ฝั่ง) ===== */
async function beginTurn() {
  const st = S;
  S.busy = true; S.side = 'p'; S.phase = 0; S.botEn = false;
  S.ch = randCard(); S.mode = null; S.pending = null; S.burn = false; S.sel = []; S.arm = null;
  S.played = { p: [], b: [] };
  if (S.turn > 1) S.first = opp(S.first); // เทิร์นถัดไปสลับผู้เล่นคนแรก
  log(`══ เทิร์น ${S.turn} · Start Phase · ${who(S.first)}เล่นก่อน ══`);
  if (S.turn === 1) log('เทิร์นที่ 1: ทั้งสองฝ่ายยัด Energy / พลิกฝั่งไม่ได้ ใช้ตั้งหลักก่อน');
  startTurn('p'); startTurn('b');
  log(`โจทย์วงเวทย์เทิร์นนี้: ${GOD[S.ch.color].c} ${SYM[S.ch.pos]}`);
  render();
  if (S.turn === 1) { // มือเริ่มต้น: เลือกสุ่มใหม่ได้ 1 ครั้ง (บอทตัดสินใจพร้อมกัน)
    botMulligan();
    await mulligan();
    if (S !== st || S.over) return;
  }
  await sleep(1000);
  if (S !== st || S.over) return;
  S.phase = 1; S.busy = false; render(); // Energy Phase: ผู้เล่นกับบอทเล่นการ์ดพร้อมกัน
  botEnergy();
}

const godCardHTML = k => `<div class="unit god ${k}" data-k="${k}" data-god="1">${ORN}<div class="icon">${GOD[k].i}</div><div class="name">${GOD[k].n}</div>
      <div class="pips">●●●●●</div><div class="tag">สาย${GOD[k].c}</div></div>`;
/* เลือกเทพตอนเริ่มเกม: การ์ดคว่ำ 4 ใบ (สลับตำแหน่งสุ่มทุกเกม) · ผู้เล่นกับบอทเลือกพร้อมกัน
   ใบที่ถูกเลือกแล้วพลิกเปิด + ล็อก อีกฝ่ายเลือกซ้ำไม่ได้ · บอทเลือกช้า-เร็วสุ่มต่างกันทุกเกม · จบเมื่อเลือกครบทั้งสองฝ่าย */
let godPickTimers = [];
function pickGodsSimul(cb) {
  godPickTimers.forEach(t => { clearTimeout(t); clearInterval(t); }); godPickTimers = [];
  const st = S, order = FACTS.slice().sort(() => Math.random() - 0.5); // ตำแหน่ง → เทพ (ผู้เล่นมองไม่เห็น)
  const taken = {}; let pPick = null, bPick = null, left = 30;
  const botDelay = 800 + Math.pow(Math.random(), 2) * 9000; // เร็วสุด ~0.8 วิ ช้าสุด ~10 วิ (ส่วนใหญ่ค่อนมาทางเร็ว-กลาง)
  const title = $('god-modal-title'), hint = document.querySelector('#god-modal .modal-hint');
  const setTitle = () => { title.textContent = 'เลือกเทพประจำตัว' + (pPick === null ? ` · ⏱ ${left}` : ''); };
  hint.textContent = 'การ์ดทุกใบคว่ำอยู่ — เลือกพร้อมกับศัตรู ใบที่ถูกเลือกแล้วจะเลือกซ้ำไม่ได้';
  $('god-list').innerHTML = order.map((_, i) =>
    `<div class="gcard" data-i="${i}"><div class="gc-inner"><div class="gc-back">✦</div><div class="gc-front"></div></div><span class="gc-owner"></span></div>`).join('');
  $('god-modal').classList.remove('hidden'); setTitle();
  const reveal = (i, s) => {
    taken[i] = s;
    const el = $('god-list').children[i];
    el.querySelector('.gc-front').innerHTML = godCardHTML(order[i]); // ใส่หน้าการ์ดตอนเปิดเท่านั้น (ใบที่ยังคว่ำไม่มีข้อมูลเทพใน DOM)
    el.querySelector('.gc-owner').textContent = s === 'p' ? 'ผู้เล่น' : 'ศัตรู';
    el.classList.add('taken', s === 'p' ? 'mine' : 'foe');
    void el.offsetWidth; el.classList.add('flip');
  };
  const free = () => order.map((_, i) => i).filter(i => !(i in taken));
  const check = () => {
    if (pPick !== null) hint.textContent = bPick === null ? 'รอศัตรูเลือกเทพ...' : 'ทั้งสองฝ่ายเลือกเทพแล้ว';
    if (pPick === null || bPick === null) return;
    godPickTimers.push(setTimeout(() => {
      if (S !== st) return;
      $('god-modal').classList.add('hidden'); cb(order[pPick], order[bPick]);
    }, 1700)); // รอให้ดูการ์ดที่พลิกครู่หนึ่งก่อนปิดหน้าต่าง
  };
  const playerPick = i => { if (pPick !== null || i in taken) return; pPick = i; reveal(i, 'p'); setTitle(); check(); };
  $('god-list').onclick = e => {
    if (holdShown) { holdShown = false; return; }
    const el = e.target.closest('.gcard'); if (el) playerPick(+el.dataset.i);
  };
  godPickTimers.push(setTimeout(() => { // บอทเลือก (ไม่รู้ว่าใบไหนคืออะไรเหมือนกัน → สุ่มจากใบที่ยังว่าง)
    if (S !== st || bPick !== null) return;
    const f = free(); if (!f.length) return;
    bPick = rnd(f); reveal(bPick, 'b'); check();
  }, botDelay));
  godPickTimers.push(setInterval(() => { // หมดเวลา → สุ่มให้ผู้เล่น
    if (S !== st || pPick !== null) return;
    left--; setTitle();
    if (left <= 0) { const f = free(); if (f.length) playerPick(rnd(f)); }
  }, 1000));
}
function pickGod(title, cb) {
  $('god-modal-title').textContent = title;
  document.querySelector('#god-modal .modal-hint').textContent = 'กดค้างที่การ์ดเพื่ออ่านความสามารถ · คลิกเพื่อเลือก';
  $('god-list').innerHTML = FACTS.map(godCardHTML).join('');
  $('god-modal').classList.remove('hidden');
  $('god-list').onclick = e => {
    if (holdShown) { holdShown = false; return; } // กดค้างอ่านสกิล ไม่นับเป็นการเลือก
    const el = e.target.closest('.unit'); if (!el) return;
    $('god-modal').classList.add('hidden'); cb(el.dataset.k);
  };
}

/* ===== มือเริ่มต้น: สุ่มใหม่ (Mulligan) — ครั้งเดียวตอนเริ่มเกม ===== */
function redraw(s, idx) {
  idx.forEach(i => { S[s].hand[i] = randCard(); });
  if (idx.length) log(`${who(s)}สุ่มการ์ดใหม่ ${idx.length} ใบจากมือเริ่มต้น`, tag(s));
  else log(`${who(s)}เก็บมือเริ่มต้นไว้ทั้งหมด`, tag(s));
}
// บอท: เก็บแกนกลางไว้เสมอ · สุ่มใหม่ใบซ้ำ/สีที่มีเกิน 2 ใบ (อยากมีหลายสีให้ตรงโจทย์ง่าย) + บางทีสุ่มเพิ่มแบบไม่มีเหตุผล
function botMulligan() {
  const h = S.b.hand, cnt = {}, idx = [];
  h.forEach((c, i) => {
    if (c.pos === 'c') return;
    cnt[c.color] = (cnt[c.color] || 0) + 1;
    const dup = h.some((d, j) => j < i && d.color === c.color && d.pos === c.pos);
    if (dup || cnt[c.color] > 2 || Math.random() < 0.1) idx.push(i);
  });
  redraw('b', idx.slice(0, 3));
}
function mulligan() { // การ์ดคว่ำอยู่ก่อน แล้วพลิกเปิดทีละใบ → ค่อยให้เลือกสุ่มใหม่ + เริ่มนับเวลา
  return new Promise(res => {
    const sel = new Set(), shown = new Set(), st = S;
    const hand = S.p.hand;
    $('mull-list').innerHTML = hand.map((c, i) =>
      `<div class="mc" data-i="${i}"><div class="gc-inner"><div class="gc-back">✦</div>
        <div class="gc-front"><div class="magic-card ${c.color}">${cardHTML(c)}</div></div></div></div>`).join('');
    const upd = () => { $('mull-go').textContent = sel.size ? `สุ่มใหม่ ${sel.size} ใบ ▶` : 'เก็บไว้ทั้งหมด ▶'; };
    $('mull-list').onclick = e => {
      const el = e.target.closest('.mc'); if (!el) return;
      const i = +el.dataset.i; if (!shown.has(i)) return; // ใบที่ยังไม่พลิกเลือกไม่ได้
      sel.has(i) ? sel.delete(i) : sel.add(i);
      el.querySelector('.magic-card').classList.toggle('redraw', sel.has(i)); upd();
    };
    let left = 20, iv = null; // หมดเวลา = ยืนยันตามที่เลือกไว้ตอนนั้น (เริ่มนับหลังพลิกครบ)
    $('mull-go').onclick = () => {
      clearInterval(iv); timers.forEach(clearTimeout);
      redraw('p', [...sel]); $('mull-modal').classList.add('hidden'); render(); res();
    };
    const timers = [];
    upd(); $('mull-go').disabled = true; $('mull-timer').textContent = '';
    $('mull-modal').classList.remove('hidden');
    hand.forEach((_, i) => timers.push(setTimeout(() => { // พลิกเปิดทีละใบ
      const el = $('mull-list').children[i]; if (!el) return;
      el.classList.add('flip'); shown.add(i);
    }, 450 + i * 330)));
    timers.push(setTimeout(() => {
      if (S !== st) return;
      $('mull-go').disabled = false; $('mull-timer').textContent = `⏱ ${left}`;
      iv = setInterval(() => { left--; $('mull-timer').textContent = `⏱ ${left}`; if (left <= 0) $('mull-go').onclick(); }, 1000);
    }, 450 + hand.length * 330 + 500));
  });
}
/* ===== Start Phase ===== */
function startTurn(s) {
  const me = S[s], o = S[opp(s)];
  [...me.gods, ...me.heroes].forEach(u => { u.sick = false; u.used = false; if (u.cd > 0) u.cd--; });
  me.summons = 0; me.bonus = false; me.pushed = 0; me.dissolved = false; me.atkInf = 0;
  const under = beats(pk(opp(s)), pk(s));
  const target = under ? 6 : 5;
  while (me.hand.length < target) me.hand.push(randCard());
  log(`${who(s)}จั่วการ์ดครบ ${target} ใบ${under ? ' (แพ้ทาง: จั่วเพิ่ม +1!)' : ''}`, tag(s));
}

/* ===== Influence ===== */
function pushInf(s, n) {
  if (S.over) return;
  const a = Math.min(n, S.inf[opp(s)]);
  S.inf[s] += a; S.inf[opp(s)] -= a; S[s].pushed += a;
  if (S.inf.b <= 0) end('win', 'คุณดันแถบพลังจนศัตรูเหลือ 0 แต้ม!');
  else if (S.inf.p <= 0) end('lose', 'บอทดันแถบพลังจนคุณเหลือ 0 แต้ม');
}
function end(r, desc) {
  S.over = true;
  $('end-title').textContent = r === 'win' ? '🏆 คุณชนะ!' : r === 'lose' ? '💀 คุณแพ้' : '🤝 เสมอ';
  $('end-desc').textContent = desc; $('end-modal').classList.remove('hidden');
  log('จบเกม: ' + desc); render();
}

/* ===== Energy Phase ===== */
function gain(s, i) {
  const me = S[s], c = me.hand[i], ch = S.ch;
  if (!(c.pos === 'c' || c.color === ch.color)) return false;
  const g = c.color === ch.color && c.pos === ch.pos ? 2 : 1;
  discard(s, [i], g, `ทิ้งการ์ด ${GOD[c.color].c} ${SYM[c.pos]} รับ +${g} Energy`);
  return true;
}
function burn(s, idx) {
  discard(s, idx, 1, 'เผาการ์ดฉุกเฉิน 2 ใบ รับ +1 Energy');
}
function discard(s, idx, g, msg) {
  const me = S[s];
  idx.slice().sort((a, b) => b - a).forEach(i => {
    const src = s === 'p' ? document.querySelector(`#hand .magic-card[data-i="${i}"]`) : document.querySelector('#bar-enemy .sb-cards'); // จุดที่การ์ดพุ่งออกมา
    const from = src ? src.getBoundingClientRect() : null;
    const c = me.hand.splice(i, 1)[0];
    S.played[s].push({ color: c.color, pos: c.pos, g: idx.length > 1 ? 0 : g, burn: idx.length > 1, from, rot: (Math.random() - 0.5) * 14 }); // วางบนโต๊ะกลาง
    if (!me.awakened && !me.altar.includes(c.pos)) me.altar.push(c.pos);
  });
  me.e += g; log(`${who(s)}${msg} (Energy ${me.e})`, tag(s));
  if (!me.awakened && me.altar.length === 5) awaken(s);
}
function awaken(s) { // Awakening ได้ครั้งเดียวต่อเกม: Influence +2 + เปลี่ยนเทพฟรี (ไม่ได้ Energy)
  const me = S[s]; me.awakened = true; me.altar = POS.slice(); // แท่นค้างสว่างครบเป็นเครื่องหมายว่าใช้แล้ว
  log(`✨ ${who(s)}วงเวทย์สมบูรณ์ (Awakening)! Influence +2 · เปลี่ยนเทพฟรี (ใช้ได้ครั้งเดียวต่อเกม)`, 'sys');
  pushInf(s, 2);
  const setGod = key => {
    if (me.gods[0]) { me.gods[0].key = key; me.gods[0].cd = 0; } else me.gods.push(mkGod(key));
    log(`${who(s)}เปลี่ยนเป็น ${GOD[key].n}`, tag(s)); render();
  };
  if (s === 'p') pickGod('Awakening: เปลี่ยนฝ่ายเทพฟรี 1 ครั้ง', setGod);
  else setGod(FACTS.find(f => beats(f, pk('p'))) || rnd(FACTS));
}

/* ===== Hero Phase ===== */
function summon(s, key) {
  const me = S[s], h = HERO[key];
  if (me.e < h.cost || me.summons >= 2 || me.heroes.length >= 3) return false;
  if (!me.deck.includes(key)) return false; // ต้องอยู่ในเด็คฮีโร่ 8 ใบที่เลือกไว้
  if (me.heroes.some(x => x.key === key)) return false; // ร่ายฮีโร่ซ้ำตัวเดิมในฝั่งเดียวกันไม่ได้ (ต้องสลายตัวเดิมก่อน)
  me.e -= h.cost; me.summons++;
  me.heroes.push({ id: ++uid, type: 'hero', key, energy: HERO_E0, sick: true });
  log(`${who(s)}อัญเชิญ ${h.i} ${h.n} (จ่าย ${h.cost}E)`, tag(s));
  if (key === 'paladin' && me.gods[0]) {
    me.gods[0].energy = Math.min(5, me.gods[0].energy + 2);
    log(`✝️ เทพของ${who(s)}ได้รับ Energy +2 (เป็น ${me.gods[0].energy}/5)`, tag(s));
  }
  if (key === 'trickster' && pk(s) && S[opp(s)].gods[0]) {
    S[opp(s)].gods[0].key = BEAT[pk(s)];
    log(`🎭 เทพของ${who(opp(s))}ถูกเปลี่ยนเป็น ${GOD[pk(opp(s))].n}!`, tag(s));
  }
  return true;
}

/* ===== สลายฮีโร่ (Dissolve) =====
   ใช้ได้ใน Pick Up Hero / Battle Phase · 1 ครั้งต่อเทิร์น · ฮีโร่กลับคลัง · ได้ +1 Energy · Influence -1 (ให้ฝั่งตรงข้าม) */
function canDissolve(s) {
  const me = S[s]; // ห้ามสลายตัวสุดท้ายถ้าไม่มีเทพ (จะไม่เหลือยูนิตบนสนาม = แพ้ทันที)
  return !S.over && !me.dissolved && (S.phase === 2 || S.phase === 3) && me.heroes.length > 0 && (me.gods.length > 0 || me.heroes.length > 1);
}
// กฎกวาดล้าง: ฝั่งไหนไม่เหลือทั้งเทพและฮีโร่บนสนาม ฝั่งนั้นแพ้ทันที
function checkWipe() {
  if (S.over) return;
  for (const s of ['p', 'b']) {
    if (!S[s].gods.length && !S[s].heroes.length) {
      return end(s === 'p' ? 'lose' : 'win', s === 'p' ? 'ฝั่งคุณไม่เหลือเทพหรือฮีโร่บนสนาม' : 'ศัตรูไม่เหลือเทพหรือฮีโร่บนสนาม!');
    }
  }
}
function dissolve(s, h) {
  const me = S[s];
  if (!canDissolve(s) || !me.heroes.includes(h)) return false;
  me.heroes.splice(me.heroes.indexOf(h), 1);
  me.dissolved = true; me.e++;
  if (S.pending && S.pending.src === h) S.pending = null;
  log(`♻️ ${who(s)}สลาย ${HERO[h.key].i} ${HERO[h.key].n} กลับคลัง +1 Energy (Energy ${me.e}) แต่ Influence -1`, tag(s));
  pushInf(opp(s), 1); // ฝั่งตรงข้าม +1 / ฝั่งเรา -1
  return true;
}

/* ===== Battle Phase ===== */
function attack(s, t) {
  const me = S[s], o = S[opp(s)], isGod = t.type === 'god';
  const name = isGod ? GOD[t.key].n : HERO[t.key].n;
  if (S.turn === 1) { if (s === 'p') log('เทิร์นที่ 1 ยัด Energy / พลิกฝั่งไม่ได้ — ใช้ตั้งหลักก่อน', 'sys'); return false; }
  if (me.e < 1) return false;
  if (t.energy <= 0) { // พลิกฝั่ง
    if (!isGod && me.heroes.length >= 3) { log('ฝั่งเราฮีโร่เต็ม 3 ตัว พลิกไม่ได้', 'sys'); return false; }
    me.e--; (isGod ? o.gods : o.heroes).splice((isGod ? o.gods : o.heroes).indexOf(t), 1);
    t.energy = 1; t.sick = !isGod; t.cd = 0; (isGod ? me.gods : me.heroes).push(t);
    let g = isGod ? 4 : 2; if (me.gods.some(x => x.key === 'destruction')) g += 1; // พลิกเทพ +4 / ฮีโร่ +2 (เทพทำลายล้าง +1)
    log(`💥 ${who(s)}พลิกฝั่ง ${name}! Influence +${g}`, tag(s)); pushInf(s, g); checkWipe(); return true;
  }
  me.e--; let d = 1, b = '';
  if (isGod && !me.bonus && beats(pk(s), pk(opp(s)))) { d = 2; me.bonus = true; b = ` (โบนัสชนะทาง -2!)`; }
  t.energy = Math.max(0, t.energy - d);
  const got = me.atkInf < ATK_INF_CAP; // ได้ Influence +1/ครั้ง สูงสุด 3 แต้มต่อเทิร์น (ชาร์จฝั่งเราไม่ได้แต้ม)
  if (got) me.atkInf++;
  log(`${who(s)}ยัด Energy ใส่ ${name}ศัตรู${b} เหลือ ${t.energy}/5 (${got ? `Influence +1 [${me.atkInf}/${ATK_INF_CAP}]` : `ครบโควตา Influence ${ATK_INF_CAP} แต้ม/เทิร์นแล้ว ไม่ได้แต้ม`})`, tag(s));
  if (got) pushInf(s, 1);
  return true;
}
function charge(s, u) {
  const me = S[s]; if (me.e < 1 || u.energy >= 5) return false;
  me.e--; u.energy++;
  log(`${who(s)}ชาร์จ Energy ให้ ${u.type === 'god' ? GOD[u.key].n : HERO[u.key].n} เป็น ${u.energy}/5`, tag(s)); return true;
}
const uname = u => (u.type === 'god' ? GOD[u.key].n : HERO[u.key].n);
// เป้าหมายที่เลือกได้ของสกิลฮีโร่ (เฉพาะชนิดที่ต้องเลือกเป้า)
function skillTargets(s, h) {
  const H = HERO[h.key], me = S[s], o = S[opp(s)];
  if (H.t === 'ally') return [...me.gods, ...me.heroes].filter(u => u !== h && u.energy < 5);
  if (H.t === 'eh') return o.heroes.filter(u => u.energy > 0);
  if (H.t === 'eu') return [...o.gods, ...o.heroes].filter(u => u.energy > 0);
  return [];
}
// ฮีโร่ตัวนี้ใช้สกิลได้ตอนนี้ไหม (ไม่ให้เสียสกิลเปล่า)
function skillUsable(s, h) {
  const H = HERO[h.key], me = S[s], o = S[opp(s)];
  if (!H.t || h.sick || h.used || h.energy < H.sc) return false; // สกิลฮีโร่ใช้ได้ 1 ครั้ง/เทิร์น
  if (H.t === 'ally' || H.t === 'eh' || H.t === 'eu') return skillTargets(s, h).length > 0;
  if (h.key === 'apprentice') return me.hand.length < 8;
  if (h.key === 'bard') return me.heroes.some(x => x !== h && x.energy < 5);
  if (h.key === 'mage') return o.heroes.some(x => x.energy > 0);
  return true;
}
function heroSkill(s, h, t) {
  if (!skillUsable(s, h)) return false;
  const H = HERO[h.key], me = S[s], o = S[opp(s)];
  if (H.t !== 'self' && !skillTargets(s, h).includes(t)) return false;
  h.energy -= H.sc; h.used = true;
  const say = m => log(`${who(s)}ใช้สกิล ${H.i} ${H.n}: ${m}`, tag(s));
  switch (h.key) {
    case 'knight': case 'paladin': say('Influence +1'); pushInf(s, 1); break;
    case 'apprentice': me.hand.push(randCard()); say('จั่วการ์ด 1 ใบ'); break;
    case 'medic': t.energy = Math.min(5, t.energy + 1); say(`เติม Energy ให้ ${uname(t)} เป็น ${t.energy}/5`); break;
    case 'guardian': t.energy = Math.min(5, t.energy + 2); say(`เติม Energy ให้ ${uname(t)} เป็น ${t.energy}/5`); break;
    case 'stalker': t.energy = Math.max(0, t.energy - 2); say(`ลด Energy ${uname(t)}ศัตรูเหลือ ${t.energy}/5`); break;
    case 'archer': t.energy--; say(`ยิง ${uname(t)}ศัตรู เหลือ ${t.energy}/5 (Influence +1)`); pushInf(s, 1); break;
    case 'bard': me.heroes.forEach(x => { if (x !== h) x.energy = Math.min(5, x.energy + 1); }); say('ฮีโร่ฝ่ายเราตัวอื่นทุกตัว +1 Energy'); break;
    case 'thief': t.energy--; me.e++; say(`ดูด Energy จาก ${uname(t)}ศัตรู (เหลือ ${t.energy}/5) เราได้ +1 Energy`); break;
    case 'mage': o.heroes.forEach(x => { x.energy = Math.max(0, x.energy - 1); }); say('ฮีโร่ศัตรูทุกตัวถูกลด Energy -1'); break;
    case 'dragon': t.energy = Math.max(0, t.energy - 2); say(`พ่นไฟใส่ ${uname(t)}ศัตรู เหลือ ${t.energy}/5 (Influence +1)`); pushInf(s, 1); break;
    default: h.energy += H.sc; h.used = false; return false;
  }
  return true;
}
function godSkill(s, g) {
  const me = S[s]; if (g.cd > 0 || g.energy < 1) return false;
  if (g.key === 'creation') { if (me.hand.length >= 8) return false; me.hand.push({ color: rnd(FACTS), pos: 'c' }); }
  else if (g.key === 'life') { me.heroes.forEach(h => (h.energy = Math.min(5, h.energy + 1))); }
  else return false;
  g.energy--; g.cd = 3;
  log(`${who(s)}ใช้สกิล ${GOD[g.key].n}`, tag(s));
  return true;
}

/* ===== End Phase ===== */
function endTurn(s) {
  const me = S[s];
  if (me.gods.some(g => g.key === 'death') && me.pushed >= 3) { log(`💀 ${who(s)}ดูดแต้มเพิ่ม +1`, tag(s)); pushInf(s, 1); }
  const keep = Math.min(me.e, 1);
  log(`${who(s)}จบเทิร์น เก็บ Energy ทบไป ${keep}`, tag(s)); me.e = keep;
}
async function nextPhase() {
  if (S.busy || S.over || S.side !== 'p' || S.botEn) return;
  S.mode = null; S.pending = null; S.burn = false; S.sel = []; S.arm = null;
  if (S.phase === 1) { // ออกจาก Energy Phase → ฝั่งที่ได้เล่นก่อนทำ Pick Up Hero / Battle / End ก่อน
    if (S.first === 'b') { await botMain(); if (S.over) return; S.side = 'p'; S.busy = false; }
    S.phase = 2; return render();
  }
  if (S.phase < 3) { S.phase++; return render(); }
  S.phase = 4; endTurn('p'); render(); if (S.over) return;
  if (S.first === 'p') { await botMain(); if (S.over) return; }
  await finishTurn();
}
// จบเทิร์น: เช็กจบเกมที่เทิร์น 12 หรือขึ้นเทิร์นใหม่ (สลับผู้เล่นคนแรก)
async function finishTurn() {
  if (S.over) return;
  if (S.turn >= 12) {
    const d = S.inf.p - S.inf.b;
    return end(d > 0 ? 'win' : d < 0 ? 'lose' : 'draw', `จบเทิร์น 12 | ผู้เล่น ${S.inf.p} : ${S.inf.b} บอท`);
  }
  S.turn++; await beginTurn();
}

/* ===== AI บอท =====
   หมายเหตุ: เมื่อเพิ่ม/แก้ระบบเกมใหม่ (ฮีโร่ สกิล กติกา) ต้องอัปเดตบอทให้ใช้ระบบนั้นได้ด้วยเสมอ */
// สนามเต็ม 3 ช่อง + มีฮีโร่ใกล้โดนยึด (Energy ≤ 1, ไม่ใช่ตัวที่เพิ่งลงสนาม) → สลายเพื่อเปิดช่อง/เก็บ Energy
function botDissolve() {
  const me = S.b;
  if (!canDissolve('b') || me.heroes.length < 3) return false;
  const w = me.heroes.filter(h => !h.sick && h.energy <= 1).sort((a, b) => a.energy - b.energy)[0];
  return w ? dissolve('b', w) : false;
}
/* --- ตัวช่วยของบอท ---
   บอทตัดสินใจแบบ "ให้คะแนนทุกตัวเลือก + สุ่มรบกวน + นิสัยประจำเกม (S.botStyle)" แทนกฎตายตัว
   จึงเดาทางยาก และเล่นต่างกันในแต่ละเกม (ดุ/ระวัง/ชอบเก็บของ) */
const jit = (v, amp = 0.3) => v * (1 + (Math.random() - 0.5) * 2 * amp) + Math.random() * 2;
// Energy ที่ต้องใช้เพื่อ "ยัดจนเหลือ 0 แล้วพลิก" ยูนิต t (นับโบนัสชนะทางของเทพ) = จำนวนครั้งที่ยัด + 1
function planCost(t, bonus) {
  let e = t.energy, n = 0;
  while (e > 0) { e = Math.max(0, e - (bonus ? 2 : 1)); bonus = false; n++; }
  return n + 1;
}
// Energy Phase ของบอท: ทิ้งการ์ดรับ Energy "พร้อมกับผู้เล่น" (เริ่มทันทีที่เข้า Energy Phase)
async function botEnergy() {
  const st = S, me = S.b, skip = new Set();
  S.botEn = true; render();
  await think(500, 1200);
  for (let g = 0; g < 10 && S === st && !S.over; g++) {
    // ให้คะแนนการ์ดที่เล่นได้ (ตรงสีโจทย์ หรือแกนกลาง): ตรงตำแหน่งด้วยได้ +2 / เติมช่องแท่นที่ยังขาดมีค่า / แกนกลางเก็บไว้เป็นไวลด์การ์ดได้
    let best = -1, bs = -1e9;
    me.hand.forEach((c, i) => {
      if (skip.has(c) || !(c.pos === 'c' || c.color === S.ch.color)) return;
      let sc = 1 + (c.color === S.ch.color && c.pos === S.ch.pos ? 6 : 0) + (!me.awakened && !me.altar.includes(c.pos) ? 3 : 0);
      if (c.pos === 'c') sc += me.altar.includes('c') || me.awakened ? -2 : 2;
      sc = jit(sc, .5);
      if (sc > bs) { bs = sc; best = i; }
    });
    if (best < 0) break;
    const c = me.hand[best];
    if (c.pos === 'c' && !(c.color === S.ch.color && c.pos === S.ch.pos) && (me.awakened || me.altar.includes('c')) && Math.random() < 0.4) { skip.add(c); continue; } // เก็บไวลด์การ์ดไว้ก่อนบ้าง
    gain('b', best); render(); await think(800, 1700, .12);
  }
  if (S !== st) return;
  const dead = me.hand.map((c, i) => (c.color !== S.ch.color && c.pos !== 'c' ? i : -1)).filter(i => i >= 0);
  if (!S.over && me.e < 3 && dead.length >= 2 && Math.random() < 0.85) {
    dead.sort((a, b) => (me.awakened || me.altar.includes(me.hand[a].pos) ? 1 : 0) - (me.awakened || me.altar.includes(me.hand[b].pos) ? 1 : 0) + (Math.random() - 0.5)); // เผาใบที่เติมช่องแท่นก่อน
    burn('b', dead.slice(0, 2)); render(); await think(900, 1700, .1);
  }
  if (S !== st) return;
  S.botEn = false; render();
}
// เลือกฮีโร่ที่จะอัญเชิญ: ให้คะแนนตามสถานการณ์ + สุ่ม · บางครั้งเก็บ Energy ไว้พลิกแทน · คืน null = ไม่ร่าย
function botPickHero() {
  const me = S.b, o = S.p, st = S.botStyle;
  if (me.heroes.length >= 3) return null;
  const reserve = Math.random() < 0.4 * st.cau ? 2 : 1;
  const opts = Object.keys(HERO).filter(k => me.deck.includes(k) && HERO[k].cost <= me.e - reserve && !me.heroes.some(x => x.key === k));
  if (!opts.length) return null;
  const theirs = [...o.gods, ...o.heroes];
  const bonusOK = !me.bonus && beats(pk('b'), pk('p'));
  const canFlipNow = S.turn > 1 && me.heroes.length > 0 && theirs.some(t => planCost(t, t.type === 'god' && bonusOK) <= me.e);
  if (canFlipNow && Math.random() < 0.65) return null; // มีจังหวะพลิกอยู่ → เก็บ Energy ไว้ก่อน
  const mine = [...me.gods, ...me.heroes], low = mine.filter(u => u.energy <= 2).length, eh = o.heroes.length;
  const w = {
    knight: 10, apprentice: me.hand.length <= 3 ? 11 : 5, medic: 4 + 3 * low, guardian: 7 + 3 * low,
    stalker: eh ? 8 + 3 * eh : 0, archer: 11, bard: me.heroes.length >= 2 ? 10 : 2, thief: 9,
    trickster: me.gods[0] && o.gods[0] && pk('p') !== BEAT[pk('b')] ? 18 : 0,
    mage: eh >= 2 ? 15 : 3, paladin: me.gods[0] && me.gods[0].energy <= 3 ? 13 : 6, dragon: 13
  };
  const sc = opts.map(k => ({ k, s: jit((w[k] ?? 5) * (1 + 0.05 * HERO[k].cost), 0.4) * (0.8 + st.greed * 0.4) })).filter(x => x.s > 2).sort((a, b) => b.s - a.s);
  if (!sc.length) return null;
  return (sc.length > 1 && Math.random() < 0.25 ? sc[1] : sc[0]).k; // บางทีเลือกอันดับสอง
}
// ช่วงหลัก Energy Phase ของเทิร์นบอท (Pick Up Hero → Battle → End) — ทำก่อนหรือหลังผู้เล่นตามผลสุ่ม S.first
async function botMain() {
  S.busy = true; S.side = 'b'; S.phase = 2; render(); await think(900, 1800, .1);
  // Pick Up Hero Phase
  if (botDissolve()) { render(); await think(1100, 2200, .2); }
  for (let g = 0; g < 2 && !S.over; g++) {
    const k = botPickHero(); // ไม่ร่ายซ้ำตัวที่มีอยู่ (กรองในฟังก์ชัน)
    if (!k) break;
    summon('b', k); render(); await think(1200, 2600, .25);
  }
  // Battle Phase
  S.phase = 3; render();
  for (let n = 0; n < 14 && !S.over; n++) {
    if (!botAct()) break; render(); await think(1100, 2600, .2);
  }
  if (S.over) return;
  // End Phase
  S.phase = 4; endTurn('b'); render(); await think(800, 1500, 0);
}
// Battle Phase ของบอท: รวมทุกการกระทำที่ทำได้ → ให้คะแนน (+สุ่มรบกวน × นิสัยประจำเกม) → ทำอันที่คะแนนสูงสุด แล้วคิดใหม่ทุกครั้ง
function botAct() {
  const me = S.b, o = S.p, st = S.botStyle;
  if (botDissolve()) return true; // สนามเต็มและมีฮีโร่เหลือ 1 Energy → สลายก่อนโดนยึด
  const mine = [...me.gods, ...me.heroes], theirs = [...o.gods, ...o.heroes];
  const cand = [];
  const foeE = o.e + 2; // คาดว่าผู้เล่นมี Energy เท่านี้ตอนมาโจมตีเรา
  const danger = u => foeE >= planCost(u, u.type === 'god' && beats(pk('p'), pk('b'))); // ยูนิตเรากำลังเสี่ยงโดนพลิกไหม
  const lastOne = theirs.length === 1; // พลิกตัวสุดท้ายของผู้เล่น = ชนะทันที (กฎกวาดล้าง)
  const bonusOK = !me.bonus && beats(pk('b'), pk('p'));

  if (S.turn > 1 && me.e >= 1) {
    for (const t of theirs) {
      const slotOK = t.type === 'god' || me.heroes.length < 3;
      if (t.energy <= 0) { // พลิกฝั่ง
        if (!slotOK) continue;
        cand.push({ sc: jit((t.type === 'god' ? 100 : 55) + (lastOne ? 500 : 0), .15), run: () => attack('b', t) });
      } else {
        const finish = slotOK && me.e >= planCost(t, t.type === 'god' && bonusOK); // จบได้ในเทิร์นนี้ → ทุ่มยัดตัวนี้
        const sc = finish ? (t.type === 'god' ? 80 : 40) + (lastOne ? 300 : 0)
                          : (me.atkInf < ATK_INF_CAP ? 14 : 4) + (t.energy <= 2 ? 6 : 0) + (t.type === 'god' ? 3 : 0); // ยัดเก็บแต้ม Influence (สูงสุด 3/เทิร์น)
        cand.push({ sc: jit(sc * st.aggr), run: () => attack('b', t) });
      }
    }
  }
  if (me.e >= 1) { // ชาร์จ: ไม่ได้แต้ม Influence จึงทำเมื่อจำเป็นเท่านั้น
    for (const u of mine) {
      if (u.energy >= 5) continue;
      const sc = danger(u) ? (u.type === 'god' ? 55 : 35) + (mine.length === 1 ? 30 : 0) : u.energy <= 2 ? 12 : 2;
      cand.push({ sc: jit(sc * st.cau), run: () => charge('b', u) });
    }
  }
  for (const g of me.gods) { // สกิลเทพ (เหลือ Energy ให้ตัวเองอย่างน้อย 1)
    if (g.cd > 0 || g.energy < 2) continue;
    if (g.key === 'creation' && me.hand.length < 8) cand.push({ sc: jit(9), run: () => godSkill('b', g) });
    if (g.key === 'life' && me.heroes.some(h => h.energy < 5)) cand.push({ sc: jit(7 + 4 * me.heroes.length), run: () => godSkill('b', g) });
  }
  const base = { knight: 14, paladin: 14, apprentice: 8, medic: 9, guardian: 12, stalker: 15, archer: 16, bard: 11, thief: 15, mage: 20, dragon: 22 };
  for (const h of me.heroes) { // สกิลฮีโร่ (เหลือ Energy ให้ตัวเองอย่างน้อย 1)
    const H = HERO[h.key];
    if (h.energy <= H.sc || !skillUsable('b', h)) continue;
    let sc = base[h.key] || 8;
    if (H.t === 'self') {
      if (h.key === 'mage' && o.heroes.filter(x => x.energy > 0).length < 2) sc = 10;
      cand.push({ sc: jit(sc), run: () => heroSkill('b', h) }); continue;
    }
    let c = skillTargets('b', h);
    if (H.t === 'ally') c = c.filter(m => m.energy <= 3 || danger(m));
    if (!c.length) continue;
    c.sort((x, y) => (H.t === 'ally' ? (danger(y) - danger(x)) : 0) || (H.pick === 'high' ? y.energy - x.energy : x.energy - y.energy));
    const t = Math.random() < 0.2 ? rnd(c) : c[0]; // บางทีเลือกเป้าหมายอื่นเพื่อให้เดายาก
    if (H.t === 'ally' && danger(t)) sc += 12;
    cand.push({ sc: jit(sc), run: () => heroSkill('b', h, t) });
  }
  cand.sort((a, b) => b.sc - a.sc);
  for (const c of cand) if (c.sc > 3 && c.run()) return true;
  return false;
}

/* ===== ปฏิสัมพันธ์ของผู้เล่น ===== */
function targets() {
  const t = new Set();
  if (S.side !== 'p' || S.phase !== 3 || S.busy || S.over) return t;
  const me = S.p, o = S.b, mine = [...me.gods, ...me.heroes];
  if (S.pending) {
    skillTargets('p', S.pending.src).forEach(u => t.add(u.id));
  } else if (S.mode === 'attack' && me.e >= 1 && S.turn > 1) [...o.gods, ...o.heroes].forEach(u => { if (u.type === 'god' || u.energy > 0 || me.heroes.length < 3) t.add(u.id); });
  else if (S.mode === 'charge' && me.e >= 1) mine.filter(u => u.energy < 5).forEach(u => t.add(u.id));
  else if (S.mode === 'hero-skill') me.heroes.filter(h => skillUsable('p', h)).forEach(h => t.add(h.id));
  else if (S.mode === 'god-skill') me.gods.filter(g => g.cd === 0 && g.energy >= 1 && (g.key === 'creation' || g.key === 'life')).forEach(g => t.add(g.id));
  return t;
}
function onUnit(id) {
  if (!targets().has(id)) return;
  const me = S.p, o = S.b, all = [...me.gods, ...me.heroes, ...o.gods, ...o.heroes], u = all.find(x => x.id === id);
  if (S.pending) { heroSkill('p', S.pending.src, u); S.pending = null; }
  else if (S.mode === 'attack') attack('p', u);
  else if (S.mode === 'charge') charge('p', u);
  else if (S.mode === 'god-skill') godSkill('p', u);
  else if (S.mode === 'hero-skill') {
    if (HERO[u.key].t === 'self') heroSkill('p', u);
    else { S.pending = { kind: u.key, src: u }; log(`เลือกเป้าหมายสำหรับสกิล ${HERO[u.key].n}`); }
  }
  render();
}
function onCard(i) {
  if (S.busy || S.over || S.side !== 'p' || S.phase !== 1) return;
  const c = S.p.hand[i];
  if (S.burn) {
    if (c.pos === 'c' || c.color === S.ch.color) return log('การ์ดใบนี้ตรงโจทย์อยู่แล้ว ใช้แปลง Energy ปกติได้');
    S.sel = S.sel.includes(i) ? S.sel.filter(x => x !== i) : [...S.sel, i];
    if (S.sel.length === 2) { burn('p', S.sel); S.sel = []; S.burn = false; }
  } else if (!gain('p', i)) log('การ์ดไม่ตรงสีโจทย์ (ถ้ามือเน่า กด "เผาการ์ด" เลือก 2 ใบ)');
  render();
}
function openHeroes() {
  const ok = S.side === 'p' && S.phase === 2 && !S.busy && !S.over;
  $('hero-modal-note').textContent = (ok ? 'อัญเชิญได้สูงสุด 2 ตัว/เทิร์น · ลงสนามพร้อมกันได้ 3 ตัว' : 'อัญเชิญได้เฉพาะ Pick Up Hero Phase')
    + ' · ร่ายตัวซ้ำไม่ได้ (ต้องสลายตัวเดิมก่อน) · สกิลฮีโร่ใช้ได้ 1 ครั้ง/เทิร์น ·กดค้างที่การ์ดเพื่ออ่านสกิล · เลื่อนซ้าย-ขวาเพื่อดูฮีโร่ทั้งหมด';
  $('hero-list').innerHTML = S.p.deck.map(k => {
    const h = HERO[k], e0 = HERO_E0, onField = S.p.heroes.some(x => x.key === k);
    const dis = !ok || onField || S.p.e < h.cost || S.p.summons >= 2 || S.p.heroes.length >= 3;
    return `<div class="unit ${dis ? 'disabled' : ''}" data-k="${k}"><span class="cost">⚡${h.cost}</span>
      <div class="icon">${h.i}</div><div class="name">${h.n}</div>
      <div class="pips">${'●'.repeat(e0)}${'○'.repeat(5 - e0)}</div><div class="tag">${onField ? 'อยู่ในสนามแล้ว' : 'ค่าร่าย ' + h.cost + 'E'}</div></div>`;
  }).join('');
  $('hero-list').scrollLeft = 0;
  $('hero-modal').classList.remove('hidden');
}

/* ===== Render ===== */
const unitHTML = (u, tg, canD, fk) => { // fk = สายเทพของฝั่งที่ฮีโร่อยู่ (ใช้กำหนดสีกรอบรอบนอกของฮีโร่)
  const god = u.type === 'god', d = god ? GOD[u.key] : HERO[u.key];
  const st = god ? (u.cd > 0 ? `CD ${u.cd}` : 'พร้อมใช้') : (u.sick ? 'เพิ่งลงสนาม' : u.used ? 'ใช้สกิลแล้ว' : 'พร้อมใช้');
  const armed = S.arm === u.id;
  const dis = canD ? `<button class="dissolve-btn ${armed ? 'armed' : ''}" data-dissolve="${u.id}" title="สลายฮีโร่ (Dissolve): ฮีโร่กลับคลัง +1 Energy แต่ Influence -1 (1 ครั้ง/เทิร์น)">${armed ? 'ยืนยัน?' : '♻ สลาย'}</button>` : '';
  return `<div class="unit ${god ? 'god ' + u.key : fk ? 'fr fr-' + fk : ''} ${u.sick ? 'sick' : ''} ${tg.has(u.id) ? 'targetable' : ''}" data-id="${u.id}">${dis}${god ? ORN : ''}
    <div class="icon">${d.i}</div><div class="name">${d.n}</div>
    <div class="pips">${'●'.repeat(u.energy)}${'○'.repeat(5 - u.energy)}</div>
    <div class="skill">${d.d}</div><div class="tag">${st}</div></div>`;
};
const cardHTML = c => `<span class="cp" title="ตำแหน่งบนแท่นวงเวทย์">${SYM[c.pos]}</span><span class="icon">${GOD[c.color].i}</span><span class="cn">${GOD[c.color].c}</span>`;
/* ===== อนิเมชันเสริม (FX) — แค่แปะ class ให้ของที่ "เพิ่งเปลี่ยน" เท่านั้น ไม่กระทบกติกา =====
   (CSS อยู่ใต้ body.fx ใน style.css) */
const fx = { seen: new Map(), hand: 0, phase: '', inf: { p: null, b: null } };
const fxBannerEl = document.createElement('div'); fxBannerEl.id = 'phase-banner'; document.body.appendChild(fxBannerEl);
function fxReset() { fx.seen.clear(); fx.hand = 0; fx.phase = ''; fx.inf = { p: null, b: null }; }
function fxRender() {
  // ยูนิต: ลงสนาม / Energy ลด (โดนยัด) / Energy เพิ่ม
  const cur = new Set();
  document.querySelectorAll('#arena .unit[data-id]').forEach(el => {
    const z = el.closest('[id$="-god"], [id$="-heroes"]'), key = el.dataset.id + '@' + (z ? z.id : '');
    const en = ((el.querySelector('.pips') || {}).textContent || '').split('●').length - 1, prev = fx.seen.get(key);
    if (prev === undefined) el.classList.add('fx-in');
    else if (en < prev) el.classList.add('fx-hit');
    else if (en > prev) el.classList.add('fx-up');
    fx.seen.set(key, en); cur.add(key);
  });
  fx.seen.forEach((_, k) => { if (!cur.has(k)) fx.seen.delete(k); }); // ยูนิตที่หายไป/เปลี่ยนฝั่ง → นับเป็นมาใหม่ถ้ากลับมา
  // มือ: ไพ่ที่เพิ่มใหม่ไหลเข้าทีละใบ
  const hc = document.querySelectorAll('#hand .magic-card');
  if (hc.length > fx.hand) hc.forEach((el, i) => { if (i >= fx.hand) { el.classList.add('fx-deal'); el.style.animationDelay = (i - fx.hand) * 70 + 'ms'; } });
  fx.hand = hc.length;
  // แต้ม Influence เด้งเมื่อเปลี่ยน
  [['p', 'inf-player'], ['b', 'inf-enemy']].forEach(([s, id]) => {
    if (fx.inf[s] !== null && fx.inf[s] !== S.inf[s]) { const el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    fx.inf[s] = S.inf[s];
  });
  // ป้ายเปลี่ยนเฟส (เทิร์นใหม่ · เฟสของผู้เล่น · ตาศัตรู)
  const t = S.over ? '' : S.phase === 0 ? `เทิร์น ${S.turn}` : S.side === 'p' && !S.busy && S.phase <= 3 ? `${PH[S.phase]} Phase` : S.side === 'b' && S.phase === 2 ? 'ตาศัตรู' : '';
  const key = t && `${S.turn}-${S.phase}-${S.side}`;
  if (key && key !== fx.phase) {
    fx.phase = key; fxBannerEl.textContent = t;
    fxBannerEl.classList.remove('show'); void fxBannerEl.offsetWidth; fxBannerEl.classList.add('show');
  }
}
// การ์ดที่เล่นไปแล้ว: วางเป็นการ์ดจริงบนโต๊ะกลาง (เพิ่มเฉพาะใบใหม่ + อนิเมชันพุ่งจากมือ/แถบศัตรู ไม่วาดซ้ำทั้งหมด)
function syncPlayed() {
  ['p', 'b'].forEach(s => {
    const box = $('played-' + s), list = S.played[s];
    if (list.length < box.children.length) box.innerHTML = '';
    for (let i = box.children.length; i < list.length; i++) {
      const c = list[i], el = document.createElement('div');
      el.className = `magic-card ${c.color} ${c.g === 2 ? 'perfect' : ''} ${c.burn ? 'burnt' : ''}`;
      el.innerHTML = cardHTML(c) + (c.burn ? '<span class="pl-burn">🔥</span>' : c.g ? `<span class="pl-g">+${c.g}</span>` : '');
      box.appendChild(el);
      const to = el.getBoundingClientRect();
      el.style.transform = `rotate(${c.rot}deg)`;
      if (c.from && to.width && el.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const dx = c.from.left + c.from.width / 2 - (to.left + to.width / 2), dy = c.from.top + c.from.height / 2 - (to.top + to.height / 2);
        const sc = Math.max(0.3, Math.min(1.2, c.from.width / to.width));
        el.animate([
          { transform: `translate(${dx}px, ${dy}px) scale(${sc}) rotate(${-c.rot * 4}deg)`, opacity: .85 },
          { transform: `rotate(${c.rot}deg)`, opacity: 1 }
        ], { duration: 520, easing: 'cubic-bezier(.2,.8,.25,1)' });
      }
    }
  });
}
function render() {
  const tg = targets();
  const canD = S.side === 'p' && !S.busy && canDissolve('p'); // แสดงปุ่มสลายบนฮีโร่ผู้เล่น
  if (!canD) S.arm = null;
  $('turn-num').textContent = S.turn;
  $('phase-name').textContent = (S.side === 'b' ? 'บอท · ' : '') + PH[S.phase] + (S.phase <= 1 ? ' · ทั้งสองฝ่าย' : '');
  $('first-name').textContent = S.first === 'p' ? 'ผู้เล่น' : 'บอท';
  const atk = document.querySelector('.mode-btn[data-mode="attack"]'); // เทิร์น 1 ยัด Energy ใส่ศัตรูไม่ได้
  atk.disabled = S.turn === 1; atk.textContent = S.turn === 1 ? '⚔️ ยัด Energy (เทิร์น 1 ใช้ไม่ได้)' : '⚔️ ยัด Energy ใส่ศัตรู';
  $('gauge-player').style.width = (S.inf.p / 30) * 100 + '%';
  $('gauge-enemy').style.width = (S.inf.b / 30) * 100 + '%';
  $('phase-timer').style.left = (S.inf.p / 30) * 100 + '%'; // ตัวนับเวลาคาบรอยต่อฟ้า/แดง
  $('inf-player').textContent = S.inf.p; $('inf-enemy').textContent = S.inf.b;
  $('challenge').className = 'magic-card ' + S.ch.color; $('challenge').innerHTML = cardHTML(S.ch);
  $('challenge-wrap').classList.toggle('hidden', S.phase !== 1 || S.over); // โชว์เฉพาะ Energy Phase
  // หน้าต่างการ์ดที่แต่ละฝ่ายเล่นไป (ใต้โจทย์วงเวทย์)
  syncPlayed();
  syncTimer();
  // แถบผู้เล่นใต้โซน: รูป · Energy · ไพ่คว่ำ (ไม่เปิดเผยไพ่บนมือ เห็นแค่จำนวน)
  [['b', 'enemy', '🤖', 'ศัตรู (บอท)'], ['p', 'player', '🧑', 'ผู้เล่น']].forEach(([s, n, av, nm]) => {
    const h = S[s].hand.length;
    $('bar-' + n).innerHTML = `<span class="avatar">${av}</span><span class="sb-name">${nm}</span>
      <span class="sb-energy">⚡ Energy <b>${S[s].e}</b></span>
      <span class="sb-cards" title="ไพ่บนมือ ${h} ใบ"><span class="backs">${'<i class="back"></i>'.repeat(Math.min(h, 10))}</span><span class="cnt">×${h}</span></span>`;
  });
  [['b', 'enemy'], ['p', 'player']].forEach(([s, n]) => {
    $(n + '-god').innerHTML = S[s].gods.map(g => unitHTML(g, tg)).join('') || '<div class="tag">ไม่มีเทพ</div>';
    $(n + '-heroes').innerHTML = S[s].heroes.map(h => unitHTML(h, tg, s === 'p' && canD, pk(s))).join('');
  });
  document.querySelectorAll('.altar-slot').forEach(el => el.classList.toggle('lit', S.p.altar.includes(el.dataset.pos)));
  $('hand').innerHTML = S.p.hand.map((c, i) => {
    const m = S.phase === 1 && S.side === 'p' && (c.pos === 'c' || c.color === S.ch.color);
    return `<div class="magic-card ${c.color} ${m ? 'match' : ''} ${S.sel.includes(i) ? 'selected' : ''}" data-i="${i}">${cardHTML(c)}</div>`;
  }).join('');
  fxRender();
  $('energy-num').textContent = S.p.e;
  const mine = S.side === 'p' && !S.busy && !S.over;
  $('btn-phase').disabled = !mine || !!S.botEn; // รอบอทเล่นการ์ด Energy Phase ให้เสร็จก่อน
  $('btn-phase').textContent = S.botEn ? 'ศัตรูกำลังเล่นการ์ด...' : S.phase === 3 ? 'จบเทิร์น ▶' : 'Next Phase ▶';
  $('btn-burn').disabled = !(mine && S.phase === 1); $('btn-burn').textContent = S.burn ? '🔥 เลือกการ์ดที่ 2 ใบ...' : '🔥 เผาการ์ด (เลือก 2)';
  $('mode-bar').classList.toggle('hidden', !(mine && S.phase === 3));
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === S.mode));
}

/* ===== กดค้างที่การ์ดยูนิตเพื่อดูรายละเอียด ===== */
let tipTimer = null, holdShown = false; // holdShown: กดค้างจนกล่องขึ้นแล้ว → ปล่อยเมาส์ต้องไม่นับเป็นคลิก
function hideTip() { clearTimeout(tipTimer); $('unit-tip').classList.add('hidden'); }
function showTip(el) {
  const tip = $('unit-tip');
  if (el.dataset.id) { // การ์ดบนสนาม
    const id = +el.dataset.id;
    const u = [...S.p.gods, ...S.p.heroes, ...S.b.gods, ...S.b.heroes].find(x => x.id === id);
    if (!u) return;
    const god = u.type === 'god', d = god ? GOD[u.key] : HERO[u.key];
    const st = god ? (u.cd > 0 ? `คูลดาวน์ ${u.cd} เทิร์น` : 'พร้อมใช้สกิล') : (u.sick ? 'เพิ่งลงสนาม (ยังใช้สกิลไม่ได้)' : u.used ? 'ใช้สกิลไปแล้วในเทิร์นนี้' : 'พร้อมใช้สกิล (1 ครั้ง/เทิร์น)');
    tip.innerHTML = `<div class="tip-head"><span class="tip-icon">${d.i}</span><b>${d.n}</b></div>
      <div class="tip-meta">${god ? 'เทพ' : 'ฮีโร่'} · Energy ${u.energy}/5${god ? '' : ' · ค่าร่าย ' + d.cost + 'E'}</div>
      <div class="tip-desc">${d.d}</div><div class="tip-meta">${st}</div>`;
  } else if (el.dataset.god) { // การ์ดในหน้าต่างเลือกเทพ
    const d = GOD[el.dataset.k]; if (!d) return;
    tip.innerHTML = `<div class="tip-head"><span class="tip-icon">${d.i}</span><b>${d.n}</b></div>
      <div class="tip-meta">เทพ · สาย${d.c} · เริ่มด้วย Energy 5/5</div>
      <div class="tip-desc">${d.d}</div>`;
  } else { // การ์ดในคลังฮีโร่
    const d = HERO[el.dataset.k]; if (!d) return;
    tip.innerHTML = `<div class="tip-head"><span class="tip-icon">${d.i}</span><b>${d.n}</b></div>
      <div class="tip-meta">ฮีโร่ · ค่าร่าย ${d.cost}E · ลงสนามด้วย Energy ${HERO_E0}</div>
      <div class="tip-desc">${d.d}</div>`;
  }
  holdShown = true;
  tip.classList.remove('hidden');
  const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
  let x = r.left + r.width / 2 - t.width / 2, y = r.top - t.height - 8;
  if (y < 4) y = r.bottom + 8; // ไม่พอที่ด้านบน → ไปแสดงด้านล่างการ์ด
  tip.style.left = Math.max(4, Math.min(x, innerWidth - t.width - 4)) + 'px';
  tip.style.top = Math.max(4, Math.min(y, innerHeight - t.height - 4)) + 'px';
}
[$('arena'), $('hero-list'), $('god-list'), $('deck-list')].forEach(box => {
  box.addEventListener('pointerdown', e => {
    holdShown = false;
    const el = e.target.closest('.unit'); if (!el || e.target.closest('.dissolve-btn')) return;
    clearTimeout(tipTimer); tipTimer = setTimeout(() => showTip(el), 200); // หน่วงเล็กน้อย กันคลิกปกติแล้วป๊อปแว้บ
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'dragstart', 'scroll'].forEach(ev => box.addEventListener(ev, hideTip));
  box.addEventListener('contextmenu', e => { if (e.target.closest('.unit')) e.preventDefault(); });
});
// เลื่อนล้อเมาส์บนคลังฮีโร่ = เลื่อนซ้าย-ขวา
$('hero-list').addEventListener('wheel', e => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); $('hero-list').scrollLeft += e.deltaY; }
}, { passive: false });

/* ===== หน้าต่างกฎการเล่น (ข้อมูลเทพ/ฮีโร่ดึงจากตาราง GOD / HERO จึงตรงกับเกมเสมอ) ===== */
function rulesHTML(tab) {
  if (tab === 'quick') return `<ul class="rl">
    <li>🎯 <b>เป้าหมาย</b> ดันแถบ Influence (รวม 30, เริ่ม 15 : 15) ให้ศัตรูเหลือ 0 หรือมีแต้มมากกว่าเมื่อจบเทิร์น 12</li>
    <li>💀 <b>แพ้ทันที</b> ถ้าฝั่งไหนไม่เหลือทั้งเทพและฮีโร่บนสนาม (โดนพลิกยึดจนหมด)</li>
    <li>🔁 <b>เทิร์น</b> Start (จั่ว) → Energy (ทิ้งการ์ดรับ Energy ทั้งสองฝ่ายพร้อมกัน) → Pick Up Hero → Battle → End · เทิร์นแรกสุ่มว่าใครเล่นก่อน แล้วสลับกันทุกเทิร์น</li>
    <li>🛡️ <b>เทิร์นที่ 1</b> ทั้งสองฝ่ายยัด Energy ใส่ศัตรู / พลิกฝั่งไม่ได้ ใช้ตั้งหลัก (ร่ายฮีโร่ ชาร์จ ได้ตามปกติ)</li>
    <li>🃏 <b>Energy Phase</b> ทิ้งการ์ดที่สีตรงโจทย์ (หรือ ✦ แกนกลางใช้ได้ทุกสี) +1 Energy · ตรงทั้งสีและตำแหน่ง +2 · มือเน่า เผาการ์ด 2 ใบ +1</li>
    <li>⏱ <b>เวลาต่อเฟส</b> Energy 30 วิ · Pick Up Hero 25 วิ · Battle 45 วิ (วงกลมนับเวลาบนรอยต่อสีฟ้า/แดงของแถบ Influence) หมดเวลาจะข้ามเฟสให้อัตโนมัติ (Battle หมดเวลา = จบเทิร์น) · เลือกเด็ค 60 วิ · มือเริ่มต้น 20 วิ</li>
    <li>🔱 <b>เลือกเทพ</b> ตอนเริ่มเกมการ์ดเทพทั้ง 4 คว่ำอยู่ ผู้เล่นกับบอทเลือกพร้อมกัน (30 วิ) ใบที่ถูกเลือกจะพลิกเปิดและอีกฝ่ายเลือกซ้ำไม่ได้ · บอทเลือกช้า-เร็วไม่เท่ากันในแต่ละเกม</li>
    <li>🔄 <b>มือเริ่มต้น</b> ตอนเริ่มเกมจั่วเสร็จจะขึ้นหน้าต่างให้เลือกการ์ดที่ต้องการ "สุ่มใหม่" (กี่ใบก็ได้ ครั้งเดียวต่อเกม) · บอทสุ่มใหม่ของตัวเองด้วย</li>
    <li>🃏 <b>เด็คฮีโร่</b> ก่อนเริ่มเกมเลือกฮีโร่ 8 ใบจาก 12 (ไม่รวมเทพ) ภายใน 60 วินาที หมดเวลาระบบสุ่มที่เหลือให้ · ร่ายได้เฉพาะฮีโร่ในเด็ค · บอทเลือกเด็คของตัวเองแบบสุ่มตามนิสัย</li>
    <li>🧙 <b>ฮีโร่</b> ร่ายได้ 2 ตัว/เทิร์น ลงสนามพร้อมกัน 3 ตัว ห้ามร่ายตัวเดิมซ้ำ · สกิลใช้ได้ 1 ครั้ง/เทิร์น/ตัว</li>
    <li>⚔️ <b>Battle</b> ยัด Energy ใส่ศัตรู (+1 Influence ต่อครั้ง รวมไม่เกิน 3 แต้ม/เทิร์น) · ชาร์จฝั่งเรา (ไม่ได้แต้ม) · สกิลฮีโร่/เทพ · ยูนิตศัตรูที่ Energy เหลือ 0 พลิกฝั่งยึดได้ (เทพ +4 · ฮีโร่ +2 Influence)</li>
    <li>♻️ <b>สลายฮีโร่</b> 1 ครั้ง/เทิร์น ใน Pick Up Hero / Battle: ได้ +1 Energy แต่ Influence -1</li>
    <li>☯️ <b>ชนะทาง</b> 🌟ผู้สร้าง › 🌿ชีวิต › 🔥ทำลายล้าง › 💀ความตาย › 🌟ผู้สร้าง</li>
    <li>✨ <b>แท่นวงเวทย์</b> ทิ้งการ์ดให้ครบ 5 ตำแหน่ง → Awakening (Influence +2 + เปลี่ยนเทพฟรี) <b>ได้ครั้งเดียวต่อเกม</b></li>
    <li>🖐️ <b>กดค้างที่การ์ด</b> บนสนาม / ในคลังฮีโร่ / หน้าต่างเลือกเทพ เพื่ออ่านสกิล</li></ul>
    <p class="note" style="margin-top:10px">ต้องการรายละเอียดทุกข้อ กดแท็บ "ละเอียด"</p>`;
  const gods = FACTS.map(k => `<li class="c-${k}"><b>${GOD[k].i} ${GOD[k].n}</b>${GOD[k].d}</li>`).join('');
  const heroes = Object.keys(HERO).map(k => `<li><b>${HERO[k].i} ${HERO[k].n} · ค่าร่าย ${HERO[k].cost}E</b>${HERO[k].d}</li>`).join('');
  return `
  <h3>🎯 เป้าหมาย</h3>
  <ul><li>แถบ Influence รวม 30 แต้ม เริ่มที่ผู้เล่น 15 : 15 ศัตรู ดันจนฝั่งตรงข้ามเหลือ 0 = ชนะทันที (ถ้าเราเหลือ 0 = แพ้)</li>
  <li>ครบ 12 เทิร์นแล้วยังไม่จบ ฝั่งที่มี Influence มากกว่าชนะ ถ้าเท่ากันเสมอ</li>
  <li><b>กวาดล้าง:</b> ถ้าฝั่งไหนไม่เหลือ <b>ทั้งเทพและฮีโร่</b> บนสนาม (ถูกพลิกยึดจนหมด) ฝั่งนั้นแพ้ทันที · ห้ามสลายฮีโร่ตัวสุดท้ายถ้าไม่มีเทพเหลือ</li>
  <li><b>แหล่งที่ได้ Influence:</b> ยัด Energy ใส่ศัตรู (1 แต้ม/ครั้ง ไม่เกิน 3/เทิร์น) · พลิกฝั่ง · สกิลฮีโร่บางตัว · Awakening (ครั้งเดียวต่อเกม) · พลังเทพบางองค์</li></ul>

  <h3>🔁 ลำดับเทิร์น</h3>
  <ul><li><b>ใครเล่นก่อน:</b> สุ่มตอนเริ่มเกม แล้วสลับกันทุกเทิร์น (แสดงที่แถบบน "เล่นก่อน") — Start และ Energy Phase ทำพร้อมกัน ส่วน Pick Up Hero / Battle / End ฝั่งที่ได้เล่นก่อนทำก่อน</li></ul>
  <ol>
    <li><b>Start Phase</b> (ทั้งสองฝ่ายพร้อมกัน) — ยูนิตหายสถานะ "เพิ่งลงสนาม", คูลดาวน์เทพลด 1, จั่วการ์ดให้ครบ 5 ใบ (ถ้าเทพศัตรูชนะทางเทพเรา จะจั่วครบ 6 ใบ) และสุ่มโจทย์วงเวทย์ของเทิร์นนั้น</li>
    <li><b>Energy Phase</b> (ทั้งสองฝ่ายพร้อมกัน) — ทิ้งการ์ดเพื่อรับ Energy การ์ดที่เล่นไปแสดงในหน้าต่างใต้โจทย์</li>
    <li><b>Pick Up Hero Phase</b> — อัญเชิญฮีโร่จากคลัง ฝั่งที่ได้เล่นก่อนทำช่วงนี้ถึง End ก่อน แล้วอีกฝั่งต่อ</li>
    <li><b>Battle Phase</b> — โจมตี ชาร์จ ใช้สกิล พลิกฝั่ง (<b>เทิร์นที่ 1 ยัด Energy / พลิกฝั่งไม่ได้ทั้งสองฝ่าย</b> เพื่อให้มีเวลาตั้งหลัก)</li>
    <li><b>End Phase</b> — เก็บ Energy ทบไปเทิร์นหน้าได้สูงสุด 1 แต้ม ที่เหลือหายไป</li>
  </ol>

  <h3>⚡ Energy Phase</h3>
  <ul>
    <li>ทิ้งการ์ดที่ <b>สีตรงโจทย์</b> หรือเป็น <b>การ์ดแกนกลาง ✦</b> (ใช้ได้ทุกสี) → ได้ +1 Energy</li>
    <li>ถ้าตรงทั้ง <b>สีและตำแหน่ง</b> ของโจทย์ → ได้ +2 Energy</li>
    <li><b>เผาการ์ด:</b> เลือกการ์ดที่ไม่ตรงโจทย์ 2 ใบ → ได้ +1 Energy (ใช้ตอนมือเน่า)</li>
    <li>การ์ดแกนกลางดรอปน้อย (ประมาณ 8% ต่อใบ) · เทพผู้สร้างเสกให้ได้ด้วยสกิล</li></ul>

  <h3>✨ แท่นวงเวทย์ (Awakening)</h3>
  <ul><li>ทุกครั้งที่ทิ้งหรือเผาการ์ด ช่องบนแท่นตามตำแหน่งบนการ์ดใบนั้น (↖ ↗ ↙ ↘ ✦) จะสว่างขึ้น</li>
  <li>เมื่อสว่างครบ 5 ช่อง → <b>Awakening</b>: Influence +2 และเปลี่ยนฝ่ายเทพฟรี 1 ครั้ง (ไม่ได้ Energy)</li>
  <li><b>ใช้ได้ครั้งเดียวต่อเกม</b> ต่อฝั่ง หลังจากนั้นแท่นจะค้างสว่างครบและไม่มีผลอีก</li></ul>

  <h3>☯️ ชนะทาง</h3>
  <ul><li>🌟 ผู้สร้าง ชนะ 🌿 ชีวิต · 🌿 ชนะ 🔥 ทำลายล้าง · 🔥 ชนะ 💀 ความตาย · 💀 ชนะ 🌟</li>
  <li><b>ผู้ชนะทาง:</b> โจมตีเทพศัตรูครั้งแรกของเทิร์น ลด Energy ได้ 2 แทน 1</li>
  <li><b>ผู้แพ้ทาง:</b> จั่วการ์ดครบ 6 ใบตอน Start</li></ul>

  <h3>🧙 การอัญเชิญฮีโร่</h3>
  <ul>
    <li><b>เด็คฮีโร่:</b> หลังเลือกเทพ ผู้เล่นเลือกฮีโร่ <b>8 ใบ</b> จากทั้งหมด 12 ภายใน <b>60 วินาที</b> (หมดเวลา = สุ่มใบที่เหลือ หรือกด "สุ่มให้ครบ" / "ยืนยันเด็ค") คลังฮีโร่ในเกมแสดงเฉพาะ 8 ใบนี้ · บอทเลือกเด็คของตัวเองซ่อนไว้</li>
    <li>จ่าย Energy เท่าค่าร่ายของฮีโร่ในช่วง Pick Up Hero Phase</li>
    <li>อัญเชิญได้ <b>สูงสุด 2 ตัว/เทิร์น</b> และมีในสนามพร้อมกันได้ <b>สูงสุด 3 ตัว</b></li>
    <li><b>ห้ามร่ายตัวเดิมซ้ำ</b> ในฝั่งเดียวกัน ต้องสลายตัวเดิมก่อน (ฝั่งเรากับบอทมีตัวเดียวกันได้)</li>
    <li>ฮีโร่ทุกตัวเริ่มด้วย <b>Energy 2</b> และ <b>ใช้สกิลไม่ได้ทันที</b> (เพิ่งลงสนาม)</li>
    <li>สกิลฮีโร่ใช้ได้ <b>1 ครั้ง/เทิร์น/ตัว</b> โดยหัก Energy จากตัวฮีโร่เอง ไม่ใช่ Energy ของผู้เล่น</li>
    <li>♻️ <b>สลายฮีโร่ (Dissolve)</b> ได้ 1 ครั้ง/เทิร์น ใน Pick Up Hero หรือ Battle: ฮีโร่กลับคลัง ได้ +1 Energy แต่ Influence -1 (กดปุ่ม "สลาย" บนการ์ดฮีโร่ แล้วกดยืนยันอีกครั้ง)</li></ul>

  <h3>⚔️ Battle Phase (ใช้ Energy ผู้เล่น 1 แต้มต่อการกระทำ)</h3>
  <ul>
    <li><b>ยัด Energy ใส่ศัตรู:</b> ลด Energy ยูนิตเป้าหมาย 1 แต้ม และได้ Influence +1 ต่อครั้ง <b>รวมสูงสุด 3 แต้มต่อเทิร์น</b> (ยัดต่อหลังครบโควตายังลด Energy ได้ แต่ไม่ได้แต้ม)</li>
    <li><b>พลิกฝั่ง:</b> ยูนิตศัตรูที่ Energy เหลือ 0 ยึดมาเป็นของเรา (Energy 1) ได้ Influence <b>+4 (เทพ)</b> / <b>+2 (ฮีโร่)</b> · ยึดฮีโร่ได้ต่อเมื่อฝั่งเรามีฮีโร่ไม่ถึง 3 ตัว (ฮีโร่ที่ยึดมาเป็น "เพิ่งลงสนาม")</li>
    <li><b>ชาร์จฝั่งเรา:</b> เติม Energy ให้ยูนิตเรา +1 (สูงสุด 5) กันโดนยึด — ไม่ได้ Influence</li>
    <li><b>สกิลฮีโร่ / สกิลเทพ:</b> กดโหมดแล้วเลือกยูนิตที่จะใช้ สกิลเทพหัก Energy จากตัวเทพ 1 แต้ม และมีคูลดาวน์ 3 เทิร์น</li>
    <li>เทพที่ยึดมาได้ยังอยู่ข้างเทพของเรา และเทพที่ถูกยึดจะหายจากฝั่งศัตรู</li></ul>

  <h3>🔱 เทพทั้ง 4 องค์ (เริ่มด้วย Energy 5)</h3>
  <ul class="chips">${gods}</ul>

  <h3>🦸 ฮีโร่ทั้ง 12 ตัว</h3>
  <ul class="chips">${heroes}</ul>

  <h3>💡 เคล็ดลับ</h3>
  <ul><li>กดค้างที่การ์ดบนสนาม ในคลังฮีโร่ หรือหน้าต่างเลือกเทพ เพื่ออ่านความสามารถ</li>
  <li>ยูนิตที่ Energy เหลือ 1 เสี่ยงโดนยึดต่อไป ชาร์จหรือสลายก่อน</li></ul>`;
}
let helpTimer = null;
function stopHelpAttention() { clearTimeout(helpTimer); $('btn-help').classList.remove('attention'); }
function openRules(tab) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('rules-body').innerHTML = rulesHTML(tab); $('rules-body').scrollTop = 0;
  $('rules-modal').classList.remove('hidden');
}
$('btn-help').onclick = () => { stopHelpAttention(); openRules('quick'); };
helpTimer = setTimeout(stopHelpAttention, 20000); // เรืองแสงเรียกความสนใจ 20 วินาทีแล้วหยุด
document.querySelectorAll('.tab').forEach(b => b.onclick = () => openRules(b.dataset.tab));
$('rules-close').onclick = () => $('rules-modal').classList.add('hidden');
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('rules-modal').classList.add('hidden'); });

/* ===== ผูก Event ===== */
$('arena').addEventListener('click', e => {
  const db = e.target.closest('.dissolve-btn');
  if (db) { // กด 2 ครั้งเพื่อยืนยัน (กันกดพลาด)
    const id = +db.dataset.dissolve;
    if (S.arm === id) { S.arm = null; dissolve('p', S.p.heroes.find(h => h.id === id)); } else S.arm = id;
    return render();
  }
  if (S.arm) { S.arm = null; render(); }
  if (holdShown) { holdShown = false; return; } // กดค้างอ่านสกิล ไม่นับเป็นการสั่งงาน
  const el = e.target.closest('.unit'); if (el) onUnit(+el.dataset.id);
});
$('hand').addEventListener('click', e => { const el = e.target.closest('.magic-card'); if (el) onCard(+el.dataset.i); });
$('btn-phase').onclick = nextPhase;
$('btn-burn').onclick = () => { S.burn = !S.burn; S.sel = []; render(); };
$('btn-heroes').onclick = openHeroes;
$('hero-close').onclick = () => $('hero-modal').classList.add('hidden');
$('hero-list').onclick = e => {
  if (holdShown) { holdShown = false; return; } // กดค้างอ่านสกิล ไม่นับเป็นการอัญเชิญ
  const el = e.target.closest('.unit'); if (!el || el.classList.contains('disabled')) return;
  summon('p', el.dataset.k); $('hero-modal').classList.add('hidden'); render();
};
document.querySelectorAll('.mode-btn').forEach(b => b.onclick = () => {
  S.mode = S.mode === b.dataset.mode ? null : b.dataset.mode; S.pending = null; render();
});
$('btn-restart').onclick = init;
// ยอมแพ้: เปิดหน้าต่างยืนยัน → ยืนยันแล้วกลับหน้า Home (เวลานับเฟสหยุดระหว่างเปิดหน้าต่างนี้)
$('btn-quit').onclick = () => $('quit-modal').classList.remove('hidden');
$('quit-no').onclick = () => $('quit-modal').classList.add('hidden');
$('quit-yes').onclick = () => { S.over = true; location.href = 'index.html'; };
init();