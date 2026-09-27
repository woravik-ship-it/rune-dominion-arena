'use client';

// กระเป๋า (Bag) — Phase 11.3 ของสะสม → Phase 26: รวม "เงิน + ไอเทมช่าง + ของสะสม"
//
// ผู้ใช้สั่ง 2026-09-27: "แล้วกระเป๋า Bag มีไว้ทำไม ถ้าไม่เอา Item ไปแสดง เอาเงินไปแสดง"
//  - ยอดเงิน: 🪙 Coin · 💠 Veil Shards · ✨ ฝุ่นเวท
//  - ไอเทมช่าง (ช่องโจมตี/ป้องกัน/สนับสนุน) + บอกว่าใส่อยู่กี่ชิ้น + ลิงก์ไปใส่ที่หน้าการ์ด
//  - ของสะสมจากกิจกรรม (การ์ดพิเศษ/เครื่องประดับ/ฉายา/วัตถุดิบ/บทเนื้อเรื่อง) ตามเดิม
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useI18n } from '@/components/providers/LocaleProvider';
import { formatNumber } from '@/lib/i18n';
import { sourceLabelTh } from '@/lib/inventory-display';

interface InventoryItem {
  id: string;
  itemType: 'CARD' | 'COSMETIC' | 'TITLE' | 'CRAFTING_DUST' | 'STORY_CHAPTER';
  code: string;
  nameTh: string;
  quantity: number;
  source: string | null;
  acquiredAt: string;
}

interface WorkshopItem {
  code: string;
  nameTh: string;
  name: string;
  slot: 'ATTACK' | 'DEFENSE' | 'SUPPORT';
  rarity: string;
  icon: string;
  stats: { atk: number; def: number; hp: number; spd: number };
  owned: number;
  equippedCount: number;
  craftCost: number;
  dustCost: number;
  buyCost: number | null;
}

const TYPE_LABEL: Record<InventoryItem['itemType'], { label: string; icon: string }> = {
  CARD: { label: 'การ์ดพิเศษ', icon: '🎴' },
  COSMETIC: { label: 'เครื่องประดับ', icon: '🎀' },
  TITLE: { label: 'ฉายา', icon: '🏅' },
  // ฝุ่นเวทต้องใช้สัญลักษณ์/ชื่อเดียวกับยอดเงินในกระเป๋า (✨ ฝุ่นเวท)
  // — เดิมใช้ 🌫️ 'วัตถุดิบ' ทำให้ผู้เล่นคิดว่าเป็นคนละไอเทม (ผู้ใช้แจ้ง 2026-09-27)
  CRAFTING_DUST: { label: 'ฝุ่นเวท', icon: '✨' },
  STORY_CHAPTER: { label: 'บทเนื้อเรื่อง', icon: '📖' },
};

const SLOT_ORDER: Array<WorkshopItem['slot']> = ['ATTACK', 'DEFENSE', 'SUPPORT'];

function statLabel(stats: WorkshopItem['stats']): string {
  const parts: string[] = [];
  if (stats.atk) parts.push(`+${stats.atk} ATK`);
  if (stats.def) parts.push(`+${stats.def} DEF`);
  if (stats.hp) parts.push(`+${stats.hp} HP`);
  if (stats.spd) parts.push(`+${stats.spd} SPD`);
  return parts.join(' · ') || '—';
}

