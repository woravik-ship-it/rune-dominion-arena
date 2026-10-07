'use client';

// /items — ร้านช่าง (Phase 25 → Phase 43: แยกเมนู "คราฟต์" กับ "ตีบวก")
//
// ผู้ใช้สั่ง 2026-09-27: "ทำในส่วนของช่างใส่ Item ... สำหรับใส่ Item ที่ได้รับ หรือ Craft มาได้"
// ผู้ใช้สั่ง 2026-10-04: "Workshop แยกเมนู Craft กับ Upgrade · ในกระเป๋าก็แยก Item ·
//   การตีบวก คือเอาของที่มี 1 ชิ้น ไปตีบวก ของชิ้นนั้นได้บวก ไม่ใช่ทั้งกอง"
//  - แท็บ 🧪 คราฟต์ = ซื้อ/คราฟต์ Item เท่านั้น (ของใหม่ลงกอง +0) + บอกว่ามีอยู่กี่ชิ้น
//    ผู้ใช้สั่ง 2026-10-05: "หน้า Craft ไม่ต้องมี +1 · ปุ่ม upgrade ไม่ต้องมีในหน้านี้"
//    ⇒ การ์ดในแท็บคราฟต์โชว์ค่าพื้นฐานของ Item (ไม่ใช่ค่ากองที่ตีบวกแล้ว) ไม่มีป้าย +N/ชิปกอง/ปุ่มตีบวก
//  - แท็บ 🛠 ตีบวก = ของแต่ละ "กอง/ชิ้น" แยกแถว (+0 ×3 · +2 ×1) → ตีบวกทีละชิ้น หรือขายคืนเป็นกอง
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useI18n } from '@/components/providers/LocaleProvider';
import { useAudio } from '@/components/providers/AudioProvider';
import { emitVeilShardsChanged } from '@/lib/veil-shard-events';
import { sellQuote } from '@/lib/item-definitions';
import Modal from '@/components/ui/Modal';
import { itemArtUrl } from '@/lib/item-art';
import {
  ENHANCE_JEWEL_NAME_TH,
  ENHANCE_MAX_LEVEL,
  ENHANCE_SAFE_MAX,
  enhanceQuote,
} from '@/lib/item-enhance';

type SlotKey = 'ATTACK' | 'DEFENSE' | 'SUPPORT';

interface StatsView {
  atk: number;
  def: number;
  hp: number;
  spd: number;
}

