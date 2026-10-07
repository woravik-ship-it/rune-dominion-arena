'use client';

/**
 * คอลเลคชั่นการ์ด — /cards
 *
 * ผู้ใช้สั่ง 2026-10-07: *"เอาเมนู คอลเลคชั่นการ์ด กลับมา และทำให้สมบูรณ์กว่าเดิม"*
 * (Phase 42 เคยรวมหน้าการ์ดเข้าหน้าจัดเด็คแล้วเหลือ redirect — รอบนี้ทำเป็นหน้าคอลเลคชั่นจริง)
 *
 * สมบูรณ์กว่าเดิมยังไง:
 *  - เป็น "สมุดสะสมทั้งเกม" → เห็นการ์ดทุกใบที่มีในเกม รวมใบที่ยังไม่เคยค้นพบ (โชว์เป็นเงา 🔒)
 *    เดิมเห็นเฉพาะใบที่มี ⇒ ไม่รู้ว่ายังขาดอะไร
 *  - แถบความคืบหน้า: สะสมแล้วกี่ใบ/ทั้งหมด กี่ % + แยกตามระดับหายาก
 *  - ตัวกรองครบ: แท็บ (ทั้งหมด/ที่มีอยู่/ยังไม่มี) · ธาตุ · ระดับหายาก · บทบาท · ค้นหา
 *  - เรียงได้ 8 แบบ (พลังรวม/ATK/DEF/HP/SPD/ความหายาก/ได้มาล่าสุด/ชื่อ)
 *  - จัดการได้ในหน้าเดียว: เปิดรายละเอียด · ติดดาว (favorite) · เพิ่มลงทีม (quick-add)
 */
import { apiFetch } from '@/lib/api-client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import CardFace from '@/components/cards/CardFace';
import { useI18n } from '@/components/providers/LocaleProvider';
import {
  COLLECTION_SORTS,
  cardPower,
  type CollectionCard,
  type CollectionSort,
  type CollectionSummary,
  type CollectionTab,
} from '@/lib/collection';

const PAGE_SIZE = 24;

/** ธาตุ 6 — ป้ายสั้นแบบเดียวกับที่ใช้ในหน้าจัดเด็ค */
const ELEMENT_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'ALL', label: 'ทุกธาตุ' },
  { key: 'EMBERBOUND', label: '🔥 เพลิง' },
  { key: 'TIDEBORN', label: '💧 น้ำ' },
  { key: 'SKYRIVEN', label: '🌪️ ลม' },
  { key: 'ROOTFORGED', label: '🪨 ดิน' },
  { key: 'DAWNSWORN', label: '✨ แสง' },
  { key: 'VEILMARKED', label: '🌑 เงา' },
];

/** ระดับหายาก 6 — ชื่อไทยชุดเดียวกับกรอบการ์ด (image-placeholder.ts RARITY_FRAME) */
const RARITY_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'ALL', label: 'ทุกระดับ' },
  { key: 'COMMON', label: 'ทั่วไป' },
  { key: 'UNCOMMON', label: 'ไม่ธรรมดา' },
  { key: 'RARE', label: 'หายาก' },
  { key: 'EPIC', label: 'มหากาพย์' },
  { key: 'LEGENDARY', label: 'ตำนาน' },
  { key: 'MYTHIC', label: 'เทพนิยาย' },
];

/** บทบาทการ์ด 6 — ชื่อไทยชุดเดียวกับที่การ์ดใช้แสดง (image-placeholder.ts ROLE_TH) */
const ROLE_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'ALL', label: 'ทุกบทบาท' },
  { key: 'WARRIOR', label: 'นักรบ' },
  { key: 'MAGE', label: 'จอมเวท' },
  { key: 'HEALER', label: 'ผู้รักษา' },
  { key: 'TANK', label: 'ผู้พิทักษ์' },
  { key: 'ASSASSIN', label: 'นักฆ่า' },
  { key: 'SUPPORT', label: 'ผู้สนับสนุน' },
];

const SORT_LABEL_KEY: Record<CollectionSort, string> = {
  power: 'collection.sort.power',
  atk: 'collection.sort.atk',
  def: 'collection.sort.def',
  hp: 'collection.sort.hp',
  spd: 'collection.sort.spd',
  rarity: 'collection.sort.rarity',
  newest: 'collection.sort.newest',
  name: 'collection.sort.name',
};