export default function InventoryPage() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [workshopItems, setWorkshopItems] = useState<WorkshopItem[]>([]);
  const [balances, setBalances] = useState<{ coin: number; veilShards: number; dust: number }>({
    coin: 0,
    veilShards: 0,
    dust: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/inventory');
      const data = await res.json();
      if (data.success) {
        setItems(data.data as InventoryItem[]);
        setSummary(data.summary ?? {});
        setWorkshopItems((data.workshopItems ?? []) as WorkshopItem[]);
        setBalances(data.balances ?? { coin: 0, veilShards: 0, dust: 0 });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = items.reduce<Record<string, InventoryItem[]>>((acc, item) => {
    (acc[item.itemType] ??= []).push(item);
    return acc;
  }, {});

  return (
    <main className="min-h-screen p-4 pb-24">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-3xl font-bold text-center">🎒 {t('bag.title')}</h1>
        <p className="mb-6 text-center text-gray-400">{t('bag.subtitle')}</p>

        {loading && <p className="text-center text-gray-500 py-10">{t('common.loading')}</p>}

        {!loading && (
          <>
            {/* ยอดเงินในกระเป๋า */}
            <section data-bag-balances className="mb-4 rounded-xl border border-white/10 bg-gray-800/60 p-4">
              <h2 className="mb-2 text-sm font-bold text-gray-200">💰 {t('bag.money')}</h2>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Link href="/wallet" className="rounded-lg bg-gray-900/70 p-3 hover:bg-gray-900">
                  <p className="text-xs text-gray-400">🪙 {t('profile.coin')}</p>
                  <p className="text-lg font-bold text-amber-400" data-bag-coin>
                    {formatNumber(locale, balances.coin)}
                  </p>
                </Link>
                <Link href="/items" className="rounded-lg bg-gray-900/70 p-3 hover:bg-gray-900">
                  <p className="text-xs text-gray-400">💠 {t('profile.shards')}</p>
                  <p className="text-lg font-bold text-sky-300" data-bag-shards>
                    {formatNumber(locale, balances.veilShards)}
                  </p>
                </Link>
                <div className="rounded-lg bg-gray-900/70 p-3">
                  <p className="text-xs text-gray-400">✨ {t('profile.dust')}</p>
                  <p className="text-lg font-bold text-purple-300" data-bag-dust>
                    {formatNumber(locale, balances.dust)}
                  </p>
                </div>
              </div>
            </section>

            {/* ไอเทมช่าง */}
            <section data-bag-items className="mb-4 rounded-xl border border-white/10 bg-gray-800/60 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-gray-200">🛠️ {t('bag.workshopItems')}</h2>
                <Link href="/items" className="text-xs text-sky-300 underline">
                  {t('bag.toWorkshop')} →
                </Link>
              </div>

              {workshopItems.length === 0 ? (
                <p className="text-xs text-gray-500">{t('bag.noItems')}</p>
              ) : (
                SLOT_ORDER.map((slot) => {
                  const list = workshopItems.filter((row) => row.slot === slot);
                  if (list.length === 0) return null;
                  return (
                    <div key={slot} className="mb-3 last:mb-0">
                      <p className="mb-1 text-[11px] font-bold text-amber-300">{t(`item.slot.${slot}`)}</p>
                      <div className="space-y-2">
                        {list.map((row) => (
                          <div
                            key={row.code}
                            data-bag-item={row.code}
                            className="flex items-center justify-between gap-2 border-b border-gray-700 pb-2 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-white">
                                {row.icon} {row.nameTh}
                              </p>
                              <p className="text-[11px] text-emerald-300">{statLabel(row.stats)}</p>
                            </div>
                            <div className="shrink-0 text-right text-xs">
                              <p className="font-bold text-amber-400">×{row.owned}</p>
                              {row.equippedCount > 0 && (
                                <p className="text-emerald-300">
                                  {t('bag.equippedCount', { n: row.equippedCount })}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}

              {workshopItems.length > 0 && (
                <Link href="/cards" className="mt-2 inline-block text-xs text-gray-300 underline">
                  {t('bag.toCards')} →
                </Link>
              )}
            </section>

            {/* ของสะสมจากกิจกรรม */}
            <section data-bag-collectibles className="mb-4">
              <h2 className="mb-2 text-sm font-bold text-gray-200">🎁 {t('bag.collectibles')}</h2>
              {items.length === 0 ? (
                <div className="rounded-xl bg-gray-800 p-6 text-center">
                  <p className="text-gray-400">📭</p>
                  <p className="mt-2 text-xs text-gray-500">{t('bag.noItems')}</p>
                </div>
              ) : (
                <>
                  <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                    {Object.entries(summary).map(([type, count]) => {
                      const meta = TYPE_LABEL[type as InventoryItem['itemType']];
                      return (
                        <div key={type} className="rounded-lg bg-gray-800 p-3">
                          <p className="text-lg">{meta?.icon ?? '📦'}</p>
                          <p className="text-xs text-gray-400">{meta?.label ?? type}</p>
                          <p className="text-sm font-bold text-white">{count}</p>
                        </div>
                      );
                    })}
                  </div>

                  {Object.entries(grouped).map(([type, list]) => {
                    const meta = TYPE_LABEL[type as InventoryItem['itemType']];
                    return (
                      <div key={type} className="mb-4 rounded-xl bg-gray-800 p-5">
                        <h3 className="mb-3 text-base font-bold text-white">
                          {meta?.icon} {meta?.label ?? type}
                        </h3>
                        <div className="space-y-2">
                          {list.map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between border-b border-gray-700 pb-2 text-sm"
                            >
                              <div>
                                <p className="text-white">{item.nameTh}</p>
                                {/* ที่มา: แปลงรหัสหลังบ้านเป็นข้อความผู้เล่น · ไม่รู้จัก = ไม่แสดง (ผู้ใช้สั่ง) */}
                                {sourceLabelTh(item.source) && (
                                  <p className="text-xs text-gray-500">{sourceLabelTh(item.source)}</p>
                                )}
                              </div>
                              <span className="font-bold text-amber-400">×{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
