'use client';

// CardItemWorkshop — "ช่างใส่ Item" ของการ์ด 1 ใบ (Phase 25)
//
// ผู้ใช้สั่ง 2026-09-27: "ทำในส่วนของช่างใส่ Item เพิ่ม Status ให้ 3 ช่อง Item โจมตี, ป้องกัน, สนับสนุน
//   สำหรับใส่ Item ที่ได้รับ หรือ Craft มาได้"
//  - 3 ช่องตายตัว: โจมตี / ป้องกัน / สนับสนุน (ช่องละ 1 ชิ้น)
//  - เลือกใส่ได้เฉพาะของที่ "มีในคลัง" และยังว่างให้ใส่ (ของซ้ำใส่หลายการ์ดได้)
//  - Status จาก Item บวกเข้าสถานะการ์ดจริง (แสดง "สถานะรวม" ให้เห็นก่อนไปต่อสู้)
//  - ขายการ์ดคืนร้านได้ Veil Shards ตามความหายาก (2 ขั้น: กดขาย → ยืนยัน)
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useI18n } from '@/components/providers/LocaleProvider';
import { useAudio } from '@/components/providers/AudioProvider';
import { emitVeilShardsChanged } from '@/lib/veil-shard-events';
import { itemArtUrl } from '@/lib/item-art';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface ItemStatsView {
  atk: number;
  def: number;
  hp: number;
  spd: number;
}

type SlotKey = 'ATTACK' | 'DEFENSE' | 'SUPPORT';

interface EquippedView {
  slot: SlotKey;
  itemCode: string;
  nameTh: string;
  icon: string;
  rarity: string;
  /** ระดับตีบวกของชิ้นที่ใส่ (Phase 43) */
  enhanceLevel: number;
  stats: ItemStatsView;
}

interface AvailableView {
  itemCode: string;
  nameTh: string;
  icon: string;
  rarity: string;
  stats: ItemStatsView;
  free: number;
  /** ระดับตีบวกของกองนี้ — เลือกใส่ได้ว่าชิ้นระดับไหน (Phase 43) */
  enhanceLevel: number;
}

interface WorkshopData {
  cardName: string;
  rarity: string;
  quantity: number;
  sellValue: number;
  veilShards: number;
  slots: SlotKey[];
  equipped: EquippedView[];
  available: Record<SlotKey, AvailableView[]>;
  baseStats: ItemStatsView;
  bonusStats: ItemStatsView;
  effectiveStats: ItemStatsView;
}

/** แสดง Status ของ Item แบบสั้น เช่น "+16 ATK" */
function statLabel(stats: ItemStatsView): string {
  const parts: string[] = [];
  if (stats.atk) parts.push(`+${stats.atk} ATK`);
  if (stats.def) parts.push(`+${stats.def} DEF`);
  if (stats.hp) parts.push(`+${stats.hp} HP`);
  if (stats.spd) parts.push(`+${stats.spd} SPD`);
  return parts.join(' · ');
}

