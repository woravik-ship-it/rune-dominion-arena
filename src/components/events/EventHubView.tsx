'use client';

// ส่วนแสดงผลของ Event Hub (แยกจาก page.tsx เพื่อให้อ่านง่าย + ไฟล์ไม่ใหญ่เกิน)
import Link from 'next/link';

export interface EventBossView {
  id: string; nameTh: string; maxHp: number; currentHp: number;
  percent: number; isDefeated: boolean; phase: number; phaseNameTh: string;
}

export interface EventHubData {
  id: string; nameTh: string; descriptionTh: string | null; status: string;
  currencyName: string; msLeft: number;
  boss: EventBossView | null;
  community: { totalDamage: number; participantCount: number };
  quests: Array<{ id: string; nameTh: string; descriptionTh: string | null; targetValue: number; currencyReward: number; rewardAmount: number }>;
  shopItems: Array<{ id: string; nameTh: string; descriptionTh: string | null; price: number }>;
  me: { veilShards: number; eventPoints: number; damageDealt: number; raidsToday: number; raidDailyCap: number } | null;
}

export interface MilestoneView {
  id: string; scope: 'PERSONAL' | 'COMMUNITY'; tier: number; threshold: number;
  titleTh: string; rewardType: string; rewardAmount: number; rewardLabel: string | null;
  progress: number; reached: boolean; claimed: boolean;
}

