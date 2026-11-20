'use strict';
/* ===== ข้อมูลเกมที่ใช้ร่วมกัน (เกมการ์ด + หน้า Deck) — แก้ตัวเลข/สกิลที่ไฟล์นี้ที่เดียว ===== */
const FACTS = ['creation', 'life', 'destruction', 'death'];
const BEAT = { creation: 'life', life: 'destruction', destruction: 'death', death: 'creation' }; // ชนะทาง
const GOD = {
  creation:    { n: 'เทพผู้สร้าง',     i: '🌟', c: 'ทอง',  d: 'สกิล (1E/CD3): เสกการ์ดแกนกลาง 1 ใบ' },
  life:        { n: 'เทพแห่งชีวิต',    i: '🌿', c: 'เขียว', d: 'สกิล (1E/CD3): ฮีโร่ทุกตัว +1 E' },
  destruction: { n: 'เทพทำลายล้าง',    i: '🔥', c: 'แดง',  d: 'Passive: พลิกยูนิตศัตรู ได้ Influence +1 เพิ่ม' },
  death:       { n: 'เทพแห่งความตาย', i: '💀', c: 'ม่วง', d: 'Passive: จบเทิร์นถ้าดัน Influence ได้ ≥3 ในเทิร์นนั้น ได้ +1' }
};
/* ฮีโร่ 12 ตัว
   cost = ค่าร่าย (E) · sc = Energy ที่สกิลหักจากตัวฮีโร่เอง (ปกติ 1) · ฮีโร่ทุกตัวลงสนามด้วย Energy = HERO_E0
   (HERO_E0 = Energy ตอนลงสนาม ปรับที่ค่าเดียวใช้กับทุกตัว)
   t = ชนิดเป้าหมายสกิล: self (ไม่ต้องเลือก) | ally (ยูนิตเราตัวอื่น) | eh (ฮีโร่ศัตรู) | eu (เทพ/ฮีโร่ศัตรู) | null (ไม่มีสกิลกดใช้)
   pick = บอทเลือกเป้าหมายแบบ low (Energy ต่ำสุด) / high (สูงสุด)
   สมดุล: ค่าร่าย 1 ≈ ผลลัพธ์มูลค่า ~1 · ค่าร่าย 2 ≈ ~2 · ค่าร่าย 3 ≈ ~3 (ใบแรงเสียสกิลแพงกว่า/ต้องชาร์จก่อน)
   สกิลฮีโร่ใช้ได้ 1 ครั้ง/เทิร์น/ตัว (h.used) กันคอมโบวนใช้สกิลซ้ำจนโกง */
const HERO_E0 = 2;
const HERO = {
  // --- ค่าร่าย 1 ---
  knight:     { n: 'อัศวินแสงอรุณ',      i: '⚔️', cost: 1, sc: 1, t: 'self', d: 'สกิล (1E): Influence +1' },
  apprentice: { n: 'ศิษย์จอมเวทย์',      i: '🔮', cost: 1, sc: 1, t: 'self', d: 'สกิล (1E): จั่วการ์ดสุ่ม 1 ใบ (มือไม่เกิน 8 ใบ)' },
  medic:      { n: 'หมอสมุนไพร',        i: '🌱', cost: 1, sc: 1, t: 'ally', pick: 'low', d: 'สกิล (1E): เติม Energy ให้ยูนิตฝ่ายเรา 1 ตัว +1' },
  // --- ค่าร่าย 2 ---
  guardian:   { n: 'ผู้พิทักษ์พงไพร',    i: '🛡️', cost: 2, sc: 1, t: 'ally', pick: 'low', d: 'สกิล (1E): เติม Energy ให้เพื่อน 1 ตัว +2' },
  stalker:    { n: 'นักล่าเงามรณะ',     i: '🗡️', cost: 2, sc: 1, t: 'eh', pick: 'high', d: 'สกิล (1E): ลด Energy ฮีโร่ศัตรู 1 ตัว -2' },
  archer:     { n: 'นักธนูเพลิง',        i: '🏹', cost: 2, sc: 1, t: 'eu', pick: 'low', d: 'สกิล (1E): ยิงยูนิตศัตรู 1 ตัว -1 Energy, Influence +1' },
  bard:       { n: 'นักกวีเสียงทอง',     i: '🎵', cost: 2, sc: 1, t: 'self', d: 'สกิล (1E): ฮีโร่ฝ่ายเราตัวอื่นทุกตัว +1 Energy' },
  thief:      { n: 'โจรลวงวิญญาณ',     i: '🥷', cost: 2, sc: 1, t: 'eu', pick: 'high', d: 'สกิล (1E): ดูด Energy ยูนิตศัตรู 1 ตัว -1 แล้วเราได้ +1 Energy' },
  // --- ค่าร่าย 3 ---
  trickster:  { n: 'จอมมายาไร้ลักษณ์',  i: '🎭', cost: 4, sc: 1, t: null, d: 'On Play: เปลี่ยนเทพศัตรูเป็นองค์ที่แพ้ทางเรา' },
  mage:       { n: 'จอมเวทย์พายุ',      i: '🧙', cost: 3, sc: 2, t: 'self', d: 'สกิล (2E): ลด Energy ฮีโร่ศัตรูทุกตัว -1' },
  paladin:    { n: 'อัศวินศักดิ์สิทธิ์', i: '✝️', cost: 3, sc: 1, t: 'self', d: 'On Play: เทพฝ่ายเรา +2 Energy · สกิล (1E): Influence +1' },
  dragon:     { n: 'มังกรเพลิงโบราณ',   i: '🐉', cost: 3, sc: 2, t: 'eu', pick: 'low', d: 'สกิล (2E): พ่นไฟใส่ยูนิตศัตรู 1 ตัว -2 Energy, Influence +1' }
};
const ORN = '<i class="orn tl"></i><i class="orn tr"></i><i class="orn bl"></i><i class="orn br"></i>'; // ลายมุมกรอบเทพ (ดู CSS)
const SYM = { tl: '↖', tr: '↗', bl: '↙', br: '↘', c: '✦' };
const POS = ['tl', 'tr', 'bl', 'br', 'c'];
