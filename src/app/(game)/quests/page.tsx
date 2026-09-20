'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';

interface QuestView {
  questId: string;
  code: string;
  nameTh: string;
  descriptionTh: string | null;
  type: string;
  targetValue: number;
  currentValue: number;
  isCompleted: boolean;
  rewardClaimed: boolean;
  rewardAmount: number;
}

interface QuestBoard {
  daily: QuestView[];
  weekly: QuestView[];
  achievement: QuestView[];
  event: QuestView[];
  resets: { dailyAt: string; weeklyAt: string };
}

const TABS = [
  { key: 'daily', label: '📜 รายวัน' },
  { key: 'weekly', label: '🗓️ รายสัปดาห์' },
  { key: 'achievement', label: '🏆 ถาวร' },
] as const;

function QuestCard({
  quest,
  onClaim,
  claiming,
}: {
  quest: QuestView;
  onClaim: (questId: string) => void;
  claiming: boolean;
}) {
  const pct = Math.min(100, Math.round((quest.currentValue / quest.targetValue) * 100));
  return (
    <div
      className={`rounded-2xl p-4 border ${
        quest.rewardClaimed
          ? 'bg-gray-900 border-gray-700 opacity-60'
          : quest.isCompleted
            ? 'bg-emerald-900/30 border-emerald-500/50'
            : 'bg-gray-800 border-white/10'
      }`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="font-bold truncate">{quest.nameTh}</p>
          <p className="text-xs text-gray-400">{quest.descriptionTh}</p>
        </div>
        <span className="text-amber-400 font-bold whitespace-nowrap text-sm">🪙 {quest.rewardAmount}</span>
      </div>

      <div className="mt-3">
        <div className="h-2 bg-black/40 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${quest.isCompleted ? 'bg-emerald-400' : 'bg-amber-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-400">
          <span>
            {quest.currentValue}/{quest.targetValue}
          </span>
          <span>{pct}%</span>
        </div>
      </div>

      <div className="mt-3">
        {quest.rewardClaimed ? (
          <p className="text-center text-sm text-emerald-400 font-medium">✅ รับรางวัลแล้ว</p>
        ) : quest.isCompleted ? (
          <button
            onClick={() => onClaim(quest.questId)}
            disabled={claiming}
            className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold text-sm"
          >
            {claiming ? 'กำลังรับรางวัล...' : '🎁 รับรางวัล'}
          </button>
        ) : (
          <p className="text-center text-sm text-gray-500">ทำให้ครบเพื่อรับรางวัล</p>
        )}
      </div>
    </div>
  );
}

export default function QuestsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('daily');
  const [board, setBoard] = useState<QuestBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/quests?userId=temp-user');
      const json = await res.json();
      if (json.success) setBoard(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const claim = async (questId: string) => {
    setClaimingId(questId);
    try {
      const res = await apiFetch(`/api/quests/${questId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'temp-user' }),
      });
      const json = await res.json();
      if (json.success) {
        setToast(`รับรางวัล +${json.data.rewardAmount} 🪙 สำเร็จ!`);
        await load();
      } else {
        setToast(json.message || json.error || 'รับรางวัลไม่สำเร็จ');
      }
    } catch (e) {
      console.error(e);
      setToast('เกิดข้อผิดพลาด');
    } finally {
      setClaimingId(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const list: QuestView[] = board ? board[tab] : [];

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-1">สมุดภารกิจ</h1>
        {board && (
          <p className="text-xs text-center text-gray-400 mb-4">
            รีเซ็ตรายวัน {new Date(board.resets.dailyAt).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit' })} •
            รีเซ็ตสัปดาห์ {new Date(board.resets.weeklyAt).toLocaleDateString('th-TH')}
          </p>
        )}

        <div className="flex gap-2 mb-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium ${
                tab === t.key ? 'bg-amber-500 text-white' : 'bg-white/10 text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-center text-gray-400 py-10">กำลังอ่านสมุดภารกิจ...</p>
        ) : list.length === 0 ? (
          <p className="text-center text-gray-400 py-10">ยังไม่มีภารกิจในหมวดนี้</p>
        ) : (
          <div className="space-y-3">
            {list.map((q) => (
              <QuestCard key={q.questId} quest={q} onClaim={claim} claiming={claimingId === q.questId} />
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-black/90 border border-amber-500/50 text-white text-sm px-4 py-2 rounded-xl z-50">
          {toast}
        </div>
      )}
    </main>
  );
}
