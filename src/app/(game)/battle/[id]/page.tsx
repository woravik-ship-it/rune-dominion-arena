'use client';

import { apiFetch } from '@/lib/api-client';
import { useAudio } from '@/components/providers/AudioProvider';
import { battleSfxFor } from '@/lib/sfx';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { BattleLogEntry, CombatCard } from '@/services/combat';
import { BATTLE_ACTION_ICON, buildReplayFrames, cardStatuses } from '@/services/battle-replay';
import { battleLogUrl, parseBattleRouteId } from '@/lib/battle-route';
import type { BattleCardMeta } from '@/services/battle-display';
import { refightBody } from '@/services/battle-display';
import CardFace from '@/components/cards/CardFace';
import { BATTLE_MANA_MAX } from '@/lib/constants';

/** เด็คของแต่ละฝ่าย (จาก API) — ใช้ปุ่ม "ต่อสู้อีกครั้ง" */
interface BattleDeckRef {
  id: string;
  name: string | null;
}

interface BattleData {
  battleId: string;
  winner: 'A' | 'B' | 'DRAW';
  roundsPlayed: number;
  log: BattleLogEntry[];
  teams: { A: CombatCard[]; B: CombatCard[] } | null;
  /** ชื่อทีม (ชื่อ Deck จริง) จาก API */
  teamNames: { A: string; B: string };
  /** ข้อมูลการ์ดสำหรับวาดการ์ดเต็มใบ (key = cardId) */
  cardMeta: Record<string, BattleCardMeta>;
  /** เด็คของสองฝ่าย (ฝ่าย B เป็น null เมื่อสู้กับบอท/ดันเจี้ยน) */
  decks: { A: BattleDeckRef | null; B: BattleDeckRef | null };
  isBotBattle: boolean;
  /** ศึกดันเจี้ยน: ซ่อนปุ่มต่อสู้อีกครั้งแบบ PvP แล้วโชว์ปุ่มลุยชั้นถัดไปแทน */
  /** ศึกฟาร์มแผนที่ (Map 2026-10-03): ปุ่มกลับแผนที่ + ซ่อนต่อสู้อีกครั้งแบบ PvP */
  isMap?: boolean;
  map?: {
    nodeId: string; nodeNameTh: string; zone: string | null;
    zoneNameTh: string; icon: string;
  } | null;
  isDungeon?: boolean;
  dungeon?: {
    code: string; nameTh: string; floor: number; icon: string;
    /** Phase 38: จำนวนชั้นทั้งหมด + ชั้นถัดไป (null = อยู่ชั้นสุดท้าย) */
    floors?: number; nextFloor?: number | null; coinCost?: number;
  } | null;
  reward?: { dust: number; shards: number; itemDropped: string | null; itemNameTh: string | null; jewel?: number; eligible?: boolean } | null;
}

// ความเร็วตามคำสั่งผู้ใช้: x1 ดูออก (ไม่เร่งใส) · x4/x8 เร็วขึ้น · ข้าม = รู้ผลเลย
const SPEEDS = [1, 4, 8] as const;
const STEP_MS: Record<number, number> = { 1: 900, 4: 220, 8: 90 };

/**
 * ระยะห่างขั้นต่ำระหว่างเสียงต่อสู้ (มิลลิวินาที) — Phase 22
 * ที่ความเร็ว x8 เหตุการณ์เกิดทุก 90ms ⇒ ถ้าไม่กันไว้ เสียงจะซ้อนกันจนเป็นเสียงตื๊ดเดียว
 */
const BATTLE_SFX_MIN_GAP_MS = 60;

const ELEMENT_BORDER: Record<string, string> = {
  EMBERBOUND: '#f97316',
  TIDEBORN: '#38bdf8',
  SKYRIVEN: '#a78bfa',
  ROOTFORGED: '#4ade80',
  DAWNSWORN: '#fbbf24',
  VEILMARKED: '#c084fc',
};

function barColor(pct: number): string {
  if (pct > 50) return 'bg-emerald-500';
  if (pct > 25) return 'bg-amber-400';
  return 'bg-red-500';
}