const TAB_LABEL_KEY: Record<CollectionTab, string> = {
  all: 'collection.tabAll',
  owned: 'collection.tabOwned',
  missing: 'collection.tabMissing',
};

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function CollectionPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<CollectionCard[]>([]);
  const [summary, setSummary] = useState<CollectionSummary | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [tab, setTab] = useState<CollectionTab>('all');
  const [element, setElement] = useState('ALL');
  const [rarity, setRarity] = useState('ALL');
  const [role, setRole] = useState('ALL');
  const [search, setSearch] = useState('');
  /** ช่องค้นหาแบบ debounce — พิมพ์เร็ว ๆ ต้องไม่ยิง API ทุกตัวอักษร
   *  (2026-10-07 ผู้ใช้แจ้ง "หน้าคอลเลกชั่นค่อนข้างกระตุก" · วัดได้ 8 ตัวอักษร = 8 คำขอ) */
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState<CollectionSort>('power');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), tab, sort });
      if (element !== 'ALL') params.set('element', element);
      if (rarity !== 'ALL') params.set('rarity', rarity);
      if (role !== 'ALL') params.set('role', role);
      if (search.trim()) params.set('search', search.trim());

      const res = await apiFetch(`/api/collection?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? 'โหลดคอลเลคชั่นไม่สำเร็จ');
        return;
      }
      setErr(null);
      setRows(data.data ?? []);
      setSummary(data.summary ?? null);
      setPagination(data.pagination ?? { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (e) {
      console.error(e);
      setErr('โหลดคอลเลคชั่นไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [page, tab, sort, element, rarity, role, search]);

  useEffect(() => {
    load();
  }, [load]);

  /** หน่วง 300 ms ก่อนยิงค้นหา (พิมพ์ติดกัน = ยิงครั้งเดียว) แล้วกลับไปหน้าแรก */
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  /** เปลี่ยนตัวกรองใด ๆ = กลับไปหน้าแรก (กันค้างอยู่หน้าที่ไม่มีผลลัพธ์) */
  const resetTo = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const toggleFavorite = async (card: CollectionCard) => {
    if (!card.owned) return;
    const next = !card.isFavorite;
    // optimistic — กดแล้วเห็นผลทันที แล้วค่อยยืนยันกับเซิร์ฟเวอร์
    setRows((prev) => prev.map((r) => (r.cardId === card.cardId ? { ...r, isFavorite: next } : r)));
    try {
      const res = await apiFetch('/api/cards/favorite', {
        method: 'POST',
        body: JSON.stringify({ cardId: card.cardId, isFavorite: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setRows((prev) => prev.map((r) => (r.cardId === card.cardId ? { ...r, isFavorite: !next } : r)));
        setErr(data.error ?? 'ติดดาวไม่สำเร็จ');
        return;
      }
      setMsg(next ? t('collection.favoriteOn') : t('collection.favoriteOff'));
    } catch (e) {
      console.error(e);
      setErr('ติดดาวไม่สำเร็จ');
    }
  };

  const addToDeck = async (card: CollectionCard) => {
    setBusy(card.cardId);
    setErr(null);
    try {
      const res = await apiFetch('/api/decks/quick-add', {
        method: 'POST',
        body: JSON.stringify({ cardId: card.cardId }),
      });
      const data = await res.json();
      if (res.ok && data.success) setMsg(data.message ?? t('collection.added'));
      else setErr(data.error ?? 'เพิ่มลงทีมไม่สำเร็จ');
    } catch (e) {
      console.error(e);
      setErr('เพิ่มลงทีมไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const to = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <main className="min-h-screen p-3 sm:p-4">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold sm:text-3xl">{t('collection.title')}</h1>
        <p className="mb-3 text-xs text-gray-400 sm:text-sm">{t('collection.subtitle')}</p>

        {/* ── แถบความคืบหน้าของคอลเลคชั่น (ทั้งเกม ไม่ขึ้นกับตัวกรอง) ── */}
        {summary && (
          <section data-collection-summary className="mb-3 rounded-xl border border-gray-700 bg-gray-900/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-1 text-sm">
              <span data-collection-progress={summary.percent} className="font-bold text-amber-200">
                {t('collection.progressLabel', {
                  owned: summary.ownedUnique,
                  total: summary.total,
                  percent: summary.percent,
                })}
              </span>
              <span className="text-[11px] text-gray-400">
                {t('collection.copiesLabel', { copies: summary.totalCopies })} ·{' '}
                {t('collection.favoritesLabel', { n: summary.favorites })}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-800">
              <div
                data-collection-progress-bar
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-200"
                style={{ width: `${summary.percent}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {summary.byRarity.map((g) => (
                <div
                  key={g.key}
                  data-collection-rarity-progress={g.key}
                  className="rounded-lg border border-gray-700 bg-gray-800/60 px-2 py-1 text-center text-[11px]"
                >
                  <div className="text-gray-300">
                    {RARITY_FILTERS.find((r) => r.key === g.key)?.label ?? g.key}
                  </div>
                  <div className="font-bold text-gray-100">
                    {g.owned}/{g.total}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {msg && <p className="mb-2 text-sm text-green-400">{msg}</p>}
        {err && <p className="mb-2 text-sm text-red-400">{err}</p>}

        {/* ── แท็บ + ตัวกรอง ── */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(Object.keys(TAB_LABEL_KEY) as CollectionTab[]).map((key) => (
            <button
              key={key}
              type="button"
              data-collection-tab={key}
              onClick={() => resetTo(() => setTab(key))}
              className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                tab === key
                  ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                  : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
              }`}
            >
              {t(TAB_LABEL_KEY[key])}
            </button>
          ))}
          <span data-collection-count className="ml-auto self-center text-[11px] text-gray-400">
            {t('collection.countLabel', { from, to, total: pagination.total })}
          </span>
        </div>

        <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('collection.searchPlaceholder')}
            data-collection-search
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-gray-400">
            {t('collection.sortLabel')}
            <select
              value={sort}
              data-collection-sort
              onChange={(e) => resetTo(() => setSort(e.target.value as CollectionSort))}
              className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-xs text-gray-100"
            >
              {COLLECTION_SORTS.map((key) => (
                <option key={key} value={key}>
                  {t(SORT_LABEL_KEY[key])}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-1 flex flex-wrap gap-1.5">
          {ELEMENT_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              data-collection-element={f.key}
              onClick={() => resetTo(() => setElement(f.key))}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                element === f.key
                  ? 'border-sky-400 bg-sky-400/20 text-sky-200'
                  : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="mb-1 flex flex-wrap gap-1.5">
          {RARITY_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              data-collection-rarity={f.key}
              onClick={() => resetTo(() => setRarity(f.key))}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                rarity === f.key
                  ? 'border-fuchsia-400 bg-fuchsia-400/20 text-fuchsia-200'
                  : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              data-collection-role={f.key}
              onClick={() => resetTo(() => setRole(f.key))}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                role === f.key
                  ? 'border-emerald-400 bg-emerald-400/20 text-emerald-200'
                  : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── กริดการ์ด ── */}
        {loading && rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">กำลังโหลด...</p>
        ) : rows.length === 0 ? (
          <p data-collection-empty className="py-10 text-center text-sm text-gray-400">
            {t('collection.empty')}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {rows.map((card) => (
              <div
                key={card.cardId}
                data-collection-card={card.cardId}
                data-collection-owned={card.owned ? '1' : '0'}
                data-collection-quantity={card.quantity}
                className="rounded-xl"
              >
                <Link
                  href={`/cards/${card.cardId}`}
                  className={`relative block aspect-[7/10] overflow-hidden rounded-xl border-2 ${
                    card.owned ? 'border-gray-700' : 'border-gray-800 opacity-70'
                  }`}
                  title={card.nameTh ?? card.name}
                >
                  <CardFace
                    cardId={card.cardId}
                    imageUrl={card.imageUrl}
                    imageStatus={card.imageStatus}
                    rarity={card.rarity}
                    alt={card.nameTh ?? card.name}
                    // การ์ดที่ยังไม่ค้นพบถูกฉากทึบ 🔒 ทับ ⇒ ไม่ต้องวาดชั้นแสง/เลื่อม (ผู้ใช้แจ้งหน้านี้กระตุก)
                    staticAura={!card.owned}
                  />
                  {!card.owned && (
                    <span
                      data-collection-locked
                      className="absolute inset-0 flex items-center justify-center bg-black/70 text-xs font-bold text-gray-300"
                    >
                      🔒 {t('collection.locked')}
                    </span>
                  )}
                  {card.owned && card.quantity > 1 && (
                    <span
                      data-collection-qty
                      className="absolute right-1 top-1 rounded-full bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-200"
                    >
                      ×{card.quantity}
                    </span>
                  )}
                  {card.owned && card.isFavorite && (
                    <span className="absolute left-1 top-1 text-sm" aria-label={t('collection.favoriteOn')}>
                      ⭐
                    </span>
                  )}
                </Link>
                <div className="mt-1 flex items-center gap-1 text-[11px]">
                  <span className="truncate text-gray-200" title={card.nameTh ?? card.name}>
                    {card.nameTh ?? card.name}
                  </span>
                  <span data-collection-power={cardPower(card.stats)} className="ml-auto shrink-0 text-gray-400">
                    {cardPower(card.stats)}
                  </span>
                </div>
                {card.owned ? (
                  <div className="mt-1 flex gap-1">
                    <button
                      type="button"
                      data-collection-fav={card.isFavorite ? '1' : '0'}
                      onClick={() => toggleFavorite(card)}
                      className="rounded-lg border border-gray-700 bg-gray-800 px-1.5 py-1 text-[11px] text-amber-200"
                    >
                      {card.isFavorite ? '★' : '☆'}
                    </button>
                    <button
                      type="button"
                      data-collection-quickadd={card.cardId}
                      disabled={busy === card.cardId}
                      onClick={() => addToDeck(card)}
                      className="flex-1 truncate rounded-lg border border-emerald-700 bg-emerald-900/40 px-1.5 py-1 text-[11px] text-emerald-200 disabled:opacity-50"
                    >
                      {t('collection.addToDeck')}
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-gray-500">{t('collection.locked')}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── แบ่งหน้า ── */}
        {pagination.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3 text-sm">
            <button
              type="button"
              data-collection-page="prev"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1 disabled:opacity-40"
            >
              ← ก่อนหน้า
            </button>
            <span data-collection-pageinfo className="text-gray-300">
              {pagination.page}/{pagination.totalPages}
            </span>
            <button
              type="button"
              data-collection-page="next"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1 disabled:opacity-40"
            >
              ถัดไป →
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-[11px] text-gray-500">
          <Link href="/decks" className="underline">
            {t('collection.toDeckBuilder')}
          </Link>
        </p>
      </div>
    </main>
  );
}
