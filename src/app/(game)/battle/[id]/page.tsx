'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { BattleLogEntry, CombatCard } from '@/services/combat';
import { BATTLE_ACTION_ICON, buildReplayFrames, cardStatuses } from '@/services/battle-replay';
import { BATTLE_MANA_MAX } from '@/lib/constants';

interface BattleData {
  battleId: string;
  winner: 'A' | 'B' | 'DRAW';
  roundsPlayed: number;
  log: BattleLogEntry[];
  teams: { A: CombatCard[]; B: CombatCard[] } | null;
}

// ความเร็วตามคำสั่งผู้ใช้: x1 ดูออก (ไม่เร่งใส) · x4/x8 เร็วขึ้น · ข้าม = รู้ผลเลย
const SPEEDS = [1, 4, 8] as const;
const STEP_MS: Record<number, number> = { 1: 900, 4: 220, 8: 90 };

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
  const battleId = params.id as string;
  const [battle, setBattle] = useState<BattleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
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
      const res = await apiFetch(`/api/battle/${battleId}/log`);
      const data = await res.json();
      if (res.ok) {
        const bd = data.data.battleData;
        setBattle({
          battleId: data.data.battleId,
          winner: bd.winner,
          roundsPlayed: bd.roundsPlayed,
          log: bd.log ?? [],
          teams: bd.teams ?? null,
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
    <div className="grid grid-cols-5 gap-1.5">
      {cards.map((c) => {
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
            className={`relative rounded-lg border-2 bg-gray-900/80 p-1 text-center transition-all ${
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
            {isAttacker && (
              <span className="absolute -top-2 -right-1 rounded-full bg-amber-400 px-1 text-[11px] leading-5" title="กำลังโจมตี">
                ⚔️
              </span>
            )}
            {isDefender && (
              <span className="absolute -top-2 -left-1 rounded-full bg-sky-400 px-1 text-[11px] leading-5" title="กำลังรับการโจมตี">
                🛡️
              </span>
            )}
            {isDefender && (
              <span className="pointer-events-none absolute inset-0 rounded-md bg-red-500/25" data-battle-hit="true" />
            )}
            {!c.alive && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-black/60 text-xl">
                💀
              </span>
            )}
            <div className="truncate text-[10px] font-bold text-gray-100">{c.nameTh || c.name}</div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-700" title={`HP ${c.hp}/${c.maxHp}`}>
              <div className={`h-full ${barColor(pct)}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
            </div>
            <div className="mt-0.5 flex justify-between text-[9px] leading-tight">
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
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-center mb-1">สนามรบ</h1>
        <p className="text-center text-gray-400 text-sm mb-4">
          ทีม A (คุณ) vs ทีม B • {battle.roundsPlayed} รอบ
        </p>

        {finished && (
          <div className="text-center text-3xl font-bold mb-3">{resultText}</div>
        )}

        {frame && (
          <div className="mb-3 space-y-1.5 rounded-xl bg-gray-800/70 p-2.5">
            <div>
              <div className="mb-0.5 flex justify-between text-[11px]">
                <span className="font-bold text-blue-300">🛡️ ทีมเรา (ล่าง) HP รวม</span>
                <span className="text-gray-200" data-team-hp="A">{frame.hpA.toLocaleString('th-TH')}/{frame.maxHpA.toLocaleString('th-TH')}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                <div className={`h-full ${barColor(hpPctA)} transition-all duration-300`} style={{ width: `${hpPctA}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-0.5 flex justify-between text-[11px]">
                <span className="font-bold text-red-300">⚔️ คู่ต่อสู้ (บน) HP รวม</span>
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
              <p className="mb-1 text-[11px] font-bold text-red-300">คู่ต่อสู้ (บน)</p>
              {renderSide(frame.teamB)}
            </div>
            <div className="text-center text-[11px] text-gray-500">⚔️ VS ⚔️</div>
            <div className="rounded-xl border border-blue-900/50 bg-blue-950/20 p-2">
              <p className="mb-1 text-[11px] font-bold text-blue-300">ทีมเรา (ล่าง)</p>
              {renderSide(frame.teamA)}
            </div>
          </div>
        ) : (
          <p className="mb-3 rounded-xl bg-gray-800 p-3 text-center text-xs text-gray-400">
            การต่อสู้นี้เก่า (ไม่มีภาพทีม) — ดูได้เฉพาะข้อความ log
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
          <button onClick={skipAll} className="btn-secondary text-sm">⏩ ข้าม (รู้ผลเลย)</button>
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
          <Link href="/discover" className="btn-primary text-sm flex-1 text-center">ค้นหารูนต่อ</Link>
        </div>
      </div>
    </main>
  );
}
