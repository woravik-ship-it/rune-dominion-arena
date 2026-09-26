// Music Engine — เพลงประกอบแบบสังเคราะห์เอง (Phase 21)
//
// ผู้ใช้สั่ง 2026-09-26: "มีเมนูเสียง แต่ไม่เห็นมีเสียงเลย ทำเสียงประกอบด้วย"
// ⇒ สร้างเพลงจริงด้วย WebAudio (ไม่ใช้ไฟล์/License) เป็นลูปบรรยากาศแนว Aetherra:
//    • Pad: คอร์ดละ ~7.5 วินาที (2 คลื่นต่อโน้ต × detune เบา ๆ) ผ่าน lowpass ที่ขยับช้า ๆ
//    • Bell: เสียงระฆังเบา ๆ ตีเป็นจังหวะทุก 2.5 วินาที ไล่ตามโน้ตในคอร์ด
//    • Progression 4 คอร์ดวนซ้ำ (i–VI–III–VII ในบันได Aeolian = บรรยากาศขลังแต่ไม่หม่น)
//
// ส่วนที่บริสุทธิ์ (คำนวณโน้ต/ความถี่/ตารางเวลา) แยกออกมาให้เทสต์ได้โดยไม่ต้องมี WebAudio
export const MS_PER_BEAT_DEFAULT = 2500;

/** โน้ตอ้างอิง A4 = 440Hz (MIDI 69) */
export const A4_MIDI = 69;
export const A4_FREQ = 440;

/** แปลงหมายเลขโน้ต MIDI → ความถี่ (Hz) */
export function midiToFreq(midi: number): number {
  return Number((A4_FREQ * 2 ** ((midi - A4_MIDI) / 12)).toFixed(3));
}

/**
 * คอร์ดของเพลงธีม (offsets จาก C3 = MIDI 48)
 * i (Cm) → VI (Ab) → III (Eb) → VII (Bb) — วนซ้ำ 4 คอร์ด
 */
export const MUSIC_CHORDS: readonly (readonly number[])[] = Object.freeze([
  [0, 3, 7, 12], // Cm
  [-4, 0, 3, 8], // Ab
  [3, 7, 10, 15], // Eb
  [-2, 2, 5, 10], // Bb
]);

export const MUSIC_ROOT_MIDI = 48; // C3
/** เสียงระฆังไล่ตามโน้ตในคอร์ด (index ของโน้ตที่ใช้ตีแต่ละครั้ง) */
export const MUSIC_BELL_PATTERN: readonly number[] = Object.freeze([2, 1, 3, 1]);
export const MUSIC_CHORD_SECONDS = 7.5;
export const MUSIC_BELL_EVERY_SECONDS = 2.2;

/**
 * ชั้น "ความสว่าง" (presence) อ็อกเทฟบน — Phase 22 รอบ 2
 *
 * เหตุผลจริง: ผู้ใช้ฟังบนมือถือ ⇒ pad เดิมอยู่ที่ C3–C4 (130–262Hz) ซึ่ง **ลำโพงมือถือออกแทบไม่ได้**
 * ⇒ ได้ยินเพลงเบา/เหมือนไม่มี ทั้งที่เกนถูกต้อง · ชั้นนี้ย้ายโน้ตขึ้น +12 ครึ่งเสียง (C4–C5 = 262–523Hz)
 *   ซึ่งเป็นย่านที่ลำโพงมือถือถ่ายทอดได้ดีที่สุด ⇒ ได้ยิน "ทำนอง" ชัดขึ้นโดยไม่ต้องเพิ่มความดังจนแตก
 */
export const MUSIC_PRESENCE = {
  /** ระยะห่างจากโน้ต pad (semitone) — 12 = หนึ่งอ็อกเทฟ */
  octaveOffset: 12,
  /**
   * เกนชั้นความสว่าง — ตั้งให้ใกล้เคียง pad (0.11) เพราะเป็นชั้นที่ "ได้ยินจริง" บนมือถือ
   * (pad 130–262Hz เกือบไม่ถูกถ่ายทอด / presence 262–523Hz ถ่ายทอดเต็มที่)
   */
  gain: 0.09,
  /** สั้นกว่า pad เล็กน้อยเพื่อไม่ให้ทับช่วงเปลี่ยนคอร์ด */
  durationSeconds: MUSIC_CHORD_SECONDS + 1.0,
} as const;

export interface MusicNote {
  freq: number;
  /** เวลาเริ่ม (วินาทีจากจุดเริ่มของคอร์ด) */
  at: number;
  dur: number;
  gain: number;
  type: OscillatorType;
}

/** โน้ตทั้งหมดของคอร์ดหนึ่ง (pad + presence + เบส + bell) — บริสุทธิ์ เทสต์ได้ */
export function chordNotes(chordIndex: number): MusicNote[] {
  const chord = MUSIC_CHORDS[((chordIndex % MUSIC_CHORDS.length) + MUSIC_CHORDS.length) % MUSIC_CHORDS.length];
  const notes: MusicNote[] = chord.map((offset, i) => ({
    freq: midiToFreq(MUSIC_ROOT_MIDI + offset),
    at: i * 0.08, // pad ตีเหลื่อมกันเล็กน้อยให้เสียงหนา
    dur: MUSIC_CHORD_SECONDS + 1.5,
    gain: 0.11,
    type: 'triangle' as OscillatorType,
  }));

  // ชั้นความสว่าง (อ็อกเทฟบน) — ทำให้ได้ยินเพลงบนลำโพงมือถือ (Phase 22 รอบ 2)
  for (let i = 0; i < chord.length; i += 1) {
    notes.push({
      freq: midiToFreq(MUSIC_ROOT_MIDI + chord[i] + MUSIC_PRESENCE.octaveOffset),
      at: 0.12 + i * 0.06,
      dur: MUSIC_PRESENCE.durationSeconds,
      gain: MUSIC_PRESENCE.gain,
      type: 'sine' as OscillatorType,
    });
  }

  // เสียงเบส (รากคอร์ดหนึ่งอ็อกเทฟต่ำลง) — ทำให้เพลงมีเนื้อและได้ยินชัดบนลำโพงมือถือ
  notes.push({
    freq: midiToFreq(MUSIC_ROOT_MIDI + chord[0] - 12),
    at: 0,
    dur: MUSIC_CHORD_SECONDS + 1.2,
    gain: 0.14,
    type: 'sine' as OscillatorType,
  });

  // เสียงระฆัง — ยกเกนขึ้นเล็กน้อย (Phase 22 รอบ 2: เดิม 0.075 แทบไม่ได้ยินบนมือถือ)
  for (let bell = 0; bell < MUSIC_BELL_PATTERN.length; bell += 1) {
    const noteIndex = MUSIC_BELL_PATTERN[bell] % chord.length;
    notes.push({
      freq: midiToFreq(MUSIC_ROOT_MIDI + 12 + chord[noteIndex]),
      at: bell * MUSIC_BELL_EVERY_SECONDS,
      dur: 1.8,
      gain: 0.1,
      type: 'sine' as OscillatorType,
    });
  }
  return notes;
}

/** เวลารวมของหนึ่งรอบเพลง (4 คอร์ด) */
export function musicLoopSeconds(): number {
  return MUSIC_CHORDS.length * MUSIC_CHORD_SECONDS;
}
