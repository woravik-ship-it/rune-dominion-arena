// Phase 45 (2026-10-07): เทสต์กติกาตัดสินผู้ชนะ — เก็บข้อค้างจาก CODE_REVIEW #6
// "ครบ BATTLE_MAX_TURNS แล้วอาจ DRAW" ⇒ ต้องมีตัวตัดสินไล่ชั้นก่อนยอม DRAW
import { decideWinner } from '@/services/combat-engine';

const base = { hpA: 100, hpB: 100, aliveA: 3, aliveB: 3, atkA: 50, atkB: 50 };

describe('decideWinner — ไล่ชั้นตัวตัดสิน', () => {
  it('ฝั่ง B หมดสภาพ → A ชนะ แม้ HP รวมจะเท่ากัน', () => {
    const r = decideWinner({ ...base, aliveB: 0, aliveA: 2 });
    expect(r.winner).toBe('A');
    expect(r.reasonTh).toBe('อีกฝ่ายหมดสภาพ');
  });

  it('ฝั่ง A หมดสภาพ → B ชนะ', () => {
    const r = decideWinner({ ...base, aliveA: 0, aliveB: 2 });
    expect(r.winner).toBe('B');
    expect(r.reasonTh).toBe('อีกฝ่ายหมดสภาพ');
  });

  it('HP รวมไม่เท่ากัน → ตัดสินด้วย HP รวม', () => {
    expect(decideWinner({ ...base, hpA: 130, hpB: 40 }).winner).toBe('A');
    expect(decideWinner({ ...base, hpA: 40, hpB: 130 }).winner).toBe('B');
    expect(decideWinner({ ...base, hpA: 130, hpB: 40 }).reasonTh).toBe('HP รวมที่เหลือ');
  });

  it('HP เท่ากัน → ใช้จำนวนใบที่ยังรอด', () => {
    const r = decideWinner({ ...base, aliveA: 4, aliveB: 2 });
    expect(r.winner).toBe('A');
    expect(r.reasonTh).toBe('จำนวนใบที่ยังรอด');
  });

  it('HP + จำนวนใบเท่ากัน → ใช้พลังโจมตีรวมที่เหลือ', () => {
    const r = decideWinner({ ...base, atkA: 31, atkB: 90 });
    expect(r.winner).toBe('B');
    expect(r.reasonTh).toBe('พลังโจมตีรวมที่เหลือ');
  });

  it('เท่ากันทุกตัวชี้วัด → DRAW จริง ๆ', () => {
    const r = decideWinner(base);
    expect(r.winner).toBe('DRAW');
    expect(r.reasonTh).toBe('เสมอจริง ๆ ทุกตัวชี้วัด');
  });

  it('ไม่มีทาง DRAW เมื่อฝั่งหนึ่งเหลือรอดมากกว่า (เคสที่เดิมเคย DRAW)', () => {
    const r = decideWinner({ ...base, hpA: 200, hpB: 200, aliveA: 3, aliveB: 1, atkA: 10, atkB: 10 });
    expect(r.winner).toBe('A');
    expect(r.winner).not.toBe('DRAW');
  });
});
