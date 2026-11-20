'use strict';
/* หน้า Home: ปุ่มเมนู + หน้าต่างตั้งค่า
   ค่าตั้งค่าเก็บใน localStorage ชื่อ fvnSettings แล้วเกมการ์ด (script.js) อ่านไปใช้ */
const $ = id => document.getElementById(id);
const KEY = 'fvnSettings', DEFAULTS = { anim: true, botSpeed: 1, timer: true };

function load() { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY))); } catch (e) { return Object.assign({}, DEFAULTS); } }
function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch (e) { return false; } }

const cfg = load();
function paint() {
  document.querySelectorAll('.seg[data-key]').forEach(seg => {
    const cur = String(cfg[seg.dataset.key]);
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === cur));
  });
}
document.querySelectorAll('.seg[data-key] button').forEach(b => b.onclick = () => {
  const k = b.parentElement.dataset.key;
  cfg[k] = JSON.parse(b.dataset.v); // "true"/"false"/"0.6" → ค่าจริง
  paint(); $('set-note').textContent = save(cfg) ? 'บันทึกแล้ว' : 'บันทึกไม่ได้ (เบราว์เซอร์บล็อกที่เก็บข้อมูล)';
});
$('btn-clear').onclick = () => {
  const b = $('btn-clear');
  if (!b.dataset.arm) { b.dataset.arm = '1'; b.textContent = 'กดอีกครั้งเพื่อยืนยัน'; setTimeout(() => { delete b.dataset.arm; b.textContent = 'ล้างเซฟ'; }, 3000); return; }
  try { localStorage.removeItem('fvnVNSave'); $('set-note').textContent = 'ล้างเซฟเนื้อเรื่องแล้ว'; } catch (e) { $('set-note').textContent = 'ล้างไม่ได้'; }
  delete b.dataset.arm; b.textContent = 'ล้างเซฟ';
};
$('btn-setting').onclick = () => { paint(); $('set-modal').classList.remove('hidden'); };
$('set-close').onclick = () => $('set-modal').classList.add('hidden');
$('set-modal').onclick = e => { if (e.target === $('set-modal')) $('set-modal').classList.add('hidden'); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('set-modal').classList.add('hidden'); });
