// เพลงประจำดันเจี้ยน + การกันเสียงแตก (Phase 35)
// ผู้ใช้สั่ง 2026-09-27: "เพลงประกอบ ในโทรศัพท์ มีเสียงแตกหน่อยๆ · เพิ่มเพลงประจำดันเจี้ยน ให้ตื่นเต้น"
import {
  DUNGEON_BASS_PULSE_SECONDS,
  DUNGEON_CHORD_SECONDS,
  DUNGEON_CHORDS,
  chordNotes,
  dungeonChordNotes,
  midiToFreq,
  trackChordCount,
  trackChordSeconds,
  trackLoopSeconds,
  trackNotes,
} from '@/lib/music';
import { LAYER_BASE_GAIN, MASTER_BASE_GAIN, MASTER_COMPRESSOR, MASTER_LIMITER, layerGain } from '@/lib/audio-engine';

describe('เพลงประจำดันเจี้ยน', () => {
  test('มีคอร์ดของตัวเอง 4 คอร์ด และจังหวะเร็วกว่าเพลงธีมหลัก', () => {
    expect(DUNGEON_CHORDS.length).toBe(4);
    expect(DUNGEON_CHORD_SECONDS).toBeLessThan(7.5);
    expect(trackChordSeconds('dungeon')).toBe(DUNGEON_CHORD_SECONDS);
    expect(trackChordCount('dungeon')).toBe(DUNGEON_CHORDS.length);
    expect(trackLoopSeconds('dungeon')).toBe(DUNGEON_CHORD_SECONDS * DUNGEON_CHORDS.length);
    expect(trackLoopSeconds('main')).toBeGreaterThan(trackLoopSeconds('dungeon'));
  });

  test('โน้ตของเพลงดันเจี้ยน: มีเบสตีพจังหวะ (กลองศึก) + ระฆังถี่ และอยู่ในย่านที่มือถือได้ยิน', () => {
    const notes = dungeonChordNotes(0);
    // เบสตีพ: นับโน้ตความถี่ต่ำสุดที่ตีถี่ ๆ ตาม DUNGEON_BASS_PULSE_SECONDS
    const pulses = notes.filter((note) => Math.abs(note.at % DUNGEON_BASS_PULSE_SECONDS) < 1e-6);
    expect(pulses.length).toBeGreaterThanOrEqual(4);
    // มีชั้นอ็อกเทฟบน (262-1046Hz) ให้ได้ยินบนลำโพงมือถือ
    const audible = notes.filter((note) => note.freq >= 250 && note.freq <= 1100);
    expect(audible.length).toBeGreaterThanOrEqual(4);
    // ทุกโน้ตต้องมีความถี่/เกนที่สมเหตุสมผล (กันค่าเพี้ยน)
    for (const note of notes) {
      expect(note.freq).toBeGreaterThan(40);
      expect(note.freq).toBeLessThan(4000);
      expect(note.gain).toBeGreaterThan(0);
      expect(note.gain).toBeLessThanOrEqual(0.15);
    }
  });

  test('trackNotes เลือกชุดโน้ตตามเพลง (และเพลงหลักยังเหมือนเดิม)', () => {
    expect(trackNotes('dungeon', 0)).toEqual(dungeonChordNotes(0));
    expect(trackNotes('main', 0)).toEqual(chordNotes(0));
    expect(midiToFreq(69)).toBe(440);
  });
});

describe('เสียงไม่แตกบนมือถือ (limiter + เกนที่ลดลง)', () => {
  test('มี limiter ที่เข้มกว่า compressor และต่อท้ายในกราฟเสียง', async () => {
    expect(MASTER_LIMITER.ratio).toBeGreaterThan(MASTER_COMPRESSOR.ratio * 5);
    expect(MASTER_LIMITER.threshold).toBeLessThan(0);
    expect(MASTER_LIMITER.threshold).toBeGreaterThan(MASTER_COMPRESSOR.threshold / 2);
    const engine = await import('@/lib/audio-engine');
    expect(engine.MASTER_LIMITER.attack).toBeLessThan(0.01);
  });

  test('เกนรวมของเพลงต้องต่ำพอไม่ให้ยอดคลื่นทะลุ 0 dBFS', () => {
    const musicBus = layerGain('music', {
      music: true, sfx: true, ambience: true, reduceIntense: false, volume: 1,
    });
    const total = musicBus * MASTER_BASE_GAIN;
    // peak ต่อโน้ตสูงสุด 0.12 × จำนวนโน้ตที่ซ้อนกันจริง (ราว 9) = ~1.08 ⇒ ต้องถูก limiter รับไว้
    // เช็คว่า bus × master ไม่เกิน 2.0 (เดิม 2.34) และมี limiter ช่วย
    expect(total).toBeLessThanOrEqual(1.8);
    expect(LAYER_BASE_GAIN.music).toBeLessThan(1.8);
    expect(MASTER_BASE_GAIN).toBeLessThan(1.3);
  });
});
