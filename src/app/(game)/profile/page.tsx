'use client';

// /profile — โปรไฟล์ผู้เล่น (Phase 26)
//
// ผู้ใช้สั่ง 2026-09-27: "Profile ก็ยังไม่มีข้อมูล ทำให้ด้วย เพิ่ม เลือก Emoji แทนตัว
//   หรือ สามารถวาด เองได้จาก ช่องวาด 6x6 ช่อง"
//  - ตัวตนผู้เล่น + อวตาร (อิโมจิ/วาดเอง 6×6) + ยอดเงิน + สถิติการเล่นจริง (จาก DB)
//  - เดิมเมนู 👤 พาไปหน้าที่ไม่มีอยู่ (404) — ตอนนี้มีหน้าจริงแล้ว
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useI18n } from '@/components/providers/LocaleProvider';
import { formatNumber } from '@/lib/i18n';
import AvatarEditor from '@/components/profile/AvatarEditor';
import AvatarView from '@/components/profile/AvatarView';

interface ProfileData {
  user: {
    id: string;
    username: string;
    displayName: string | null;
    role: string;
    locale: string;
    joinedAt: string;
    avatarEmoji: string | null;
    avatarGrid: string | null;
    avatarKind: 'emoji' | 'grid' | 'default';
    paintedCells: number;
  };
  balances: {
    coin: number;
    coinEarned: number;
    coinSpent: number;
    veilShards: number;
    dust: number;
    energyRemaining: number | null;
    energyMax: number | null;
  };
  stats: {
    cardTypes: number;
    ownedCards: number;
    favoriteCards: number;
    decks: number;
    battles: number;
    wins: number;
    losses: number;
    winRate: number;
    questsCompleted: number;
    items: number;
    equippedItems: number;
  };
  event: { eventPoints: number; damageDealt: number; shardsEarned: number; shardsSpent: number } | null;
}

const ROLE_LABEL: Record<string, string> = {
  PLAYER: 'ผู้เล่น',
  ADMIN: 'แอดมิน',
  MODERATOR: 'ผู้ดูแล',
};

