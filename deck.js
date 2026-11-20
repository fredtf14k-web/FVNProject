'use strict';
/* หน้า Deck: แสดงการ์ดทั้งหมดของเกม (ดึงจาก data.js จึงตรงกับเกมเสมอ) — ตอนนี้เป็นโหมดดูอย่างเดียว */
const $ = id => document.getElementById(id);
const GNAME = { creation: 'เทพผู้สร้าง', life: 'เทพแห่งชีวิต', destruction: 'เทพทำลายล้าง', death: 'เทพแห่งความตาย' };
let costFilter = 'all';

function godHTML(k) {
  return `<div class="unit god ${k}" data-type="god" data-k="${k}">${ORN}<div class="icon">${GOD[k].i}</div><div class="name">${GOD[k].n}</div>
    <div class="pips">●●●●●</div><div class="tag">สาย${GOD[k].c}</div></div>`;
}
function heroHTML(k) {
  const h = HERO[k];
  return `<div class="unit" data-type="hero" data-k="${k}"><span class="cost">⚡${h.cost}</span><div class="icon">${h.i}</div><div class="name">${h.n}</div>
    <div class="pips">${'●'.repeat(HERO_E0)}${'○'.repeat(5 - HERO_E0)}</div><div class="tag">ค่าร่าย ${h.cost}E</div></div>`;
}
function renderHeroes() {
  const keys = Object.keys(HERO).filter(k => costFilter === 'all' || (costFilter === '3' ? HERO[k].cost >= 3 : HERO[k].cost === +costFilter));
  $('deck-list').innerHTML = keys.map(heroHTML).join('') || '<p class="hint">ไม่มีการ์ดในหมวดนี้</p>';
}
function renderMagic() {
  const rows = FACTS.map(k => `<div class="mrow"><div class="mlabel">${GOD[k].i} สาย${GOD[k].c}</div>` +
    ['tl', 'tr', 'bl', 'br', 'c'].map(p => `<div class="magic-card ${k} ${p === 'c' ? 'c' : ''}"><span class="icon">${GOD[k].i}</span><span class="pos">${SYM[p]}</span></div>`).join('') + '</div>').join('');
  $('magic-list').innerHTML = `<div class="info">การ์ดวงเวทย์มี 4 สี × 5 ตำแหน่ง (↖ ↗ ↙ ↘ ✦) ใช้ในช่วง Energy Phase: ทิ้งการ์ดที่สีตรงโจทย์ (หรือ ✦ แกนกลางที่ใช้ได้ทุกสี) เพื่อรับ Energy · ตรงทั้งสีและตำแหน่งได้ +2 · ทิ้ง/เผาการ์ดทุกตำแหน่งครบ 5 ช่องจะเกิด Awakening (ครั้งเดียวต่อเกม)<br>ใบแกนกลาง ✦ ดรอปน้อย (ประมาณ 8%) · เทพผู้สร้างเสกให้ได้ด้วยสกิล</div>${rows}`;
}

function detail(type, k) {
  const el = $('dk-detail');
  if (type === 'god') {
    const g = GOD[k], beat = BEAT[k], lose = FACTS.find(f => BEAT[f] === k);
    el.innerHTML = `<h2><span class="di">${g.i}</span>${g.n}</h2><div class="meta">เทพ · สาย${g.c} · เริ่มด้วย Energy 5/5</div>
      <div class="desc">${g.d}</div>
      <div class="kv"><span>ชนะทาง: <b>${GNAME[beat]}</b></span><span>แพ้ทางให้: <b>${GNAME[lose]}</b></span>
      <span>ฝ่ายที่แพ้ทางจั่วเพิ่ม +1 · ผู้ชนะทางโจมตีเทพศัตรูครั้งแรกของเทิร์นลด Energy 2</span></div>`;
  } else {
    const h = HERO[k];
    el.innerHTML = `<h2><span class="di">${h.i}</span>${h.n}</h2><div class="meta">ฮีโร่ · ค่าร่าย ${h.cost}E · ลงสนามด้วย Energy ${HERO_E0}</div>
      <div class="desc">${h.d}</div>
      <div class="kv"><span>สกิลใช้ได้ 1 ครั้ง/เทิร์น · เพิ่งลงสนามยังใช้ไม่ได้</span>${h.sc > 1 ? `<span>สกิลหัก Energy จากตัวฮีโร่เอง <b>${h.sc}</b></span>` : ''}</div>`;
  }
}

function pick(e) {
  const u = e.target.closest('.unit'); if (!u) return;
  document.querySelectorAll('.dk-grid .unit.sel').forEach(x => x.classList.remove('sel'));
  u.classList.add('sel'); detail(u.dataset.type, u.dataset.k);
}
$('god-list').onclick = pick; $('deck-list').onclick = pick;

document.querySelectorAll('#dk-tabs .tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('#dk-tabs .tab').forEach(x => x.classList.toggle('active', x === b));
  const t = b.dataset.tab;
  $('god-list').classList.toggle('hidden', t !== 'gods');
  $('deck-list').classList.toggle('hidden', t !== 'heroes');
  $('magic-list').classList.toggle('hidden', t !== 'magic');
  $('dk-filter').classList.toggle('hidden', t !== 'heroes');
  $('dk-detail').innerHTML = '<p class="hint">เลือกการ์ดเพื่อดูรายละเอียด</p>';
});
document.querySelectorAll('#dk-filter .chip').forEach(b => b.onclick = () => {
  costFilter = b.dataset.c;
  document.querySelectorAll('#dk-filter .chip').forEach(x => x.classList.toggle('active', x === b));
  renderHeroes();
});

$('god-list').innerHTML = FACTS.map(godHTML).join('');
renderHeroes(); renderMagic();
