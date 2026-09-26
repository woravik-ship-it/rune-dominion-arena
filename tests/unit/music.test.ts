// Music engine tests — Phase 21 (เพลงประกอบที่สังเคราะห์เอง)
import {
  A4_FREQ,
  MUSIC_BELL_PATTERN,
  MUSIC_CHORDS,
  MUSIC_CHORD_SECONDS,
  MUSIC_PRESENCE,
  chordNotes,
  midiToFreq,
  musicLoopSeconds,
} from '@/lib/music';

describe('midiToFreq', () => {
  test('A4 = 440Hz และอ็อกเทฟถัดไปเป็นสองเท่า', () => {
    expect(midiToFreq(69)).toBe(A4_FREQ);
    expect(midiToFreq(81)).toBeCloseTo(A4_FREQ * 2, 1);
    expect(midiToFreq(57)).toBeCloseTo(A4_FREQ / 2, 1);
  });

  test('C4 (MIDI 60) ≈ 261.6Hz', () => {
    expect(midiToFreq(60)).toBeCloseTo(261.626, 2);
  });
});

describe('โครงเพลง (chord progression)', () => {
  test('มี 4 คอร์ดวนซ้ำ และทุกคอร์ดมี 4 โน้ต', () => {
    expect(MUSIC_CHORDS.length).toBe(4);
    for (const chord of MUSIC_CHORDS) expect(chord.length).toBe(4);
  });

  test('ความถี่ของทุกโน้ตเป็นค่าบวกและอยู่ในย่านที่ได้ยิน (40Hz–2kHz)', () => {
    for (let i = 0; i < MUSIC_CHORDS.length; i += 1) {
      for (const note of chordNotes(i)) {
        expect(note.freq).toBeGreaterThan(40);
        expect(note.freq).toBeLessThan(2000);
      }
    }
  });

  test('คอร์ดหนึ่งมี pad 4 เสียง + ชั้นความสว่าง 4 เสียง + เบส 1 เสียง + ระฆังตามแพตเทิร์น', () => {
    const notes = chordNotes(0);
    expect(notes.length).toBe(4 + 4 + 1 + MUSIC_BELL_PATTERN.length);
    // pad = triangle 4 เสียง · sine = ชั้นความสว่าง 4 + เบส 1 + ระฆัง
    expect(notes.filter((n) => n.type === 'triangle').length).toBe(4);
    expect(notes.filter((n) => n.type === 'sine').length).toBe(4 + 1 + MUSIC_BELL_PATTERN.length);
  });

  test('ชั้นความสว่าง (presence) อยู่สูงกว่า pad หนึ่งอ็อกเทฟ — ให้ได้ยินบนลำโพงมือถือ', () => {
    // Phase 22 รอบ 2 (ผู้ใช้: "เสียงดนตรียังเบามาก"): pad เดิม C3–C4 ต่ำเกินกว่าลำโพงมือถือจะออก
    const notes = chordNotes(0);
    const pads = notes.filter((n) => n.type === 'triangle').map((n) => n.freq);
    const presence = notes.filter((n) => n.dur === MUSIC_PRESENCE.durationSeconds);
    expect(presence.length).toBe(4);
    for (const note of presence) {
      // สูงกว่าโน้ต pad ที่ต่ำที่สุด (262–523Hz = ย่านที่มือถือออกได้ดี)
      expect(note.freq).toBeGreaterThan(Math.min(...pads));
      expect(note.freq).toBeGreaterThan(220);
      expect(note.freq).toBeLessThan(1000);
    }
  });

  test('มีเสียงเบสที่ต่ำกว่าโน้ตแพด (ทำให้ได้ยินชัดบนลำโพงมือถือ)', () => {
    const notes = chordNotes(0);
    const sines = notes.filter((n) => n.type === 'sine');
    const bass = sines.reduce((lowest, n) => (n.freq < lowest.freq ? n : lowest), sines[0]);
    const padLowest = Math.min(...notes.filter((n) => n.type === 'triangle').map((n) => n.freq));
    expect(bass.freq).toBeLessThan(padLowest);
  });

  test('ดัชนีคอร์ดเกินขอบเขต/ติดลบ ถูกวนกลับ (ไม่พัง)', () => {
    expect(chordNotes(4)).toEqual(chordNotes(0));
    expect(chordNotes(-1)).toEqual(chordNotes(MUSIC_CHORDS.length - 1));
  });

  test('ความยาวลูป = 4 คอร์ด × ความยาวคอร์ด', () => {
    expect(musicLoopSeconds()).toBe(MUSIC_CHORDS.length * MUSIC_CHORD_SECONDS);
    expect(musicLoopSeconds()).toBeGreaterThan(20); // ลูปยาวพอ ไม่วนถี่จนรำคาญ
  });

  test('ความดังของแต่ละเสียงอยู่ในระดับเบา (ไม่เกิน 0.1)', () => {
    for (let i = 0; i < MUSIC_CHORDS.length; i += 1) {
      for (const note of chordNotes(i)) {
        expect(note.gain).toBeGreaterThan(0);
        expect(note.gain).toBeLessThanOrEqual(0.15);
      }
    }
  });
});