export default function BattleViewerPage() {
  const params = useParams();
  const router = useRouter();
  /**
   * id ของศึกจาก URL — อาจเป็น `dungeon-run:<runId>` (ดันเจี้ยน) หรือ battleId ปกติ
   * ⚠️ Next ส่งค่าที่ percent-encode มาได้ → ต้องถอดรหัสก่อนใช้ (ดู lib/battle-route)
   */
  const battleId = String(params.id ?? '');
  const routeRef = useMemo(() => parseBattleRouteId(battleId), [battleId]);
  const [battle, setBattle] = useState<BattleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  /** สถานะของปุ่ม "ต่อสู้อีกครั้ง" (กำลังสร้างศึกใหม่) + ข้อความผิดพลาด */
  const [refighting, setRefighting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Phase 38: กำลังพาไปชั้นถัดไปของดันเจี้ยน */
  const [nextBusy, setNextBusy] = useState(false);
  const { play, setMusicTrack } = useAudio();
  // Phase 21: เสียงผลการต่อสู้ — เล่นครั้งเดียวตอนเทปจบ
  const resultSfxRef = useRef(false);
  // Phase 22: เวลาเล่นเสียงต่อสู้ครั้งล่าสุด (กันเสียงซ้อนกันที่ความเร็วสูง)
  const lastBattleSfxAt = useRef(0);
  /** Phase 24.2: นับครั้งที่โจมตีในเทป — ใช้สลับเสียง ดาบ/ดาบกระทบดาบ ไม่ให้ซ้ำเสียงเดิม */
  const attackIndex = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadBattle(); }, [battleId]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  // เปลี่ยนความเร็วกลางคันขณะกำลังเล่น → เริ่ม interval ใหม่ด้วยจังหวะใหม่
  useEffect(() => {
    if (playing) startPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed]);

  const loadBattle = async () => {
    try {
      // ดันเจี้ยนใช้ runId แทน battleId (dungeon-run:<runId>) → ดึงจาก API ดันเจี้ยน
      // ⚠️ id ที่ได้จาก URL อาจถูก percent-encode (มี ':' ในรหัส) — ถอดรหัส/ประกอบ URL ใน lib/battle-route
      const res = await apiFetch(battleLogUrl(routeRef));
      const data = await res.json();
      if (res.ok) {
        const bd = data.data.battleData;
        setBattle({
          battleId: data.data.battleId,
          winner: bd.winner,
          roundsPlayed: bd.roundsPlayed,
          log: bd.log ?? [],
          teams: bd.teams ?? null,
          // ชื่อทีม/ข้อมูลการ์ดมาจาก API (ผู้ใช้สั่ง: ชื่อทีม = ชื่อ Deck · การ์ดวาดเต็มใบ)
          teamNames: data.data.teamNames ?? { A: 'ทีมของฉัน', B: 'คู่ต่อสู้' },
          cardMeta: data.data.cardMeta ?? {},
          decks: data.data.decks ?? { A: null, B: null },
          isBotBattle: Boolean(data.data.isBotBattle),
          isDungeon: Boolean(data.data.isDungeon),
          dungeon: data.data.dungeon ?? null,
          isMap: Boolean(data.data.isMap),
          map: data.data.map ?? null,
          reward: data.data.reward ?? null,
        });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const startPlay = () => {
    if (!battle) return;
    setPlaying(true);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setVisibleCount((c) => {
        if (c >= (battle?.log.length ?? 0)) {
          if (timer.current) clearInterval(timer.current);
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, STEP_MS[speed] ?? 900);
  };

  const pausePlay = () => {
    setPlaying(false);
    if (timer.current) clearInterval(timer.current);
  };

  const skipAll = () => {
    pausePlay();
    if (battle) setVisibleCount(battle.log.length);
  };

  const restart = () => {
    pausePlay();
    setVisibleCount(0);
    attackIndex.current = 0; // เริ่มเทปใหม่ → เริ่มนับการโจมตีใหม่ (เสียงดาบ/ชนดาบสลับเหมือนเดิม)
  };

  /** "ดู Replay" — ย้อนไปเฟรมแรกแล้วเล่นใหม่ทันที (ใช้เมื่อศึกจบแล้ว) */
  const replayFromStart = () => {
    pausePlay();
    setVisibleCount(0);
    attackIndex.current = 0;
    // ให้ state รีเซ็ตก่อน แล้วค่อยเริ่ม interval (ไม่งั้นเฟรมแรกจะถูกข้าม)
    setTimeout(() => startPlay(), 0);
  };

  /**
   * Phase 38: "ไปชั้นถัดไป" — ผู้ใช้สั่ง
   *   "หลังต่อสู้ดันเจี้ยนชนะชั้นปัจจุบัน มีปุ่มกดไปสู่ชั้นต่อไป ไม่ต้องย้อนมาหน้าเลือกดันเจี้ยน"
   * ⇒ ยิงลุยชั้นถัดไปด้วยเด็คเดิม แล้วพาไปหน้าสนามรบของชั้นนั้นทันที
   */
  const goNextFloor = async () => {
    const next = battle?.dungeon?.nextFloor ?? null;
    const deckId = battle?.decks.A?.id ?? null;
    const code = battle?.dungeon?.code ?? null;
    if (!next || !deckId || !code) {
      setActionError('ไปชั้นถัดไปไม่ได้ — ไม่พบเด็คของศึกนี้');
      return;
    }
    setActionError(null);
    setNextBusy(true);
    try {
      const res = await apiFetch('/api/dungeons/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dungeonCode: code, floor: next, deckId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) { setActionError(data?.error || 'ไปชั้นถัดไปไม่สำเร็จ'); return; }
      window.location.href = data.data.battleUrl;
    } catch (e) {
      console.error(e);
      setActionError('ไปชั้นถัดไปไม่สำเร็จ');
    } finally {
      setNextBusy(false);
    }
  };

  /**
   * "ต่อสู้อีกครั้ง" — สร้างศึกใหม่ด้วยเด็คเดิม (ผู้ใช้สั่ง: ศึกที่ผ่านไปแล้วต้องสู้ใหม่ได้)
   * ยิง /api/battle/simulate เหมือนหน้าท้าทายบอท แล้วพาไปดูผลของศึกใหม่
   */
  const refight = async () => {
    const body = refightBody(battle?.decks.A?.id, battle?.decks.B?.id);
    if (!body) {
      setActionError('ศึกนี้ไม่ได้เก็บทีมไว้ — เริ่มศึกใหม่ได้ที่หน้าต่อสู้');
      return;
    }
    setActionError(null);
    setRefighting(true);
    try {
      const res = await apiFetch('/api/battle/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error || 'เริ่มสู้ใหม่ไม่สำเร็จ'); return; }
      router.push(`/battle/${data.data.battleId}`);
    } catch (e) {
      console.error(e);
      setActionError('เริ่มสู้ใหม่ไม่สำเร็จ');
    } finally { setRefighting(false); }
  };

  // เฟรมทั้งหมด (คำนวณครั้งเดียวต่อ battle) + เฟรมปัจจุบันตาม visibleCount
  const frames = useMemo(
    () => (battle?.teams ? buildReplayFrames(battle.teams.A, battle.teams.B, battle.log) : []),
    [battle]
  );
  const frame = frames[visibleCount] ?? null;

  // ข้อความล่าสุดอยู่ด้านบน (reverse) — ไม่ต้องเลื่อนเอง เห็นเหตุการณ์ใหม่ทันที
  const newestFirst = useMemo(
    () => (battle ? battle.log.slice(0, visibleCount).reverse() : []),
    [battle, visibleCount]
  );

  // Phase 22: เสียงประกอบตามเหตุการณ์ที่เพิ่งปรากฏในเทป
  // ผู้ใช้สั่ง 2026-09-20: "เสียงตอนต่อสู้ก็ไม่มี ทำเป็นเสียงดาบ เสียงปล่อยสกอล หน่อย"
  //   attack → ฟันดาบ · skill → ปล่อยสกอล (โล่ = กางโล่) · burn/heal/faint → เสียงเฉพาะ
  useEffect(() => {
    if (!battle || visibleCount === 0) return;
    const entry = battle.log[visibleCount - 1];
    if (!entry) return;
    const now = Date.now();
    if (now - lastBattleSfxAt.current < BATTLE_SFX_MIN_GAP_MS) return;
    // Phase 24.2: สลับ "ฟันดาบ" กับ "ดาบกระทบดาบ" (ทุกครั้งที่ 3) — เล่นเสียงเดิมซ้ำทุกครั้งฟังไม่สมจริง
    const soundIndex = entry.action === 'attack' ? attackIndex.current : 0;
    const name = battleSfxFor(entry.action, entry.statusApplied, soundIndex);
    if (!name) return;
    attackIndex.current = soundIndex + 1;
    lastBattleSfxAt.current = now;
    play(name);
  }, [battle, visibleCount, play]);

  // Phase 35: ศึกดันเจี้ยนใช้เพลงประจำดันเจี้ยน (ศึกปกติใช้เพลงธีม)
  useEffect(() => {
    if (!battle) return;
    setMusicTrack(battle.isDungeon ? 'dungeon' : 'main');
    return () => setMusicTrack('main');
  }, [battle, setMusicTrack]);

  // Phase 21: เล่นเสียงตอนเทปจบ (ชนะ/แพ้/เสมอ) — ครั้งเดียวต่อศึก
  useEffect(() => {
    if (!battle) return;
    const isFinished = visibleCount >= battle.log.length;
    if (!isFinished || resultSfxRef.current) return;
    resultSfxRef.current = true;
    if (battle.winner === 'A') play('battle_win');
    else if (battle.winner === 'B') play('battle_lose');
    else play('ui_back');
  }, [battle, visibleCount, play]);


  if (loading) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <p className="text-gray-400">กำลังโหลด...</p>
      </main>
    );
  }

  if (!battle) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">ไม่พบการต่อสู้</p>
          <Link href="/decks" className="btn-primary mt-4 inline-block">กลับไปจัดทีม</Link>
        </div>
      </main>
    );
  }

  const finished = visibleCount >= battle.log.length;
  const resultText =
    battle.winner === 'A' ? '🎉 ชนะ!' : battle.winner === 'B' ? '💀 แพ้' : '🤝 เสมอ';

  const hpPctA = frame && frame.maxHpA > 0 ? (frame.hpA / frame.maxHpA) * 100 : 0;
  const hpPctB = frame && frame.maxHpB > 0 ? (frame.hpB / frame.maxHpB) * 100 : 0;

  const renderSide = (cards: NonNullable<typeof frame>['teamA']) => (
    <div className="grid grid-cols-5 gap-1">
      {cards.map((c) => {
        const meta = battle.cardMeta[c.cardId];
        const isAttacker = frame?.attackerId === c.cardId;
        const isDefender = frame?.defenderId === c.cardId;
        const pct = c.maxHp > 0 ? (c.hp / c.maxHp) * 100 : 0;
        const mpPct = (c.mana / BATTLE_MANA_MAX) * 100;
        const border = ELEMENT_BORDER[c.element] ?? '#6b7280';
        const statuses = cardStatuses(c);
        return (
          <div
            key={c.cardId}
            data-battle-card={c.cardId}
            data-battle-attacker={isAttacker ? 'true' : 'false'}
            data-battle-defender={isDefender ? 'true' : 'false'}
            data-battle-hp={c.hp}
            data-battle-mp={c.mana}
            data-battle-status={statuses.map((s) => s.key).join(',')}
            className="min-w-0"
          >
            {/* การ์ดเต็มใบ (ภาพ AI + กรอบ/ชื่อ/สเตตัส + แสงเรือง) — ผู้ใช้สั่ง "แสดงรูปการ์ดแบบเต็ม" */}
            <div
              className={`relative aspect-[7/10] overflow-hidden rounded-lg border-2 bg-black/40 transition-all ${
                c.alive ? '' : 'opacity-40 grayscale'
              }`}
              style={{
                borderColor: c.alive ? border : '#4b5563',
                boxShadow: isAttacker
                  ? '0 0 10px #fbbf24'
                  : isDefender
                    ? '0 0 10px rgba(239,68,68,0.8)'
                    : undefined,
              }}
              title={`${c.nameTh || c.name} · HP ${c.hp}/${c.maxHp} · MP ${c.mana}/${BATTLE_MANA_MAX}${
                statuses.length ? ` · ${statuses.map((s) => s.label).join(' · ')}` : ''
              }`}
            >
              <CardFace
                cardId={c.cardId}
                imageUrl={meta?.imageUrl}
                imageStatus={meta?.imageStatus}
                rarity={meta?.rarity}
                alt={c.nameTh || c.name}
              />
              {isDefender && (
                <span
                  className="pointer-events-none absolute inset-0 rounded-md bg-red-500/30"
                  data-battle-hit="true"
                />
              )}
              {/* สัญลักษณ์ดาบ/โล่ — วาง "กลางการ์ด" (ผู้ใช้สั่ง: ไว้มุมแล้วตกขอบ) */}
              {(isAttacker || isDefender) && (
                <span
                  data-battle-marker={isAttacker ? 'attacker' : 'defender'}
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full bg-black/75 text-xl leading-none ring-2 ${
                      isAttacker ? 'ring-amber-300 shadow-[0_0_12px_#fbbf24]' : 'ring-sky-300 shadow-[0_0_12px_#38bdf8]'
                    }`}
                    title={isAttacker ? 'กำลังโจมตี' : 'กำลังรับการโจมตี'}
                  >
                    {isAttacker ? '⚔️' : '🛡️'}
                  </span>
                </span>
              )}
              {!c.alive && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 text-xl">
                  💀
                </span>
              )}
            </div>

            {/* HP/MP ต่อใบ — วางใต้การ์ด ไม่ทับรูป */}
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-700" title={`HP ${c.hp}/${c.maxHp}`}>
              <div className={`h-full ${barColor(pct)}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
            </div>
            <div className="flex justify-between text-[9px] leading-tight">
              <span className="text-emerald-300">❤️ {c.hp}</span>
              <span className="text-sky-300">🔷 {c.mana}</span>
            </div>
            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-gray-700" title={`MP ${c.mana}/${BATTLE_MANA_MAX}`}>
              <div className="h-full bg-sky-400" style={{ width: `${Math.max(0, Math.min(100, mpPct))}%` }} />
            </div>
            {statuses.length > 0 && (
              <div className="mt-0.5 flex flex-wrap justify-center gap-0.5 text-[9px] leading-none">
                {statuses.map((s) => (
                  <span
                    key={s.key}
                    data-battle-status-badge={s.key}
                    title={s.label}
                    className="rounded bg-black/50 px-0.5 py-px"
                  >
                    {s.icon}
                    {s.key === 'BURN' && c.burnStacks > 1 ? c.burnStacks : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <main className="min-h-screen p-4">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-center mb-1">
          {battle.isMap && battle.map
            ? `${battle.map.icon} ${battle.map.zoneNameTh} · ${battle.map.nodeNameTh}`
            : battle.isDungeon && battle.dungeon
              ? `${battle.dungeon.icon} ${battle.dungeon.nameTh} ชั้น ${battle.dungeon.floor}`
              : 'สนามรบ'}
        </h1>
        {/* ชื่อทีม = ชื่อ Deck จริงของแต่ละฝ่าย (ผู้ใช้สั่ง) */}
        <p className="text-center text-gray-400 text-sm mb-4">
          <span data-team-name="A" className="text-blue-300 font-bold">{battle.teamNames.A}</span>
          <span className="mx-1">vs</span>
          <span data-team-name="B" className="text-red-300 font-bold">{battle.teamNames.B}</span>
          {' • '}{battle.roundsPlayed} รอบ
        </p>

        {finished && (
          <div data-battle-finished="true" className="mb-3 rounded-xl border border-amber-700/40 bg-amber-950/10 p-3">
            <div className="mb-2 text-center text-3xl font-bold">{resultText}</div>
            {/* ผู้ใช้สั่ง: "การต่อสู้ผ่านไปแล้ว สามารถกดดู Replay หรือต่อสู้ใหม่ได้" */}
            <div className="flex flex-wrap gap-2">
              <button data-battle-replay onClick={replayFromStart} className="btn-primary flex-1 text-sm">
                🔁 ดู Replay
              </button>
              {battle.isDungeon && battle.winner === 'A' && battle.dungeon?.nextFloor ? (
                <button
                  type="button"
                  data-dungeon-next-floor={battle.dungeon.nextFloor}
                  onClick={goNextFloor}
                  disabled={nextBusy}
                  className="btn-primary flex-1 text-sm font-bold"
                >
                  {nextBusy
                    ? 'กำลังไปชั้นถัดไป…'
                    : `▶ ลุยชั้น ${battle.dungeon.nextFloor} ต่อ${battle.dungeon.coinCost ? ` (${battle.dungeon.coinCost} Coin)` : ''}`}
                </button>
              ) : null}
              {battle.isMap ? (
                <Link
                  data-map-return
                  href="/map"
                  className="btn-primary flex-1 text-center text-sm"
                >
                  🗺️ กลับแผนที่ (ฟาร์มต่อ)
                  {battle.reward &&
                  (battle.reward.dust > 0 || battle.reward.shards > 0 || battle.reward.itemDropped || (battle.reward.jewel ?? 0) > 0)
                    ? ` · ✨ +${battle.reward.dust} · 💠 +${battle.reward.shards}${battle.reward.itemDropped ? ` · 🎁 ${battle.reward.itemNameTh}` : ''}${(battle.reward.jewel ?? 0) > 0 ? ` · 💎 +${battle.reward.jewel ?? 0}` : ''}`
                    : battle.winner === 'A'
                      ? ' · ไม่มีดรอปครั้งนี้'
                      : ''}
                </Link>
              ) : battle.isDungeon ? (
                <Link
                  data-dungeon-next={battle.dungeon?.code ?? 'dungeon'}
                  href="/dungeons"
                  className="btn-secondary flex-1 text-center text-sm"
                >
                  🏰 กลับดันเจี้ยน
                  {battle.reward && battle.reward.eligible === false
                    ? ' · รอบซ้อม (ชั้นนี้ผ่านแล้ว ไม่มีรางวัล)'
                    : battle.reward && battle.reward.dust > 0
                      ? ` · ✨ +${battle.reward.dust}${battle.reward.itemDropped ? ` · 🎁 ${battle.reward.itemNameTh}` : ''}`
                      : battle.reward
                        ? ' · รอบนี้ยังไม่ได้รางวัล (ชนะเท่านั้น)'
                        : ''}
                </Link>
              ) : (
                <button
                  data-battle-refight
                  onClick={refight}
                  disabled={refighting}
                  className="btn-secondary flex-1 text-sm disabled:opacity-50"
                >
                  {refighting ? 'กำลังเริ่มศึกใหม่...' : '⚔️ ต่อสู้อีกครั้ง'}
                </button>
              )}
            </div>
            {!battle.isMap && !battle.isDungeon && (
              <p className="mt-2 text-center text-[11px] text-gray-400">
                ต่อสู้อีกครั้ง = ศึกใหม่ด้วยทีมเดิม {battle.isBotBattle ? '(คู่ต่อสู้เป็นบอท)' : `(คู่ต่อสู้ ${battle.decks.B?.name ?? '-'})`}
              </p>
            )}
            {actionError && (
              <p className="mt-2 text-center text-xs text-red-400">{actionError}</p>
            )}
          </div>
        )}

        {frame && (
          <div className="mb-3 space-y-1.5 rounded-xl bg-gray-800/70 p-2.5">
            <div>
              <div className="mb-0.5 flex justify-between text-[11px]">
                <span className="font-bold text-blue-300">🛡️ {battle.teamNames.A} (ล่าง) HP รวม</span>
                <span className="text-gray-200" data-team-hp="A">{frame.hpA.toLocaleString('th-TH')}/{frame.maxHpA.toLocaleString('th-TH')}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                <div className={`h-full ${barColor(hpPctA)} transition-all duration-300`} style={{ width: `${hpPctA}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-0.5 flex justify-between text-[11px]">
                <span className="font-bold text-red-300">⚔️ {battle.teamNames.B} (บน) HP รวม</span>
                <span className="text-gray-200" data-team-hp="B">{frame.hpB.toLocaleString('th-TH')}/{frame.maxHpB.toLocaleString('th-TH')}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                <div className={`h-full ${barColor(hpPctB)} transition-all duration-300`} style={{ width: `${hpPctB}%` }} />
              </div>
            </div>
          </div>
        )}

        {frame ? (
          <div className="mb-3 space-y-2">
            <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-2">
              <p className="mb-1 text-[11px] font-bold text-red-300">⬆ {battle.teamNames.B} (บน)</p>
              {renderSide(frame.teamB)}
            </div>
            <div className="text-center text-[11px] text-gray-500">⚔️ VS ⚔️</div>
            <div className="rounded-xl border border-blue-900/50 bg-blue-950/20 p-2">
              <p className="mb-1 text-[11px] font-bold text-blue-300">⬇ {battle.teamNames.A} (ล่าง)</p>
              {renderSide(frame.teamA)}
            </div>
          </div>
        ) : (
          <p className="mb-3 rounded-xl bg-gray-800 p-3 text-center text-xs text-gray-400">
            ศึกนี้ไม่มีการ์ดให้แสดง — ดูได้เฉพาะลำดับเหตุการณ์
          </p>
        )}

        <div className="flex gap-2 justify-center mb-3 flex-wrap">
          {!playing ? (
            <button onClick={startPlay} className="btn-primary text-sm">
              {visibleCount === 0 ? '▶ เริ่มเล่น' : '▶ เล่นต่อ'}
            </button>
          ) : (
            <button onClick={pausePlay} className="btn-secondary text-sm">⏸ หยุด</button>
          )}
          <button onClick={restart} className="btn-secondary text-sm">↺ เริ่มใหม่</button>
          <button onClick={skipAll} className="btn-secondary text-sm">⏩ ข้าม</button>
          <div className="flex gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-3 py-2 rounded-xl text-sm ${speed === s ? 'bg-amber-500 font-bold' : 'bg-white/10'}`}
              >
                x{s}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-3 mb-3">
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
              style={{ width: `${battle.log.length ? (visibleCount / battle.log.length) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 text-center">{visibleCount}/{battle.log.length} เหตุการณ์ · ความเร็ว x{speed}</p>
        </div>

        <div data-battle-log="true" className="space-y-1 mb-6 max-h-[420px] overflow-y-auto">
          {visibleCount === 0 && (
            <p className="text-center text-gray-500 text-sm">กดเริ่มเล่นเพื่อดูการต่อสู้</p>
          )}
          {newestFirst.map((entry) => {
            const key = `${entry.round}-${entry.order}`;
            const icon = BATTLE_ACTION_ICON[entry.action] ?? '•';
            return (
              <div
                key={key}
                data-log-order={entry.order}
                className={`text-sm px-3 py-1.5 rounded-lg ${
                  entry.actorSide === 'A' ? 'bg-blue-900/40 text-blue-100' : 'bg-red-900/40 text-red-100'
                } ${entry.action === 'faint' ? 'opacity-70 italic' : ''}`}
              >
                <span className="mr-1">{icon}</span>
                <span className="text-gray-400 text-xs">R{entry.round} • </span>
                {entry.messageTh}
                {typeof entry.damage === 'number' && (
                  <span className="text-red-300"> (-{entry.damage})</span>
                )}
                {typeof entry.healing === 'number' && (
                  <span className="text-emerald-300"> (+{entry.healing})</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <Link href="/decks" className="btn-secondary text-sm flex-1 text-center">กลับไปจัดทีม</Link>
          {battle.isMap ? (
            <Link href="/map" className="btn-primary text-sm flex-1 text-center">🗺️ กลับแผนที่</Link>
          ) : (
            <Link href="/discover" className="btn-primary text-sm flex-1 text-center">ค้นหารูนต่อ</Link>
          )}
        </div>
      </div>
    </main>
  );
}
