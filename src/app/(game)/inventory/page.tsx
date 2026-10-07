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
import { itemArtUrl } from '@/lib/item-art';
import { specialArtUrl } from '@/lib/special-art';
import { CardMiniPreview } from '@/components/cards/CardMiniPreview';
import { emitVeilShardsChanged } from '@/lib/veil-shard-events';

interface InventoryItem {
  id: string;
  itemType: 'CARD' | 'COSMETIC' | 'TITLE' | 'CRAFTING_DUST' | 'ENHANCE_JEWEL' | 'STORY_CHAPTER';
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
  /** ระดับตีบวก +0..+15 (0 = Item ธรรมดา) */
  enhanceLevel: number;
  owned: number;
  equippedCount: number;
  craftCost: number;
  dustCost: number;
  buyCost: number | null;
  /** Phase 34: ยอดวัตถุดิบที่จะได้คืนเมื่อขาย ×1 (50% ของสูตรคราฟต์) */
  sellRefund?: { shards: number; dust: number; total: number };
  /** การ์ดที่ไอเทมชิ้นนี้ใส่อยู่ — แสดงเป็นการ์ดย่อกดขยายได้ (มีได้หลายใบ) */
  equippedCards?: Array<{
    cardId: string; nameTh: string; slot: string;
    imageUrl?: string | null; imageStatus?: string | null; rarity?: string | null;
  }>;
}