/** ของ 1 กอง = ชนิดเดียวกัน + ระดับบวกเดียวกัน (ผู้ใช้สั่ง: แยก Item) */
interface StackView {
  id: string;
  itemCode: string;
  nameTh: string;
  slot: SlotKey;
  rarity: string;
  icon: string;
  /** ระดับตีบวกของกองนี้ */
  enhanceLevel: number;
  /** จำนวนชิ้นในกอง */
  quantity: number;
  equippedCount: number;
  /** ชิ้นที่ยังว่างให้ตีบวก/ขาย */
  free: number;
  /** สถานะจริงของกองนี้ (คูณโบนัสตีบวกแล้ว) */
  stats: StatsView;
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
  /** ระดับบวกสูงสุดที่มี (ใช้โชว์) */
  enhanceLevel: number;
  /** ของที่มี แยกเป็นกองตามระดับบวก */
  stacks: StackView[];
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
  const [jewels, setJewels] = useState(0);
  /** แท็บของร้านช่าง (ผู้ใช้สั่ง 2026-10-04: แยก Craft กับ Upgrade) */
  const [tab, setTab] = useState<'craft' | 'upgrade'>('craft');
  /** กำลังตีบวกของกองระดับไหน — โมดัลยืนยัน (Phase 43: ระบุระดับบวกของกองด้วย) */
  const [enhanceTarget, setEnhanceTarget] = useState<{
    code: string;
    nameTh: string;
    enhanceLevel: number;
  } | null>(null);
  /** ข้อความผลลัพธ์ตีบวก (โชว์ในโมดัล) */
  const [enhanceResult, setEnhanceResult] = useState<string | null>(null);
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
      setJewels(Number(json.data?.jewels ?? 0));
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
   * ขาย Item คืนร้าน (Phase 32 → Phase 43: ขายเป็น "กองตามระดับบวก")
   * ได้วัตถุดิบกลับมา 50% (Veil Shards + ฝุ่นเวท + Coin) · ขายได้เฉพาะ "ชิ้นที่ยังไม่ใส่อยู่บนการ์ด"
   */
  const sell = async (code: string, nameTh: string, enhanceLevel: number) => {
    setBusy(`sell:${code}:${enhanceLevel}`);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch('/api/items/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, quantity: 1, enhanceLevel }),
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
          name: enhanceLevel > 0 ? `${nameTh} +${enhanceLevel}` : nameTh,
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

  /** ของที่มีทั้งหมด แยกเป็นกองตามระดับบวก (ใช้ในแท็บ "ตีบวก") */
  const stacks = useMemo(
    () =>
      rows
        .flatMap((row) => row.stacks ?? [])
        .sort(
          (a, b) =>
            SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) ||
            a.nameTh.localeCompare(b.nameTh) ||
            b.enhanceLevel - a.enhanceLevel
        ),
    [rows]
  );

  /** ตีบวก 1 ชิ้นจากกองที่เลือก (ม้วนผลที่เซิร์ฟเวอร์) */
  const enhance = async (code: string, enhanceLevel: number) => {
    setBusy(`enhance:${code}:${enhanceLevel}`);
    setMessage('');
    setError('');
    setEnhanceResult(null);
    try {
      const res = await apiFetch('/api/items/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemCode: code, enhanceLevel }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? 'ตีบวกไม่สำเร็จ');
        setEnhanceResult(json?.error ?? 'ตีบวกไม่สำเร็จ');
        play('ui_error');
        return;
      }
      const data = json.data ?? {};
      const msg = String(data.message ?? 'ตีบวกแล้ว');
      setEnhanceResult(msg);
      setMessage(msg);
      play(data.success ? 'reward_claim' : 'ui_error');
      await load();
    } catch {
      setError('ตีบวกไม่สำเร็จ');
      setEnhanceResult('ตีบวกไม่สำเร็จ');
      play('ui_error');
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
            <span className="rounded-full bg-purple-500/10 px-3 py-1 text-purple-300" data-item-jewels={jewels}>
              💎 {jewels} {ENHANCE_JEWEL_NAME_TH}
            </span>
            <Link href="/decks" className="text-xs text-gray-300 underline hover:text-white">
              {t('nav.cards')} →
            </Link>
          </div>
        </header>

        {loading && <p className="py-6 text-center text-sm text-gray-500">{t('common.loading')}</p>}
        {!loading && error && <p className="py-2 text-sm text-red-400">{error}</p>}
        {message && <p className="py-2 text-sm text-emerald-400">{message}</p>}

        {/* แท็บร้านช่าง (ผู้ใช้สั่ง 2026-10-04: "Workshop แยกเมนู Craft กับ Upgrade") */}
        <div className="mb-4 flex gap-2" role="tablist" aria-label={t('item.title')}>
          <button
            type="button"
            role="tab"
            data-item-tab="craft"
            aria-selected={tab === 'craft'}
            onClick={() => setTab('craft')}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold ${
              tab === 'craft' ? 'bg-amber-500/90 text-black' : 'bg-white/5 text-gray-200 hover:bg-white/10'
            }`}
          >
            🧪 {t('item.tabCraft')}
          </button>
          <button
            type="button"
            role="tab"
            data-item-tab="upgrade"
            aria-selected={tab === 'upgrade'}
            onClick={() => setTab('upgrade')}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold ${
              tab === 'upgrade' ? 'bg-purple-600/90 text-white' : 'bg-white/5 text-gray-200 hover:bg-white/10'
            }`}
          >
            🛠 {t('item.tabUpgrade')}
            {stacks.length > 0 && (
              <span className="ml-1 rounded bg-black/30 px-1.5 py-0.5 text-[10px]">{stacks.length}</span>
            )}
          </button>
        </div>

        {tab === 'craft' && SLOTS.map((slot) => (
          <section key={slot} className="mb-6" data-item-shop-slot={slot}>
            <h2 className="mb-2 text-sm font-bold text-amber-300">{t(`item.slot.${slot}`)}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {rows
                .filter((row) => row.slot === slot)
                .map((row) => {
                  // แท็บคราฟต์โชว์ "ของใหม่ที่ได้" ⇒ ใช้ค่าพื้นฐานของ Item เสมอ (ไม่ใช้ค่ากองที่ตีบวกแล้ว)
                  return (
                  <div
                    key={row.code}
                    data-item-card={row.code}
                    className={`rounded-xl border bg-gray-900/70 p-3 ${RARITY_STYLE[row.rarity] ?? 'border-gray-700'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">
                          <img
                            src={itemArtUrl(row.code)}
                            alt=""
                            loading="lazy"
                            className="mr-1.5 inline-block h-8 w-8 rounded-md border border-gray-700 object-cover align-[-2px]"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                          {row.nameTh}
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

                    <p className="mt-1 text-xs text-emerald-300" data-item-base-stats={row.code}>
                      {statLabel({ atk: row.atk, def: row.def, hp: row.hp, spd: row.spd })}
                    </p>
                    {/* ระดับบวก/ชิปกอง/ตีบวก/ขาย = แท็บ 🛠 ตีบวก เท่านั้น (แท็บนี้โชว์แค่ของใหม่) */}
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
                    </div>
                  </div>
                  );
                })}
            </div>
          </section>
        ))}

        {/* แท็บ 🛠 ตีบวก — ของแยกเป็นกองตามระดับ (ผู้ใช้สั่ง: ของ 1 ชิ้นได้บวก ไม่ใช่ทั้งกอง) */}
        {tab === 'upgrade' && (
          <section data-item-upgrade-panel>
            <p className="mb-2 text-xs text-gray-400">{t('item.upgradeHint')}</p>
            {stacks.length === 0 ? (
              <div className="rounded-xl bg-gray-800 p-6 text-center text-xs text-gray-500">
                {t('item.upgradeEmpty')}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {stacks.map((stack) => {
                  const quote = enhanceQuote(stack.enhanceLevel);
                  const def = rows.find((r) => r.code === stack.itemCode) ?? null;
                  const refund = def ? sellQuote(def, 1) : { shards: 0, dust: 0, coins: 0, total: 0 };
                  const maxed = stack.enhanceLevel >= ENHANCE_MAX_LEVEL;
                  const canEnhance = !maxed && stack.free >= 1 && busy === '';
                  return (
                    <div
                      key={stack.id}
                      data-item-stack={stack.id}
                      data-item-stack-level={stack.enhanceLevel}
                      className={`rounded-xl border bg-gray-900/70 p-3 ${RARITY_STYLE[stack.rarity] ?? 'border-gray-700'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white">
                            <img
                              src={itemArtUrl(stack.itemCode)}
                              alt=""
                              loading="lazy"
                              className="mr-1.5 inline-block h-8 w-8 rounded-md border border-gray-700 object-cover align-[-2px]"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                            {stack.nameTh}
                            <span
                              data-item-level={stack.enhanceLevel}
                              className={`ml-1 align-middle rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                stack.enhanceLevel > 0
                                  ? 'bg-purple-500/20 text-purple-200'
                                  : 'bg-white/10 text-gray-300'
                              }`}
                            >
                              +{stack.enhanceLevel}
                            </span>
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {t(`item.slot.${stack.slot}`)} · ×{stack.quantity}
                            {stack.equippedCount > 0 && (
                              <span className="ml-1 text-emerald-300">
                                ({t('item.equippedCount', { n: stack.equippedCount })})
                              </span>
                            )}
                          </p>
                        </div>
                        <span className="shrink-0 rounded bg-white/5 px-2 py-0.5 text-[11px] text-gray-300">
                          {t('item.stackLabel', { level: stack.enhanceLevel, n: stack.quantity })}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-emerald-300">{statLabel(stack.stats)}</p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          data-item-enhance={stack.itemCode}
                          data-item-enhance-level={stack.enhanceLevel}
                          onClick={() => {
                            setEnhanceTarget({
                              code: stack.itemCode,
                              nameTh: stack.nameTh,
                              enhanceLevel: stack.enhanceLevel,
                            });
                            setEnhanceResult(null);
                          }}
                          disabled={!canEnhance}
                          className="rounded-lg bg-purple-600/80 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-40"
                          title={
                            maxed
                              ? t('item.enhanceMaxed')
                              : stack.free < 1
                                ? t('item.enhanceNoFree')
                                : ''
                          }
                        >
                          {maxed
                            ? `+${ENHANCE_MAX_LEVEL} · ${t('item.enhanceMaxShown')}`
                            : `🛠 ${t('item.enhance')} (+${stack.enhanceLevel}→+${quote.target})`}
                        </button>
                        {stack.free > 0 && (
                          <button
                            type="button"
                            data-item-sell={stack.itemCode}
                            data-item-sell-level={stack.enhanceLevel}
                            onClick={() => sell(stack.itemCode, stack.nameTh, stack.enhanceLevel)}
                            disabled={busy === `sell:${stack.itemCode}:${stack.enhanceLevel}`}
                            className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                            title={t('item.sellItemHint', { shards: refund.shards, dust: refund.dust })}
                          >
                            {t('item.sellItemButton')} (💠{refund.shards} + ✨{refund.dust}
                            {refund.coins > 0 ? ` + 🪙${refund.coins}` : ''})
                          </button>
                        )}
                        {stack.free === 0 && (
                          <span className="rounded bg-white/5 px-2 py-1 text-[11px] text-gray-400">
                            {t('item.sellItemBlocked')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* โมดัลตีบวก Item (ผู้ใช้สั่ง 2026-10-03) */}
        <Modal
          open={enhanceTarget !== null}
          onClose={() => {
            setEnhanceTarget(null);
            setEnhanceResult(null);
          }}
          title={enhanceTarget ? `🛠️ ${enhanceTarget.nameTh} — ตีบวก` : ''}
          subtitle="ระดับ +0..+15 · พลาดระดับหล่นตามกติกา"
          size="sm"
        >
          {enhanceTarget &&
            (() => {
              const level = enhanceTarget.enhanceLevel;
              const targetRow = rows.find((r) => r.code === enhanceTarget.code) ?? null;
              const targetStack = targetRow?.stacks.find((s) => s.enhanceLevel === level) ?? null;
              if (!targetRow) return null;
              const quote = enhanceQuote(level);
              const free = targetStack?.free ?? 0;
              const canEnhance =
                busy === '' &&
                jewels >= quote.jewels &&
                coins >= quote.coin &&
                dust >= quote.dust &&
                free >= 1;
              return (
                <div className="space-y-2 text-sm" data-enhance-panel={enhanceTarget.code}>
                  <p className="text-gray-200">
                    ระดับ <b className="text-purple-300">+{level}</b> →{' '}
                    <b className="text-amber-300">+{quote.target}</b>
                    {quote.target >= ENHANCE_SAFE_MAX + 1 && (
                      <span className="ml-2 text-[11px] text-orange-300">⚠️ {t('item.enhanceDropWarn')}</span>
                    )}
                  </p>
                  <p>{t('item.enhanceChance', { n: quote.chancePercent })}</p>

                  <ul className="space-y-1 border-t border-white/10 pt-2 text-xs text-gray-300">
                    {/* ผู้ใช้สั่ง 2026-10-04: ตีบวกทีละชิ้น — ใช้ "ชิ้นที่เลือก" 1 ชิ้น ไม่ใช่ทั้งกอง */}
                    <li>🔁 {t('item.enhancePiece', { n: quote.pieces })}</li>
                    <li>
                      🪙 Coin ×{quote.coin} <span className="text-gray-500">(มี {coins})</span>
                    </li>
                    <li>
                      ✨ {t('item.dust')} ×{quote.dust} <span className="text-gray-500">(มี {dust})</span>
                    </li>
                    {quote.jewels > 0 && (
                      <li className="text-purple-300">
                        💎 {ENHANCE_JEWEL_NAME_TH} ×{quote.jewels} <span className="text-gray-500">(มี {jewels})</span>
                        {jewels < quote.jewels && (
                          <span className="ml-2 text-[11px] text-orange-300" data-jewel-find-only>
                            ⚠️ {t('item.jewelFindOnly')}
                          </span>
                        )}
                      </li>
                    )}
                  </ul>

                  {free < 1 && <p className="text-xs text-red-400">{t('item.enhanceNoFree')}</p>}

                  {enhanceResult && (
                    <p
                      data-enhance-result
                      className={`rounded-lg px-3 py-2 text-sm ${
                        enhanceResult.includes('สำเร็จ') ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
                      }`}
                    >
                      {enhanceResult}
                    </p>
                  )}

                  <button
                    type="button"
                    data-enhance-go
                    onClick={() => void enhance(targetRow.code, level)}
                    disabled={!canEnhance || busy === `enhance:${targetRow.code}:${level}`}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {busy === `enhance:${targetRow.code}:${level}`
                      ? 'กำลังตีบวก...'
                      : `🛠 ${t('item.enhance')} (+${level}→+${quote.target})`}
                  </button>
                </div>
              );
            })()}
        </Modal>
      </div>
    </main>
  );
}
