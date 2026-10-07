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
import { avatarFrameTheme } from '@/lib/avatar';
import { specialArtUrl } from '@/lib/special-art';

interface ProfileData {
  /** Phase 33: เลเวล/EXP (คำนวณจาก exp ฝั่งเซิร์ฟเวอร์) */
  level: {
    level: number;
    exp: number;
    intoLevel: number;
    levelSpan: number;
    toNext: number;
    ratio: number;
    isMax: boolean;
    dropBonusPercent: number;
    maxLevel: number;
  };
  user: {
    id: string;
    username: string;
    displayName: string | null;
    role: string;
    locale: string;
    joinedAt: string;
    avatarEmoji: string | null;
    avatarGrid: string | null;
    avatarFrameCode: string | null;
    titleCode: string | null;
    titleTh: string | null;
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

/** ของสะสมจาก Event ที่ใช้กับหน้าโปรไฟล์ (เครื่องประดับ/ฉายา/การ์ดวิเศษ) */
interface CollectibleItem {
  id: string;
  itemType: string;
  code: string;
  nameTh: string;
  quantity: number;
  source: string | null;
}

export default function ProfilePage() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collectibles, setCollectibles] = useState<CollectibleItem[]>([]);
  const [equipping, setEquipping] = useState(false);
  const [equipMsg, setEquipMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const [profileRes, invRes] = await Promise.all([
        apiFetch('/api/profile'),
        apiFetch('/api/inventory'),
      ]);
      const json = await profileRes.json().catch(() => null);
      const inv = await invRes.json().catch(() => null);
      if (!profileRes.ok || !json?.success) {
        setError(json?.error ?? t('common.error'));
        return;
      }
      setError('');
      setData(json.data as ProfileData);
      if (inv?.success) setCollectibles((inv.data ?? []) as CollectibleItem[]);
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  /** ใส่/ถอดเครื่องประดับ (COSMETIC) หรือฉายา (TITLE) — code = '' = ถอด */
  const equip = async (kind: 'COSMETIC' | 'TITLE', code: string) => {
    setEquipping(true);
    setEquipMsg('');
    setError('');
    try {
      const res = await apiFetch('/api/profile/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, code }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? 'ใส่เครื่องประดับไม่สำเร็จ');
        return;
      }
      setEquipMsg(!code ? 'ถอดแล้ว ✅' : kind === 'TITLE' ? 'ตั้งฉายาแล้ว ✅' : 'ใส่เครื่องประดับแล้ว ✅');
      await load();
    } finally {
      setEquipping(false);
    }
  };

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
  const frameTheme = avatarFrameTheme(user.avatarFrameCode);

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
            <div
              data-avatar-frame={user.avatarFrameCode ?? ''}
              className={`shrink-0 rounded-2xl ${frameTheme ? `${frameTheme.ringClass} ${frameTheme.glowClass}` : ''}`}
            >
              <AvatarView
                emoji={user.avatarEmoji}
                grid={user.avatarGrid}
                size={72}
                className="rounded-xl bg-black/30 p-1"
                title={user.displayName || user.username}
              />
            </div>
            <div className="min-w-0">
              <h1 data-profile-name className="text-xl font-bold text-white">
                <span className="truncate">{user.displayName || user.username}</span>
                {user.titleTh && (
                  <span
                    data-profile-title
                    className="ml-2 inline-block max-w-[12rem] truncate rounded bg-purple-500/20 px-2 py-0.5 align-middle text-xs font-bold text-purple-200"
                    title={user.titleTh}
                  >
                    🏅 {user.titleTh}
                  </span>
                )}
              </h1>
              <p className="text-sm text-gray-300">@{user.username}</p>
              <p className="text-xs text-gray-400">
                {ROLE_LABEL[user.role] ?? user.role} · {t('profile.joined', { date: joined })}
              </p>
            </div>
          </div>
        </section>

        {/* เลเวล/EXP (Phase 33) */}
        {data.level && (
          <section data-profile-level className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-amber-200">
                ⭐ {t('profile.level')} <span className="text-lg text-white" data-level-value>{data.level.level}</span>
                <span className="ml-1 text-xs text-gray-400">/ {data.level.maxLevel}</span>
              </h2>
              <span className="text-xs text-emerald-300" data-level-drop-bonus>
                🎁 {t('profile.dropBonus')}: +{data.level.dropBonusPercent}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
                style={{ width: `${Math.round(data.level.ratio * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              {t('profile.exp')} {formatNumber(locale, data.level.exp)}
              {' · '}
              {data.level.isMax
                ? t('profile.maxLevel')
                : t('profile.expToNext', { n: formatNumber(locale, data.level.toNext) })}
            </p>
          </section>
        )}

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

        {/* เครื่องประดับ (กรอบอวตาร) / ฉายา / การ์ดวิเศษ — Phase 43 */}

        {equipMsg && (
          <p data-equip-msg className="mb-3 text-center text-xs text-emerald-400">{equipMsg}</p>
        )}

        <section data-profile-cosmetics className="mb-4 rounded-xl border border-white/10 bg-gray-800/60 p-4">
          <h2 className="mb-2 text-sm font-bold text-gray-200">🎀 เครื่องประดับ (กรอบอวตาร)</h2>
          {(() => {
            const cosmetics = collectibles.filter((i) => i.itemType === 'COSMETIC');
            if (cosmetics.length === 0) {
              return (
                <p className="text-xs text-gray-500">
                  ยังไม่มีเครื่องประดับ — ได้จาก Event (Milestone / Raid สูง / ร้านค้ากิจกรรม)
                </p>
              );
            }
            return (
              <div className="space-y-2">
                {cosmetics.map((item) => {
                  const equipped = user.avatarFrameCode === item.code;
                  const theme = avatarFrameTheme(item.code);
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`block h-7 w-7 shrink-0 rounded-full bg-gray-900 text-center text-sm leading-7 ${
                            equipped ? `${theme?.ringClass ?? 'ring-2 ring-emerald-400'}` : ''
                          }`}
                        >
                          🎀
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-white">{item.nameTh}</p>
                          <p className="text-[10px] text-gray-500">
                            {equipped ? 'กำลังใส่' : 'กดใส่เพื่อแสดงกรอบที่อวตาร'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        data-cosmetic-equip={item.code}
                        disabled={equipping}
                        onClick={() => void equip('COSMETIC', equipped ? '' : item.code)}
                        className={`rounded px-3 py-1 text-xs disabled:opacity-50 ${
                          equipped
                            ? 'bg-white/10 text-gray-300 hover:bg-white/20'
                            : 'bg-indigo-600 text-white hover:bg-indigo-500'
                        }`}
                      >
                        {equipped ? 'ถอด' : 'ใส่'}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>

        <section data-profile-titles className="mb-4 rounded-xl border border-white/10 bg-gray-800/60 p-4">
          <h2 className="mb-2 text-sm font-bold text-gray-200">🏅 ฉายา (แสดงข้างชื่อ)</h2>
          {(() => {
            const titles = collectibles.filter((i) => i.itemType === 'TITLE');
            if (titles.length === 0) {
              return (
                <p className="text-xs text-gray-500">
                  ยังไม่มีฉายา — ได้จาก Milestone/Raid ระดับสูงหรือร้านค้ากิจกรรม
                </p>
              );
            }
            return (
              <div className="space-y-2">
                {titles.map((item) => {
                  const equipped = user.titleCode === item.code;
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-2">
                      <p className={`truncate text-sm ${equipped ? 'text-white' : 'text-gray-300'}`}>
                        🏅 {item.nameTh}
                      </p>
                      <button
                        type="button"
                        data-title-equip={item.code}
                        disabled={equipping}
                        onClick={() => void equip('TITLE', equipped ? '' : item.code)}
                        className={`rounded px-3 py-1 text-xs disabled:opacity-50 ${
                          equipped
                            ? 'bg-white/10 text-gray-300 hover:bg-white/20'
                            : 'bg-amber-600 text-white hover:bg-amber-500'
                        }`}
                      >
                        {equipped ? 'ถอด' : 'ตั้ง'}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>

        <section data-profile-special-cards className="mb-4 rounded-xl border border-white/10 bg-gray-800/60 p-4">
          <h2 className="mb-2 text-sm font-bold text-gray-200">🎴 การ์ดวิเศษจาก Event</h2>
          {(() => {
            const cards = collectibles.filter((i) => i.itemType === 'CARD');
            if (cards.length === 0) {
              return (
                <p className="text-xs text-gray-500">
                  ยังไม่มีการ์ดวิเศษ — เก็บจาก Milestone กิจกรรม
                </p>
              );
            }
            return (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {cards.map((item) => (
                  <div key={item.id} className="rounded-lg bg-gray-900/80 p-2 text-center">
                    <img
                      src={specialArtUrl(item.code)}
                      alt=""
                      loading="lazy"
                      className="mx-auto block h-16 w-16 rounded-lg border border-gray-700 object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <p className="mt-1 truncate text-[11px] text-white">{item.nameTh}</p>
                  </div>
                ))}
              </div>
            );
          })()}
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