const TYPE_LABEL: Record<InventoryItem['itemType'], { label: string; icon: string }> = {
  CARD: { label: 'การ์ดพิเศษ', icon: '🎴' },
  COSMETIC: { label: 'เครื่องประดับ', icon: '🎀' },
  TITLE: { label: 'ฉายา', icon: '🏅' },
  // ฝุ่นเวทต้องใช้สัญลักษณ์/ชื่อเดียวกับยอดเงินในกระเป๋า (✨ ฝุ่นเวท)
  // — เดิมใช้ 🌫️ 'วัตถุดิบ' ทำให้ผู้เล่นคิดว่าเป็นคนละไอเทม (ผู้ใช้แจ้ง 2026-09-27)
  CRAFTING_DUST: { label: 'ฝุ่นเวท', icon: '✨' },
  // Jewelry — ไอคอนฐานเพชร + ชื่อสั้น ๆ (ผู้ใช้สั่ง 2026-10-03: ตั้งชื่อแค่ jewelry)
  ENHANCE_JEWEL: { label: 'Jewelry', icon: '💎' },
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
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [sellError, setSellError] = useState('');

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

  /**
   * ขายไอเทมช่างคืนร้านจากหน้ากระเป๋า (Phase 34) — คืนวัตถุดิบ 50% เหมือนหน้าร้านช่าง
   * Phase 43: ขายเป็น "กองตามระดับบวก" ⇒ ต้องส่งระดับของกองนั้นไปด้วย (ผู้ใช้สั่ง: แยก Item)
   */
  const sellItem = async (code: string, nameTh: string, enhanceLevel: number) => {
    setBusy(`${code}:${enhanceLevel}`);
    setNotice('');
    setSellError('');
    try {
      const res = await apiFetch('/api/items/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, quantity: 1, enhanceLevel }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setSellError(json?.error ?? t('common.error'));
        return;
      }
      const data = json.data ?? {};
      setNotice(
        t('bag.sellDone', {
          name: enhanceLevel > 0 ? `${nameTh} +${enhanceLevel}` : nameTh,
          n: Number(data.sold ?? 1),
          shards: Number(data.refundShards ?? 0),
          dust: Number(data.refundDust ?? 0),
        })
      );
      emitVeilShardsChanged(Number(data.balance));
      await load();
    } catch {
      setSellError(t('common.error'));
    } finally {
      setBusy('');
    }
  };

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

              {notice && <p className="mb-2 rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-300" data-bag-sell-notice>{notice}</p>}
              {sellError && <p className="mb-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{sellError}</p>}
              {workshopItems.length === 0 ? (
                <p className="text-xs text-gray-500">{t('bag.noItems')}</p>
              ) : (
                SLOT_ORDER.map((slot) => {
                  const list = workshopItems.filter((row) => row.slot === slot);
                  if (list.length === 0) return null;
                  return (
                    <div key={slot} data-bag-slot={slot} className="mb-3 overflow-hidden rounded-xl border border-gray-800 last:mb-0">
                      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-2 py-1.5">
                        <p className="text-[11px] font-bold text-amber-300">{t(`item.slot.${slot}`)}</p>
                        <span className="text-[10px] text-gray-500">{list.length} รายการ</span>
                      </div>
                      {/* หัวตาราง — ซ่อนบนมือถือ (ตัวจริงโชว์ที่ sm ขึ้นไป) */}
                      <div className="hidden grid-cols-[minmax(0,1fr)_56px_134px_auto] items-center gap-2 border-b border-gray-800 bg-gray-900/60 px-2 py-1 text-[10px] text-gray-500 sm:grid">
                        <span>Item · สถานะ</span>
                        <span className="text-center">จำนวน</span>
                        <span className="text-center">การ์ดที่ใช้ Item อยู่</span>
                        <span className="pr-1 text-right">ขาย</span>
                      </div>
                      <div className="divide-y divide-gray-800/60">
                        {[...list]
                          .sort((a, b) => (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0))
                          .map((row) => {
                          // Phase 34: ขายคืนวัตถุดิบ 50% + ลิงก์ไปการ์ดที่ใส่อยู่ (มีหลายใบ = มีตัวเลือก)
                          const equippedCards = row.equippedCards ?? [];
                          const sellable = Math.max(0, row.owned - row.equippedCount);
                          const refund = row.sellRefund ?? { shards: 0, dust: 0, total: 0 };
                          return (
                            <div
                              key={row.code}
                              data-bag-item={row.code}
                              data-bag-item-level={row.enhanceLevel ?? 0}
                              className={`grid grid-cols-1 items-center gap-2 px-2 py-2 sm:grid-cols-[minmax(0,1fr)_56px_134px_auto] ${
                                (row.enhanceLevel ?? 0) > 0 ? 'border-l-2 border-l-purple-500 bg-purple-500/5' : ''
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <img
                                  src={itemArtUrl(row.code)}
                                  alt=""
                                  loading="lazy"
                                  className="h-10 w-10 shrink-0 rounded-lg border border-gray-700 object-cover"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                                <div className="min-w-0">
                                  <p className="flex items-center gap-1 text-sm text-white">
                                    <span className="truncate">{row.nameTh}</span>
                                    {(row.enhanceLevel ?? 0) > 0 && (
                                      <span className="shrink-0 rounded bg-purple-500/25 px-1.5 py-0.5 text-[10px] font-bold text-purple-200">
                                        +{row.enhanceLevel}
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[11px] text-emerald-300">
                                    {statLabel(row.stats)}
                                    {(row.enhanceLevel ?? 0) > 0 && (
                                      <span className="ml-1 text-purple-300">(ตีบวก)</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="text-xs">
                                <p className="font-bold text-amber-400">×{row.owned}</p>
                                {row.equippedCount > 0 && (
                                  <p className="text-emerald-300">{t('bag.equippedCount', { n: row.equippedCount })}</p>
                                )}
                              </div>
                              <div className="min-w-0 text-[11px] text-gray-400">
                                {equippedCards.length > 0 ? (
                                  <div className="flex flex-wrap items-start gap-1.5">
                                    <span className="hidden w-full text-gray-500 sm:block">
                                      {equippedCards.length > 1 ? t('bag.equippedOnCount', { n: equippedCards.length }) : t('bag.equippedOn')}
                                    </span>
                                    {equippedCards.map((equipped) => (
                                      <span key={`${equipped.cardId}-${equipped.slot}`} data-bag-equipped-card={equipped.cardId} className="inline-flex flex-col items-center">
                                        <CardMiniPreview
                                          card={{
                                            cardId: equipped.cardId,
                                            nameTh: equipped.nameTh,
                                            rarity: equipped.rarity ?? null,
                                            imageUrl: equipped.imageUrl ?? null,
                                            imageStatus: equipped.imageStatus ?? null,
                                          }}
                                          width={44}
                                          badge="🎴"
                                          onChanged={() => { void load(); }}
                                        />
                                        <span className="mt-0.5 block max-w-[70px] truncate text-[9px] text-emerald-200">
                                          {t(`item.slot.${equipped.slot}`)}
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-600">—</span>
                                )}
                              </div>
                              <div className="text-right">
                                {sellable > 0 ? (
                                  <button
                                    type="button"
                                    data-bag-sell={row.code}
                                    data-bag-sell-level={row.enhanceLevel ?? 0}
                                    onClick={() => sellItem(row.code, row.nameTh, row.enhanceLevel ?? 0)}
                                    disabled={busy === `${row.code}:${row.enhanceLevel ?? 0}`}
                                    className="rounded-lg bg-emerald-600/80 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                                  >
                                    {t('bag.sell')} (💠{refund.shards} + ✨{refund.dust})
                                  </button>
                                ) : (
                                  <p className="text-[10px] text-gray-500" data-bag-sell-blocked>
                                    {t('bag.sellBlocked')}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }))}
              {workshopItems.length > 0 && (
                <Link href="/decks" className="mt-2 inline-block text-xs text-gray-300 underline">
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
                              <div className="flex min-w-0 items-center gap-2">
                                {/* การ์ดวิเศษจาก Event — แสดงรูปที่ gen ไว้ (ยังไม่มี = ไอคอนกลุ่มแทน) */}
                                {item.itemType === 'CARD' && (
                                  <img
                                    src={specialArtUrl(item.code)}
                                    alt=""
                                    loading="lazy"
                                    className="h-9 w-9 shrink-0 rounded-md border border-gray-700 object-cover"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-white">{item.nameTh}</p>
                                  {/* ที่มา: แปลงรหัสหลังบ้านเป็นข้อความผู้เล่น · ไม่รู้จัก = ไม่แสดง (ผู้ใช้สั่ง) */}
                                  {sourceLabelTh(item.source) && (
                                    <p className="text-xs text-gray-500">{sourceLabelTh(item.source)}</p>
                                  )}
                                </div>
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
