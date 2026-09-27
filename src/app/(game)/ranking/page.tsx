'use client';

// /ranking — ตาราง Ranking ผู้เล่น (Phase 28)
//
// ผู้ใช้สั่ง 2026-09-27: "ทำตาราง Ranking ผู้เล่น ให้ด้วย"
//  - 5 หมวด: พลังทีม (บวก Item) · คะแนนสะสมการ์ด · ชนะศึก · คะแนนกิจกรรม · Coin
//  - ดูได้ทุกคน (ไม่ต้องล็อกอิน) · ถ้าล็อกอินจะเห็น "อันดับของคุณ" และแถวของตัวเองถูกไฮไลต์
//  - อวตาร/ชื่อผู้เล่นแสดงจากข้อมูลจริง (Phase 26)
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useI18n } from '@/components/providers/LocaleProvider';
import { formatNumber } from '@/lib/i18n';
import AvatarView from '@/components/profile/AvatarView';
import { medalFor, type RankingCategory } from '@/lib/ranking';

interface RankingEntryView {
  rank: number;
  userId: string;
  name: string;
  username: string;
  avatarEmoji: string | null;
  avatarGrid: string | null;
  value: number;
  secondary?: number;
  secondaryLabel?: 'cards' | 'battles' | 'damage' | 'dungeons' | 'level';
  isMe: boolean;
}

interface RankingData {
  category: RankingCategory;
  entries: RankingEntryView[];
  me: { rank: number; value: number; total: number } | null;
  total: number;
  limit: number;
  signedIn: boolean;
  categories: Array<{ key: RankingCategory; labelKey: string; icon: string; unitKey: string }>;
}

const FALLBACK_CATEGORIES: RankingData['categories'] = [
  { key: 'power', labelKey: 'rank.catPower', icon: '⚔️', unitKey: 'rank.unitPower' },
  { key: 'collection', labelKey: 'rank.catCollection', icon: '🃏', unitKey: 'rank.unitScore' },
  { key: 'wins', labelKey: 'rank.catWins', icon: '🏆', unitKey: 'rank.unitWins' },
  { key: 'event', labelKey: 'rank.catEvent', icon: '🌙', unitKey: 'rank.unitPoints' },
  { key: 'coin', labelKey: 'rank.catCoin', icon: '🪙', unitKey: 'rank.unitCoin' },
];

export default function RankingPage() {
  const { t, locale } = useI18n();
  const [category, setCategory] = useState<RankingCategory>('power');
  const [data, setData] = useState<RankingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (next: RankingCategory) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/ranking?category=${next}&limit=50`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? t('common.error'));
        return;
      }
      setData(json.data as RankingData);
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load(category);
  }, [category, load]);

  const categories = data?.categories ?? FALLBACK_CATEGORIES;
  const active = categories.find((item) => item.key === category) ?? categories[0];

  const secondaryText = (entry: RankingEntryView): string => {
    if (entry.secondary === undefined) return '';
    if (entry.secondaryLabel === 'cards') return t('rank.cards', { n: formatNumber(locale, entry.secondary) });
    if (entry.secondaryLabel === 'battles') return t('rank.battles', { n: formatNumber(locale, entry.secondary) });
    if (entry.secondaryLabel === 'damage') return t('rank.damage', { n: formatNumber(locale, entry.secondary) });
    if (entry.secondaryLabel === 'dungeons') return t('rank.dungeons', { n: formatNumber(locale, entry.secondary) });
    if (entry.secondaryLabel === 'level') return t('rank.level', { n: formatNumber(locale, entry.secondary) });
    return '';
  };

  return (
    <main className="min-h-screen p-4 pb-24">
      <div className="mx-auto max-w-3xl">
        <header className="mb-3">
          <h1 className="text-2xl font-bold">🏆 {t('rank.title')}</h1>
          <p className="text-sm text-gray-400">{t('rank.subtitle')}</p>
        </header>

        {/* เลือกหมวด */}
        <div data-ranking-tabs className="mb-3 flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item.key}
              type="button"
              data-ranking-tab={item.key}
              onClick={() => setCategory(item.key)}
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                category === item.key ? 'bg-amber-500 text-black' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {item.icon} {t(item.labelKey)}
            </button>
          ))}
        </div>

        {/* อันดับของฉัน */}
        <div
          data-ranking-board-me
          className="mb-3 rounded-xl border border-white/10 bg-gray-800/70 px-3 py-2 text-sm text-gray-200"
        >
          <span className="mr-1">👤 {t('rank.mine')}:</span>
          {data?.me ? (
            <span data-my-rank={data.me.rank} className="font-bold text-amber-300">
              {t('rank.myRank', {
                rank: `#${data.me.rank}`,
                total: formatNumber(locale, data.me.total),
                value: `${formatNumber(locale, data.me.value)} ${t(active.unitKey)}`,
              })}
            </span>
          ) : (
            <span className="text-gray-500" data-my-rank="">
              {data?.signedIn === false ? t('item.loginRequired') : t('rank.myRankNone')}
            </span>
          )}
          {data && (
            <span className="ml-2 text-xs text-gray-500">
              {t('rank.total', { n: formatNumber(locale, data.total) })}
            </span>
          )}
        </div>

        {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
        {loading && !data && <p className="py-6 text-center text-sm text-gray-500">{t('rank.loading')}</p>}
        {!loading && data && data.entries.length === 0 && (
          <div className="rounded-xl bg-gray-800 p-8 text-center text-sm text-gray-400">{t('rank.empty')}</div>
        )}

        {data && data.entries.length > 0 && (
          <div data-ranking-table className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800/60">
            <div className="grid grid-cols-[3.5rem_1fr_auto] gap-2 border-b border-gray-700 bg-gray-700/60 px-3 py-2 text-xs text-gray-300">
              <span>{t('rank.rank')}</span>
              <span>{t('rank.player')}</span>
              <span className="text-right">
                {active.icon} {t(active.labelKey)}
              </span>
            </div>
            <ul>
              {data.entries.map((entry) => (
                <li
                  key={entry.userId}
                  data-ranking-row={entry.rank}
                  data-ranking-row-me={entry.isMe ? 'true' : 'false'}
                  className={`grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 border-b border-gray-700/60 px-3 py-2 text-sm last:border-b-0 ${
                    entry.isMe ? 'bg-amber-500/10' : ''
                  }`}
                >
                  <span className="font-bold text-gray-300">{medalFor(entry.rank) || `#${entry.rank}`}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <AvatarView emoji={entry.avatarEmoji} grid={entry.avatarGrid} size={26} className="rounded" />
                    <span className="min-w-0">
                      <Link
                        href="/profile"
                        className={`block truncate font-semibold ${entry.isMe ? 'text-amber-300' : 'text-white'}`}
                      >
                        {entry.name}
                      </Link>
                      <span className="block truncate text-[11px] text-gray-500">
                        @{entry.username}
                        {secondaryText(entry) && ` · ${secondaryText(entry)}`}
                      </span>
                    </span>
                  </span>
                  <span className="text-right font-bold text-emerald-300">
                    {formatNumber(locale, entry.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}