export default function CardItemWorkshop({
  cardId,
  onChanged,
}: {
  cardId: string;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const { play } = useAudio();
  const [data, setData] = useState<WorkshopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sellConfirm, setSellConfirm] = useState(false);
  /** Phase 41: ยืนยันก่อนสลับ/ถอด Item (ผู้ใช้สั่ง: "การเปลี่ยน Item ต้องมีหน้า Confirm") */
  const [confirmSwap, setConfirmSwap] = useState<{ slot: SlotKey; from: EquippedView | null; to: AvailableView } | null>(null);
  const [confirmUnequip, setConfirmUnequip] = useState<{ slot: SlotKey; item: EquippedView } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/cards/${cardId}/equipment`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? t('common.error'));
        return;
      }
      setError('');
      setData(json.data as WorkshopData);
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [cardId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const equip = async (slot: SlotKey, itemCode: string, enhanceLevel: number) => {
    setBusy(`${slot}:${itemCode}:${enhanceLevel}`);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch(`/api/cards/${cardId}/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Phase 43: ระบุระดับบวกของกองที่จะดึงชิ้นมาใส่ (+0 = ของธรรมดา)
        body: JSON.stringify({ slot, itemCode, enhanceLevel }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? t('common.error'));
        return;
      }
      play('ui_tap');
      setMessage(json.data?.message ?? t('item.equipped', { name: itemCode }));
      await load();
      onChanged?.();
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy('');
    }
  };

  const unequip = async (slot: SlotKey) => {
    setBusy(`unequip:${slot}`);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch(`/api/cards/${cardId}/equipment?slot=${slot}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? t('common.error'));
        return;
      }
      play('ui_back');
      setMessage(t('item.unequipped'));
      await load();
      onChanged?.();
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy('');
    }
  };

  const sellCard = async () => {
    setBusy('sell');
    setMessage('');
    setError('');
    try {
      const res = await apiFetch(`/api/cards/${cardId}/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 1 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? t('common.error'));
        return;
      }
      play('coin');
      setMessage(json.data?.message ?? '');
      // Phase 25.1: ขายการ์ดแล้วยอด 💠 บนหัวเว็บต้องขึ้นทันที
      emitVeilShardsChanged(Number(json.data?.veilShards));
      setSellConfirm(false);
      await load();
      onChanged?.();
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <div className="mb-4 rounded-xl border border-white/10 bg-gray-800/60 p-3 text-sm text-gray-400">
        {t('common.loading')}
      </div>
    );
  }
  if (!data) return null;

  const bonusLabel = statLabel(data.bonusStats);

  return (
    <section data-item-workshop="true" className="mb-4 rounded-xl border border-white/10 bg-gray-800/60 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-200">{t('item.workshopTitle')}</h3>
        <span className="text-xs text-sky-300" data-veil-shards={data.veilShards}>
          💠 {data.veilShards} {t('item.veilShards')}
        </span>
      </div>
      <p className="mb-2 text-[11px] leading-snug text-gray-500">{t('item.slotHint')}</p>

      {data.slots.map((slot) => {
        const equipped = data.equipped.find((row) => row.slot === slot) ?? null;
        const options = data.available[slot] ?? [];
        return (
          <div
            key={slot}
            data-item-slot={slot}
            className="mb-2 rounded-lg border border-gray-700 bg-gray-900/70 p-2"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-amber-300">{t(`item.slot.${slot}`)}</span>
              {equipped ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-gray-200">
                    <img
                      src={itemArtUrl(equipped.itemCode)}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded-md border border-gray-700 object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    {equipped.nameTh}
                    {(equipped.enhanceLevel ?? 0) > 0 && (
                      <span
                        data-equipped-item-level={equipped.enhanceLevel}
                        className="rounded bg-purple-500/25 px-1 py-0.5 text-[10px] font-bold text-purple-200"
                      >
                        +{equipped.enhanceLevel}
                      </span>
                    )}
                    <span className="ml-1 text-emerald-300">{statLabel(equipped.stats)}</span>
                  </span>
                  <button
                    type="button"
                    data-item-unequip={slot}
                    onClick={() => equipped && setConfirmUnequip({ slot, item: equipped })}
                    disabled={busy === `unequip:${slot}`}
                    className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-gray-200 hover:bg-white/20 disabled:opacity-50"
                  >
                    {t('item.unequip')}
                  </button>
                </div>
              ) : (
                <span className="text-xs text-gray-500">{t('item.empty')}</span>
              )}
            </div>

            {options.length === 0 ? (
              <p className="text-[11px] text-gray-600">{t('item.craftOnly')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {options.map((option) => {
                  const isEquipped =
                    equipped?.itemCode === option.itemCode &&
                    (equipped.enhanceLevel ?? 0) === option.enhanceLevel;
                  const usable = option.free > 0 || isEquipped;
                  const optionKey = `${option.itemCode}:${option.enhanceLevel}`;
                  return (
                    <button
                      key={optionKey}
                      type="button"
                      data-item-option={option.itemCode}
                      data-item-option-level={option.enhanceLevel}
                      data-item-slot-option={slot}
                      onClick={() => {
                        // มีของในช่องแล้ว = เป็นการ "เปลี่ยน" → ยืนยันก่อน (ผู้ใช้สั่ง)
                        if (
                          equipped &&
                          (equipped.itemCode !== option.itemCode ||
                            (equipped.enhanceLevel ?? 0) !== option.enhanceLevel)
                        ) {
                          setConfirmSwap({ slot, from: equipped, to: option });
                          return;
                        }
                        void equip(slot, option.itemCode, option.enhanceLevel);
                      }}
                      disabled={!usable || busy === `${slot}:${option.itemCode}:${option.enhanceLevel}` || isEquipped}
                      className={`rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                        isEquipped
                          ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                          : usable
                            ? 'border-amber-400/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                            : 'border-gray-700 bg-gray-800 text-gray-500'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                      <img
                        src={itemArtUrl(option.itemCode)}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded-md border border-gray-700 object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      {option.nameTh}
                      {option.enhanceLevel > 0 && (
                        <span className="rounded bg-purple-500/25 px-1 py-0.5 text-[10px] font-bold text-purple-200">
                          +{option.enhanceLevel}
                        </span>
                      )}
                    </span>
                      <span className="ml-1 text-gray-400">{statLabel(option.stats)}</span>
                      <span className="ml-1 text-gray-500">({t('item.owned', { n: option.free })})</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* สรุป Status ที่ได้จาก Item */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
        <span>
          {t('item.fromItems')}: <span className="text-emerald-300">{bonusLabel || '—'}</span>
        </span>
        <span>
          {t('item.effective')}: ATK {data.effectiveStats.atk} · DEF {data.effectiveStats.def} · HP{' '}
          {data.effectiveStats.hp} · SPD {data.effectiveStats.spd}
        </span>
      </div>

      {/* ขายคืนร้าน → ได้ Veil Shards ตามความหายาก */}
      <div className="rounded-lg border border-white/10 bg-gray-900/70 p-2">
        <p className="text-xs font-semibold text-gray-300">{t('item.sellTitle')}</p>
        <p className="mt-0.5 text-[11px] text-gray-500">{t('item.sellHint', { n: data.sellValue })}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {sellConfirm ? (
            <>
              <button
                type="button"
                data-card-sell-confirm
                onClick={sellCard}
                disabled={busy === 'sell'}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {t('item.sellConfirm')}
              </button>
              <button
                type="button"
                onClick={() => setSellConfirm(false)}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/20"
              >
                {t('item.cancel')}
              </button>
            </>
          ) : (
            <button
              type="button"
              data-card-sell
              onClick={() => setSellConfirm(true)}
              disabled={data.quantity <= 0}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-gray-100 hover:bg-white/20 disabled:opacity-40"
            >
              {t('item.sellButton', { n: 1 })}
            </button>
          )}
        </div>
      </div>

      {message && <p className="mt-2 text-xs text-emerald-400">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {/* ยืนยันเปลี่ยน Item (ของเดิม → ของใหม่) */}
      <ConfirmDialog
        open={confirmSwap !== null}
        busy={busy !== ''}
        title="เปลี่ยน Item ในช่องนี้?"
        confirmLabel="เปลี่ยน"
        cancelLabel="ยกเลิก"
        onConfirm={() => {
          const pending = confirmSwap;
          setConfirmSwap(null);
          if (pending) void equip(pending.slot, pending.to.itemCode, pending.to.enhanceLevel);
        }}
        onCancel={() => setConfirmSwap(null)}
      >
        {confirmSwap && (
          <div data-item-swap-confirm className="mt-2 space-y-1 text-sm">
            <p className="text-gray-300">{t(`item.slot.${confirmSwap.slot}`)}</p>
            {confirmSwap.from && (
              <p className="text-gray-400">
                เดิม: {confirmSwap.from.nameTh}
                <span className="text-gray-500"> ({statLabel(confirmSwap.from.stats) || 'ไม่มีสถานะ'})</span>
              </p>
            )}
            <p className="text-gray-200">
              ใหม่: {confirmSwap.to.nameTh}
              <span className="text-gray-500"> ({statLabel(confirmSwap.to.stats) || 'ไม่มีสถานะ'})</span>
            </p>
          </div>
        )}
      </ConfirmDialog>

      {/* ยืนยันถอด Item */}
      <ConfirmDialog
        open={confirmUnequip !== null}
        danger
        busy={busy !== ''}
        title="ถอด Item ออก?"
        confirmLabel="ถอดออก"
        cancelLabel="ยกเลิก"
        onConfirm={() => {
          const pending = confirmUnequip;
          setConfirmUnequip(null);
          if (pending) void unequip(pending.slot);
        }}
        onCancel={() => setConfirmUnequip(null)}
      >
        {confirmUnequip && (
          <p data-item-unequip-confirm className="text-sm text-gray-300">
            {confirmUnequip.item.icon} {confirmUnequip.item.nameTh} · {t(`item.slot.${confirmUnequip.slot}`)}
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}