export interface StoryView {
  chapterNo: number; titleTh: string; bodyTh: string; unlockAtDamage: number; unlocked: boolean;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return 'สิ้นสุดแล้ว';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d} วัน ${h} ชม.` : `${h} ชม. ${m} นาที`;
}

const STATUS_LABEL: Record<string, string> = {
  UPCOMING: 'กำลังจะมาถึง',
  ACTIVE: 'กำลังเปิด',
  GRACE_PERIOD: 'ช่วงเก็บตก',
  ENDED: 'สิ้นสุดแล้ว',
};

interface Props {
  hub: EventHubData;
  milestones: MilestoneView[];
  story: StoryView[];
  busy: boolean;
  msg: string | null;
  err: string | null;
  deckId: string | null;
  onRaid: () => void;
  onClaim: (milestoneId: string) => void;
  onBuy: (itemId: string) => void;
}

export default function EventHubView({
  hub, milestones, story, busy, msg, err, deckId, onRaid, onClaim, onBuy,
}: Props) {
  const bossPercent = hub.boss?.percent ?? 0;
  const shards = hub.me?.veilShards ?? 0;

  return (
    <main className="min-h-screen p-4 pb-24">
      <div className="max-w-3xl mx-auto">
        <Link href="/events" className="text-gray-400 hover:text-white mb-4 inline-block">
          ← กิจกรรมทั้งหมด
        </Link>

        <div className="bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 rounded-2xl p-6 mb-4 border border-purple-700">
          <p className="text-xs text-purple-300 mb-1">
            SEASONAL EVENT · {STATUS_LABEL[hub.status] ?? hub.status}
          </p>
          <h1 className="text-2xl font-bold text-white mb-1">{hub.nameTh}</h1>
          <p className="text-sm text-purple-200 mb-3">{hub.descriptionTh}</p>
          <div className="flex justify-between text-sm">
            <span className="text-purple-300">⏳ เหลือ {formatDuration(hub.msLeft)}</span>
            <span className="text-purple-300">💠 {shards} {hub.currencyName}</span>
          </div>
        </div>

        {msg && <p className="text-green-400 text-sm mb-3 text-center">{msg}</p>}
        {err && <p className="text-red-400 text-sm mb-3 text-center">{err}</p>}

        {hub.boss && (
          <section className="bg-gray-800 rounded-xl p-5 mb-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-bold text-white">{hub.boss.nameTh}</h2>
              <span className="text-xs bg-purple-700 text-white px-2 py-1 rounded">
                Phase {hub.boss.phase} · {hub.boss.phaseNameTh}
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-4 mb-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-indigo-400 h-full transition-all"
                style={{ width: `${Math.max(2, bossPercent)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mb-3">
              {hub.boss.currentHp.toLocaleString('th-TH')} / {hub.boss.maxHp.toLocaleString('th-TH')} HP
              ({bossPercent}%){hub.boss.isDefeated && ' · ถูกปราบแล้ว 🎉'}
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs text-gray-300 mb-3">
              <span>ค่าเข้า: 💠 10 Veil Shards</span>
              <span>วันนี้: {hub.me?.raidsToday ?? 0}/{hub.me?.raidDailyCap ?? 10} ครั้ง</span>
              <span>คะแนนของคุณ: {(hub.me?.eventPoints ?? 0).toLocaleString('th-TH')}</span>
              <span>ดาเมจของคุณ: {(hub.me?.damageDealt ?? 0).toLocaleString('th-TH')}</span>
            </div>

            <button
              onClick={onRaid}
              disabled={busy || !deckId || hub.boss.isDefeated}
              className="btn-primary w-full disabled:opacity-50"
            >
              {busy ? 'กำลังประมวลผล...' : '⚔️ เข้า Boss Raid (10 Veil Shards)'}
            </button>
            {!deckId && (
              <p className="text-xs text-amber-400 mt-2 text-center">
                ยังไม่มีทีม 5 ใบ — <Link href="/decks" className="underline">จัดทีมก่อน</Link>
              </p>
            )}
          </section>
        )}

        <section className="bg-gray-800 rounded-xl p-5 mb-4">
          <h2 className="text-lg font-bold text-white mb-2">🌐 เป้าหมายชุมชน</h2>
          <p className="text-sm text-gray-300">
            ดาเมจรวม {hub.community.totalDamage.toLocaleString('th-TH')} · ผู้เข้าร่วม {hub.community.participantCount} คน
          </p>
        </section>

        <section className="bg-gray-800 rounded-xl p-5 mb-4">
          <h2 className="text-lg font-bold text-white mb-3">🏆 Milestone</h2>
          <div className="space-y-2">
            {milestones.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm border-b border-gray-700 pb-2">
                <div>
                  <p className={m.reached ? 'text-white' : 'text-gray-400'}>
                    {m.scope === 'PERSONAL' ? 'ส่วนตัว' : 'ชุมชน'} · {m.titleTh}
                  </p>
                  <p className="text-xs text-gray-500">
                    {Math.min(m.progress, m.threshold).toLocaleString('th-TH')} / {m.threshold.toLocaleString('th-TH')}
                    {m.rewardLabel ? ` · ${m.rewardLabel}` : ` · ${m.rewardAmount} ${m.rewardType}`}
                  </p>
                </div>
                {m.claimed ? (
                  <span className="text-xs text-green-400">รับแล้ว</span>
                ) : m.reached ? (
                  <button
                    onClick={() => onClaim(m.id)}
                    disabled={busy}
                    className="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded disabled:opacity-50"
                  >
                    รับรางวัล
                  </button>
                ) : (
                  <span className="text-xs text-gray-500">ยังไม่ถึง</span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-800 rounded-xl p-5 mb-4">
          <h2 className="text-lg font-bold text-white mb-3">📜 ภารกิจกิจกรรม</h2>
          <div className="space-y-2 text-sm">
            {hub.quests.map((q) => (
              <div key={q.id} className="border-b border-gray-700 pb-2">
                <p className="text-white">{q.nameTh}</p>
                <p className="text-xs text-gray-500">
                  {q.descriptionTh} · เป้า {q.targetValue.toLocaleString('th-TH')} · รางวัล 💠{q.currencyReward} + {q.rewardAmount} Coin
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-800 rounded-xl p-5 mb-4">
          <h2 className="text-lg font-bold text-white mb-3">🛒 ร้านค้ากิจกรรม</h2>
          <div className="space-y-2">
            {hub.shopItems.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm border-b border-gray-700 pb-2">
                <div>
                  <p className="text-white">{s.nameTh}</p>
                  <p className="text-xs text-gray-500">{s.descriptionTh}</p>
                </div>
                <button
                  onClick={() => onBuy(s.id)}
                  disabled={busy || shards < s.price}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded disabled:opacity-50"
                >
                  💠 {s.price}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-800 rounded-xl p-5 mb-4">
          <h2 className="text-lg font-bold text-white mb-3">📖 เนื้อเรื่อง</h2>
          <div className="space-y-3">
            {story.map((c) => (
              <div key={c.chapterNo} className={c.unlocked ? '' : 'opacity-50'}>
                <p className="text-white text-sm font-semibold">
                  บทที่ {c.chapterNo}: {c.titleTh} {c.unlocked ? '' : '🔒'}
                </p>
                <p className="text-xs text-gray-400">
                  {c.unlocked
                    ? c.bodyTh
                    : `ปลดล็อกเมื่อดาเมจชุมชนถึง ${c.unlockAtDamage.toLocaleString('th-TH')}`}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
