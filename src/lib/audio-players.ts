// Audio Players — ตัวเล่นเพลงและเสียงบรรยากาศจริง (Phase 21)
//
// ทั้งสองตัวใช้ WebAudio ล้วน (ไม่ใช้ไฟล์) และทำงานแบบ "ตั้งเวลาไว้ล่วงหน้า" (lookahead)
// เพื่อไม่ให้เสียงสะดุดเมื่อแท็บมีงานหนัก — และหยุดทันทีเมื่อผู้ใช้ปิดสวิตช์
import { ambiencePlan, AMBIENCE_SHIMMER, generateNoiseSamples } from '@/lib/ambience';
import {
  MUSIC_CHORD_SECONDS,
  chordNotes,
  musicLoopSeconds,
} from '@/lib/music';

export interface Player {
  start: () => void;
  stop: () => void;
  isPlaying: () => boolean;
}

const LOOKAHEAD_MS = 700;

/** เพลงประกอบ: วนคอร์ดไปเรื่อย ๆ (pad + ระฆังเบา ๆ) */
export function createMusicPlayer(ctx: AudioContext, destination: AudioNode): Player {
  let timer: number | null = null;
  let nextChordAt = 0;
  let chordIndex = 0;
  const active = new Set<OscillatorNode>();

  const scheduleChord = (startAt: number, index: number): void => {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, startAt);
    filter.frequency.linearRampToValueAtTime(2200, startAt + MUSIC_CHORD_SECONDS * 0.5);
    filter.frequency.linearRampToValueAtTime(1200, startAt + MUSIC_CHORD_SECONDS);
    filter.Q.value = 0.6;
    filter.connect(destination);

    for (const note of chordNotes(index)) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = startAt + note.at;
      const end = at + note.dur;

      osc.type = note.type;
      osc.frequency.setValueAtTime(note.freq, at);
      // detune เบา ๆ ให้เสียงไม่แบน (pad เท่านั้น)
      osc.detune.setValueAtTime(note.type === 'triangle' ? -6 : 0, at);

      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(note.gain, at + 1.2);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain);
      gain.connect(filter);
      osc.start(at);
      osc.stop(end + 0.05);
      active.add(osc);
      osc.onended = () => active.delete(osc);
    }

    // ปิดตัวกรองเมื่อคอร์ดจบ (กัน node ค้าง)
    window.setTimeout(() => {
      try {
        filter.disconnect();
      } catch {
        /* ตัดการเชื่อมต่อแล้ว */
      }
    }, (MUSIC_CHORD_SECONDS + 2.5) * 1000);
  };

  const tick = (): void => {
    const horizon = ctx.currentTime + LOOKAHEAD_MS / 1000 + 0.2;
    while (nextChordAt < horizon) {
      if (nextChordAt < ctx.currentTime) nextChordAt = ctx.currentTime + 0.05;
      scheduleChord(nextChordAt, chordIndex);
      nextChordAt += MUSIC_CHORD_SECONDS;
      chordIndex = (chordIndex + 1) % 4;
    }
  };

  return {
    start: () => {
      if (timer !== null) return;
      nextChordAt = ctx.currentTime + 0.1;
      chordIndex = 0;
      tick();
      timer = window.setInterval(tick, 250);
    },
    stop: () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
      for (const osc of active) {
        try {
          osc.stop();
        } catch {
          /* หยุดไปแล้ว */
        }
      }
      active.clear();
    },
    isPlaying: () => timer !== null,
  };
}

/** เสียงบรรยากาศ: ลมพัด (noise กรอง) + ประกายเป็นช่วง ๆ */
export function createAmbiencePlayer(
  ctx: AudioContext,
  destination: AudioNode,
  options: { reduceIntense: boolean }
): Player {
  const plan = ambiencePlan(options.reduceIntense);
  let source: AudioBufferSourceNode | null = null;
  let shimmerTimer: number | null = null;
  let filter: BiquadFilterNode | null = null;
  let tremoloNode: GainNode | null = null;
  let playing = false;

  const startShimmer = (): void => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = ctx.currentTime + 0.05;
    const end = at + AMBIENCE_SHIMMER.durationSeconds;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(options.reduceIntense ? AMBIENCE_SHIMMER.frequencies[0] : AMBIENCE_SHIMMER.frequencies[1], at);
    osc.frequency.linearRampToValueAtTime(AMBIENCE_SHIMMER.frequencies[0], end);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(AMBIENCE_SHIMMER.gain, at + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(at);
    osc.stop(end + 0.05);
  };

  return {
    start: () => {
      if (playing) return;
      const samples = generateNoiseSamples(Math.floor(ctx.sampleRate * plan.noiseSeconds));
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.getChannelData(0).set(samples);

      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      filter = ctx.createBiquadFilter();
      filter.type = plan.filterType;
      filter.frequency.value = plan.filterFrequency;
      filter.Q.value = plan.filterQ;

      // หายใจของลม (tremolo): ปรับความดังขึ้น-ลงช้า ๆ — ไม่ให้เป็น noise นิ่ง ๆ
      const tremolo = ctx.createGain();
      tremoloNode = tremolo;
      tremolo.gain.value = 1 - plan.tremoloDepth / 2;
      const tremoloLfo = ctx.createOscillator();
      const tremoloDepth = ctx.createGain();
      tremoloLfo.frequency.value = plan.tremoloFrequency;
      tremoloDepth.gain.value = plan.tremoloDepth / 2;
      tremoloLfo.connect(tremoloDepth);
      tremoloDepth.connect(tremolo.gain);
      tremoloLfo.start();

      // LFO ขยับความถี่กรอง → ลมดัง-เบาเป็นจังหวะ
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = plan.lfoFrequency;
      lfoGain.gain.value = plan.lfoDepth;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();

      source.connect(filter);
      filter.connect(tremolo);
      tremolo.connect(destination);
      source.start();

      shimmerTimer = window.setInterval(startShimmer, AMBIENCE_SHIMMER.everySeconds * 1000);
      playing = true;
    },
    stop: () => {
      if (shimmerTimer !== null) {
        window.clearInterval(shimmerTimer);
        shimmerTimer = null;
      }
      try {
        source?.stop();
        source?.disconnect();
        filter?.disconnect();
        tremoloNode?.disconnect();
      } catch {
        /* หยุดไปแล้ว */
      }
      source = null;
      filter = null;
      tremoloNode = null;
      playing = false;
    },
    isPlaying: () => playing,
  };
}

/** ความยาวลูปเพลง (วินาที) — ใช้แสดง/ตรวจสอบ */
export const MUSIC_LOOP_SECONDS = musicLoopSeconds();