export default function ProfilePage() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/profile');
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? t('common.error'));
        return;
      }
      setError('');
      setData(json.data as ProfileData);
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main className="min-h-screen p-6 text-center text-gray-400">
        {t('common.loading')}
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen p-6 text-center">
        <p className="text-4xl">🔒</p>
        <p className="mt-2 text-sm text-red-400">{error || t('common.error')}</p>
        <Link href="/login" className="mt-3 inline-block text-sm text-amber-400 underline">
          {t('header.login')}
        </Link>
      </main>
    );
  }

  const { user, balances, stats, event } = data;
  const joined = new Date(user.joinedAt).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US');

  const statRows: Array<{ label: string; value: string }> = [
    { label: t('profile.battles'), value: formatNumber(locale, stats.battles) },
    { label: t('profile.wins'), value: formatNumber(locale, stats.wins) },
    { label: t('profile.losses'), value: formatNumber(locale, stats.losses) },
    { label: t('profile.winRate'), value: `${stats.winRate}%` },
    { label: t('profile.cardTypes'), value: formatNumber(locale, stats.cardTypes) },
    { label: t('profile.ownedCards'), value: formatNumber(locale, stats.ownedCards) },
    { label: t('profile.favorites'), value: formatNumber(locale, stats.favoriteCards) },
    { label: t('profile.decks'), value: formatNumber(locale, stats.decks) },
    { label: t('profile.quests'), value: formatNumber(locale, stats.questsCompleted) },
    { label: t('profile.items'), value: formatNumber(locale, stats.items) },
    { label: t('profile.equippedItems'), value: formatNumber(locale, stats.equippedItems) },
  ];

  return (
    <main className="min-h-screen p-4 pb-24">
      <div className="mx-auto max-w-3xl">
        {/* ตัวตน + อวตาร */}
        <section data-profile-header className="mb-4 rounded-xl border border-white/10 bg-gradient-to-br from-indigo-900/60 via-purple-900/40 to-slate-900 p-4">
          <div className="flex items-center gap-3">
            <AvatarView
              emoji={user.avatarEmoji}
              grid={user.avatarGrid}
              size={72}
              className="rounded-xl bg-black/30 p-1"
              title={user.displayName || user.username}
            />
            <div className="min-w-0">
              <h1 data-profile-name className="truncate text-xl font-bold text-white">
                {user.displayName || user.username}
              </h1>
              <p className="text-sm text-gray-300">@{user.username}</p>
              <p className="text-xs text-gray-400">
                {ROLE_LABEL[user.role] ?? user.role} · {t('profile.joined', { date: joined })}
              </p>
            </div>
          </div>
        </section>

        {/* ยอดเงินและพลัง */}
        <section data-profile-balances className="mb-4 rounded-xl border border-white/10 bg-gray-800/60 p-4">
          <h2 className="mb-2 text-sm font-bold text-gray-200">💰 {t('profile.balances')}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-gray-900/70 p-2 text-center">
              <p className="text-xs text-gray-400">🪙 {t('profile.coin')}</p>
              <p className="text-lg font-bold text-amber-400" data-profile-coin>
                {formatNumber(locale, balances.coin)}
              </p>
            </div>
            <div className="rounded-lg bg-gray-900/70 p-2 text-center">
              <p className="text-xs text-gray-400">💠 {t('profile.shards')}</p>
              <p className="text-lg font-bold text-sky-300" data-profile-shards>
                {formatNumber(locale, balances.veilShards)}
              </p>
            </div>
            <div className="rounded-lg bg-gray-900/70 p-2 text-center">
              <p className="text-xs text-gray-400">✨ {t('profile.dust')}</p>
              <p className="text-lg font-bold text-purple-300">{formatNumber(locale, balances.dust)}</p>
            </div>
            <div className="rounded-lg bg-gray-900/70 p-2 text-center">
              <p className="text-xs text-gray-400">⚡ {t('profile.energy')}</p>
              <p className="text-lg font-bold text-emerald-300">
                {balances.energyRemaining ?? '-'}
                {balances.energyMax ? `/${balances.energyMax}` : ''}
              </p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <Link href="/wallet" className="text-amber-300 underline">{t('profile.wallet')}</Link>
            <Link href="/items" className="text-sky-300 underline">{t('bag.toWorkshop')}</Link>
            <Link href="/settings" className="text-gray-300 underline">{t('profile.settings')}</Link>
          </div>
        </section>

        {/* สถิติการเล่น */}
        <section data-profile-stats className="mb-4 rounded-xl border border-white/10 bg-gray-800/60 p-4">
          <h2 className="mb-2 text-sm font-bold text-gray-200">📊 {t('profile.stats')}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {statRows.map((row) => (
              <div key={row.label} className="rounded-lg bg-gray-900/70 p-2">
                <p className="text-[11px] text-gray-400">{row.label}</p>
                <p className="text-sm font-bold text-white">{row.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* กิจกรรม */}
        <section data-profile-event className="mb-4 rounded-xl border border-white/10 bg-gray-800/60 p-4">
          <h2 className="mb-2 text-sm font-bold text-gray-200">🌙 {t('profile.eventSection')}</h2>
          {event ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg bg-gray-900/70 p-2">
                <p className="text-[11px] text-gray-400">{t('profile.eventPoints')}</p>
                <p className="text-sm font-bold text-white">{formatNumber(locale, event.eventPoints)}</p>
              </div>
              <div className="rounded-lg bg-gray-900/70 p-2">
                <p className="text-[11px] text-gray-400">{t('profile.eventDamage')}</p>
                <p className="text-sm font-bold text-white">{formatNumber(locale, event.damageDealt)}</p>
              </div>
              <div className="rounded-lg bg-gray-900/70 p-2">
                <p className="text-[11px] text-gray-400">💠 +</p>
                <p className="text-sm font-bold text-sky-300">{formatNumber(locale, event.shardsEarned)}</p>
              </div>
              <div className="rounded-lg bg-gray-900/70 p-2">
                <p className="text-[11px] text-gray-400">💠 −</p>
                <p className="text-sm font-bold text-red-300">{formatNumber(locale, event.shardsSpent)}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">{t('profile.noEvent')}</p>
          )}
        </section>

        {/* อวตาร */}
        <AvatarEditor
          initialEmoji={user.avatarEmoji}
          initialGrid={user.avatarGrid}
          onSaved={() => void load()}
        />
      </div>
    </main>
  );
}
