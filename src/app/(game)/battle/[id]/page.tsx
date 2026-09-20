'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface LogEntry {
  round: number;
  order: number;
  actorId: string;
  actorSide: 'A' | 'B';
  action: string;
  targetId?: string;
  damage?: number;
  healing?: number;
  statusApplied?: string;
  messageTh: string;
}

interface BattleData {
  battleId: string;
  winner: 'A' | 'B' | 'DRAW';
  roundsPlayed: number;
  log: LogEntry[];
}

export default function BattleViewerPage() {
  const params = useParams();
  const battleId = params.id as string;
  const [battle, setBattle] = useState<BattleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { loadBattle(); }, [battleId]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

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
          log: bd.log,
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
    }, Math.floor(600 / speed));
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

  const visible = battle.log.slice(0, visibleCount);
  const finished = visibleCount >= battle.log.length;
  const resultText =
    battle.winner === 'A' ? '🎉 ชนะ!' : battle.winner === 'B' ? '💀 แพ้' : '🤝 เสมอ';

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-center mb-1">สนามรบ</h1>
        <p className="text-center text-gray-400 text-sm mb-4">
          ทีม A (คุณ) vs ทีม B • {battle.roundsPlayed} รอบ
        </p>

        {finished && (
          <div className="text-center text-3xl font-bold mb-4">{resultText}</div>
        )}

        <div className="flex gap-2 justify-center mb-4 flex-wrap">
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
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-3 py-2 rounded-xl text-sm ${speed === s ? 'bg-amber-500 font-bold' : 'bg-white/10'}`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-3 mb-4">
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
              style={{ width: `${battle.log.length ? (visibleCount / battle.log.length) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 text-center">{visibleCount}/{battle.log.length} เหตุการณ์</p>
        </div>

        <div className="space-y-1 mb-6">
          {visible.length === 0 && (
            <p className="text-center text-gray-500 text-sm">กดเริ่มเล่นเพื่อดูการต่อสู้</p>
          )}
          {visible.map((entry, i) => (
            <div
              key={i}
              className={`text-sm px-3 py-1.5 rounded-lg ${
                entry.actorSide === 'A' ? 'bg-blue-900/40 text-blue-100' : 'bg-red-900/40 text-red-100'
              } ${entry.action === 'faint' ? 'opacity-70 italic' : ''}`}
            >
              <span className="text-gray-400 text-xs">R{entry.round} • </span>
              {entry.messageTh}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Link href="/decks" className="btn-secondary text-sm flex-1 text-center">กลับไปจัดทีม</Link>
          <Link href="/discover" className="btn-primary text-sm flex-1 text-center">ค้นหารูนต่อ</Link>
        </div>
      </div>
    </main>
  );
}
