'use client';

// /items — ร้านช่าง (Phase 25)
//
// ผู้ใช้สั่ง 2026-09-27: "ทำในส่วนของช่างใส่ Item ... สำหรับใส่ Item ที่ได้รับ หรือ Craft มาได้"
//  - แสดง Item ทั้ง 3 ช่อง (โจมตี/ป้องกัน/สนับสนุน) พร้อม Status ที่เพิ่มให้การ์ด
//  - ซื้อด้วย Veil Shards (ของพื้นฐาน) หรือคราฟต์ด้วย Veil Shards + ฝุ่นเวท (ของแรงกว่า)
//  - ของที่ได้แล้วไป "ใส่" ที่หน้าการ์ด (ลิงก์ไป /cards)
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useI18n } from '@/components/providers/LocaleProvider';
import { useAudio } from '@/components/providers/AudioProvider';
import { emitVeilShardsChanged } from '@/lib/veil-shard-events';
import { sellQuote } from '@/lib/item-definitions';

type SlotKey = 'ATTACK' | 'DEFENSE' | 'SUPPORT';

interface StatsView {
  atk: number;
  def: number;
  hp: number;
  spd: number;
}

interface CatalogRowView {
  code: string;
  name: string;
  nameTh: string;
  descriptionTh: string | null;
  slot: SlotKey;
  rarity: string;
  icon: string;
  atk: number;
  def: number;
  hp: number;
  spd: number;
  craftCost: number;
  dustCost: number;
  buyCost: number | null;
  /** Phase 39: Coin ที่ต้องใช้ตอนคราฟต์ */
  coinCost: number;
  missingCoins?: number;
  owned: number;
  equippedCount: number;
  canBuy: boolean;
  canCraft: boolean;
  missingShards: number;
  missingDust: number;
}

const SLOTS: SlotKey[] = ['ATTACK', 'DEFENSE', 'SUPPORT'];

const RARITY_STYLE: Record<string, string> = {
  COMMON: 'border-gray-500/50',
  UNCOMMON: 'border-green-500/50',
  RARE: 'border-blue-500/50',
  EPIC: 'border-purple-500/50',
  LEGENDARY: 'border-amber-500/60',
  MYTHIC: 'border-red-500/60',
};

const RARITY_LABEL: Record<string, string> = {
  COMMON: 'ทั่วไป',
  UNCOMMON: 'ไม่ธรรมดา',
  RARE: 'หายาก',
  EPIC: 'ตำนาน',
  LEGENDARY: 'ตำนานเลือง',
  MYTHIC: 'สร้างสรรค์',
};

function statLabel(row: StatsView): string {
  const parts: string[] = [];
  if (row.atk) parts.push(`+${row.atk} ATK`);
  if (row.def) parts.push(`+${row.def} DEF`);
  if (row.hp) parts.push(`+${row.hp} HP`);
  if (row.spd) parts.push(`+${row.spd} SPD`);
  return parts.join(' · ') || '—';
}

export default function ItemsPage() {
  const { t } = useI18n();
  const { play } = useAudio();
  const [rows, setRows] = useState<CatalogRowView[]>([]);
  const [veilShards, setVeilShards] = useState(0);
  const [dust, setDust] = useState(0);
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/items');
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? t('common.error'));
        return;
      }
      setError('');
      setRows((json.data?.rows ?? []) as CatalogRowView[]);
      setVeilShards(Number(json.data?.veilShards ?? 0));
      setDust(Number(json.data?.dust ?? 0));
      setCoins(Number(json.data?.coins ?? 0));
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (mode: 'buy' | 'craft', code: string, nameTh: string) => {
    setBusy(`${mode}:${code}`);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch(`/api/items/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? t('common.error'));
        return;
      }
      play(mode === 'craft' ? 'reward_claim' : 'coin');
      setMessage(t(mode === 'craft' ? 'item.crafted' : 'item.bought', { name: nameTh }));
      // Phase 25.1: ยอด 💠 บนหัวเว็บต้องลดทันที (ไม่ต้องรอเปลี่ยนหน้า/รีเฟรช)
      emitVeilShardsChanged(Number(json.data?.balance));
      await load();
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy('');
    }
  };

  /**
   * ขาย Item คืนร้าน (Phase 32) — ได้วัตถุดิบกลับมา 50% (Veil Shards + ฝุ่นเวท)
   * ขายได้เฉพาะ "ชิ้นที่ยังไม่ใส่อยู่บนการ์ด" (owned − equippedCount)
   */
  const sell = async (code: string, nameTh: string) => {
    setBusy(`sell:${code}`);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch('/api/items/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, quantity: 1 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? t('common.error'));
        return;
      }
      const data = json.data ?? {};
      play('coin');
      setMessage(
        t('item.sellItemDone', {
          name: nameTh,
          n: Number(data.sold ?? 1),
          shards: Number(data.refundShards ?? 0),
          dust: Number(data.refundDust ?? 0),
        })
      );
      emitVeilShardsChanged(Number(data.balance));
      await load();
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy('');
    }
  };

  return (
    <main className="min-h-screen p-4 pb-24">
      <div className="mx-auto max-w-3xl">
        <header className="mb-4">
          <h1 className="text-2xl font-bold">🛠️ {t('item.title')}</h1>
          <p className="text-sm text-gray-400">{t('item.subtitle')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-sky-500/10 px-3 py-1 text-sky-300" data-veil-shards={veilShards}>
              💠 {veilShards} {t('item.veilShards')}
            </span>
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-300" data-dust={dust}>
              ✨ {dust} {t('item.dust')}
            </span>
            {/* Phase 39: คราฟต์ต้องใช้ Coin ด้วย ⇒ โชว์ยอด Coin ให้เห็นก่อนกด */}
            <span className="rounded-full bg-yellow-500/10 px-3 py-1 text-yellow-200" data-item-coins={coins}>
              🪙 {coins}
            </span>
            <Link href="/cards" className="text-xs text-gray-300 underline hover:text-white">
              {t('nav.cards')} →
            </Link>
          </div>
        </header>

        {loading && <p className="py-6 text-center text-sm text-gray-500">{t('common.loading')}</p>}
        {!loading && error && <p className="py-2 text-sm text-red-400">{error}</p>}
        {message && <p className="py-2 text-sm text-emerald-400">{message}</p>}

        {SLOTS.map((slot) => (
          <section key={slot} className="mb-6" data-item-shop-slot={slot}>
            <h2 className="mb-2 text-sm font-bold text-amber-300">{t(`item.slot.${slot}`)}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {rows
                .filter((row) => row.slot === slot)
                .map((row) => {
                  // ขายได้เฉพาะชิ้นที่ยังไม่ใส่อยู่บนการ์ด (ผู้ใช้สั่ง: ขายคืนวัตถุดิบ 50%)
                  const sellable = Math.max(0, row.owned - row.equippedCount);
                  const refund = sellQuote(row, 1);
                  return (
                  <div
                    key={row.code}
                    data-item-card={row.code}
                    className={`rounded-xl border bg-gray-900/70 p-3 ${RARITY_STYLE[row.rarity] ?? 'border-gray-700'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">
                          {row.icon} {row.nameTh}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {row.name} · {RARITY_LABEL[row.rarity] ?? row.rarity}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-[11px] text-gray-400">
                        <p>{t('item.owned', { n: row.owned })}</p>
                        {row.equippedCount > 0 && (
                          <p className="text-emerald-300">{t('item.equippedCount', { n: row.equippedCount })}</p>
                        )}
                      </div>
                    </div>

                    <p className="mt-1 text-xs text-emerald-300">{statLabel(row)}</p>
                    {row.descriptionTh && (
                      <p className="mt-1 text-[11px] leading-snug text-gray-500">{row.descriptionTh}</p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded bg-sky-500/10 px-2 py-0.5 text-sky-300" data-item-craft-cost={row.code}>
                        {t('item.craft')}: {t('item.costShards', { n: row.craftCost })}
                        {row.dustCost > 0 && ` + ${t('item.costDust', { n: row.dustCost })}`}
                        {row.coinCost > 0 && ` + 🪙${row.coinCost}`}
                      </span>
                      <span className="rounded bg-white/5 px-2 py-0.5 text-gray-300">
                        {row.buyCost === null
                          ? t('item.craftOnly')
                          : `${t('item.buy')}: ${t('item.costShards', { n: row.buyCost })}`}
                      </span>
                    </div>

                    {!row.canCraft && (
                      <p className="mt-1 text-[11px] text-red-400">
                        {t('item.needMore', { shards: row.missingShards, dust: row.missingDust })}
                        {(row.missingCoins ?? 0) > 0 && ` · 🪙 ขาดอีก ${row.missingCoins}`}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        data-item-craft={row.code}
                        onClick={() => act('craft', row.code, row.nameTh)}
                        disabled={!row.canCraft || busy === `craft:${row.code}`}
                        className="rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-40"
                      >
                        {t('item.craft')}
                      </button>
                      {row.buyCost !== null && (
                        <button
                          type="button"
                          data-item-buy={row.code}
                          onClick={() => act('buy', row.code, row.nameTh)}
                          disabled={!row.canBuy || busy === `buy:${row.code}`}
                          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-gray-100 hover:bg-white/20 disabled:opacity-40"
                        >
                          {t('item.buy')}
                        </button>
                      )}
                      {sellable > 0 && (
                        <button
                          type="button"
                          data-item-sell={row.code}
                          onClick={() => sell(row.code, row.nameTh)}
                          disabled={busy === `sell:${row.code}`}
                          className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                          title={t('item.sellItemHint', { shards: refund.shards, dust: refund.dust })}
                        >
                          {t('item.sellItemButton')} (💠{refund.shards} + ✨{refund.dust}{refund.coins > 0 ? ` + 🪙${refund.coins}` : ''})
                        </button>
                      )}
                      {row.owned > 0 && sellable === 0 && (
                        <span className="rounded bg-white/5 px-2 py-1 text-[11px] text-gray-400">
                          {t('item.sellItemBlocked')}
                        </span>
                      )}
                    </div>
                  </div>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
