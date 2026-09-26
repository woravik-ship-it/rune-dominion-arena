'use client';

import { useEffect, useState } from 'react';
import CardFace from '@/components/cards/CardFace';
import { normalizeLimit, pageWindow, type PagerLimits } from '@/lib/pagination';

const CARD_PAGER: PagerLimits = { defaultLimit: 50, maxLimit: 100 };
/** เพดานการกด "โหลดทั้งหมด" (กันดึงไม่จบเมื่อข้อมูลเยอะผิดปกติ) */
const MAX_AUTO_PAGES = 50;

interface AdminCard {
  id: string;
  name: string;
  nameTh: string | null;
  element: string;
  rarity: string;
  role: string;
  imageUrl: string | null;
  imageStatus: string | null;
  discoveryCount: number;
  ownerCount: number;
}

/** ป้ายสถานะภาพการ์ด (ให้แอดมินเห็นว่าอยู่ขั้นไหน) */
function ImageStatusBadge({ status }: { status?: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    READY: { label: 'มีภาพแล้ว', cls: 'text-green-400' },
    PROCESSING: { label: 'กำลังสร้าง…', cls: 'text-amber-300' },
    PENDING: { label: 'รอคิวสร้าง', cls: 'text-amber-300' },
    FAILED: { label: 'สร้างไม่สำเร็จ', cls: 'text-red-400' },
  };
  const info = map[status ?? ''] ?? { label: status ?? 'ไม่ทราบสถานะ', cls: 'text-gray-400' };
  return <span className={info.cls}>{info.label}</span>;
}

export default function AdminCardsPage() {
  const [cards, setCards] = useState<AdminCard[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  /** Phase 27: ข้อมูลแบ่งหน้า — เดิมขอครั้งเดียว limit=50 จึงเห็นการ์ดไม่ครบทุกใบ */
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(CARD_PAGER.defaultLimit);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: CARD_PAGER.defaultLimit,
    total: 0,
    totalPages: 1,
    from: 0,
    to: 0,
  });
  const [loadingAll, setLoadingAll] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<AdminCard | null>(null);
  const [editForm, setEditForm] = useState({ nameTh: '', loreTh: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<AdminCard | null>(null);

  /** สั่งสร้างภาพการ์ดใบนี้ใหม่ → สถานะเป็น "กำลังสร้าง" จนภาพใหม่พร้อม (CardFace poll เอง) */
  const regenerate = async (card: AdminCard) => {
    setRegeneratingId(card.id);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cards/${card.id}/regenerate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'สั่งสร้างภาพไม่สำเร็จ');
        return;
      }
      setMsg(data.data?.message ?? 'สั่งสร้างภาพใหม่แล้ว');
      setCards((prev) => prev.map((item) => (item.id === card.id ? { ...item, imageStatus: 'PROCESSING' } : item)));
    } catch {
      setError('สั่งสร้างภาพไม่สำเร็จ');
    } finally {
      setRegeneratingId(null);
    }
  };

  const load = async (q = '', nextPage = 1, nextLimit = limit) => {
    setLoading(true);
    setShowAll(false);
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(nextLimit) });
      if (q) params.set('search', q);
      const res = await fetch(`/api/admin/cards?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setCards(data.data);
        if (data.pagination) setPagination(data.pagination);
        setPage(data.pagination?.page ?? nextPage);
      } else {
        setError(data.error);
      }
    } catch {
      setError('โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  /**
   * โหลดทุกหน้าให้ครบในการกดครั้งเดียว (Phase 27) — 167 ใบเดิมเห็นแค่ 50
   * ใช้ limit สูงสุดที่ API รับได้ แล้ววนหน้าถัดไปจนครบ (เพดาน MAX_AUTO_PAGES)
   */
  const loadAll = async (q = '') => {
    setLoadingAll(true);
    setError(null);
    try {
      const perPage = CARD_PAGER.maxLimit;
      const collected: AdminCard[] = [];
      let currentPage = 1;
      let totalPages = 1;
      let total = 0;
      do {
        const params = new URLSearchParams({ page: String(currentPage), limit: String(perPage) });
        if (q) params.set('search', q);
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch(`/api/admin/cards?${params.toString()}`);
        // eslint-disable-next-line no-await-in-loop
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error || 'โหลดทั้งหมดไม่สำเร็จ');
          return;
        }
        collected.push(...(data.data as AdminCard[]));
        totalPages = data.pagination?.totalPages ?? 1;
        total = data.pagination?.total ?? collected.length;
        currentPage += 1;
      } while (currentPage <= totalPages && currentPage <= MAX_AUTO_PAGES);

      setCards(collected);
      setShowAll(true);
      setPage(1);
      setPagination({
        page: 1,
        limit: perPage,
        total,
        totalPages,
        from: collected.length ? 1 : 0,
        to: collected.length,
      });
      setMsg(`โหลดครบทุกใบแล้ว (${collected.length}/${total})`);
    } catch {
      setError('โหลดทั้งหมดไม่สำเร็จ');
    } finally {
      setLoadingAll(false);
    }
  };

  useEffect(() => { void load('', 1, CARD_PAGER.defaultLimit); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  const openEdit = async (card: AdminCard) => {
    setEditing(card);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cards/${card.id}`);
      const data = await res.json();
      if (data.success) {
        const full = data.data;
        setEditForm({ nameTh: full.nameTh || '', loreTh: full.loreTh || '' });
      }
    } catch {
      setError('โหลดรายละเอียดไม่สำเร็จ');
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cards/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'บันทึกไม่สำเร็จ'); return; }
      setMsg(`✅ บันทึกการ์ด "${data.data.name}" แล้ว`);
      setEditing(null);
      await load(search, page);
    } catch {
      setError('บันทึกไม่สำเร็จ');
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(search, 1)}
          placeholder="ค้นหาชื่อการ์ด..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
        />
        <button onClick={() => load(search, 1)} className="btn-primary text-sm">ค้นหา</button>
      </div>

      {/* Phase 27: แถบแบ่งหน้า — บอกว่ามีทั้งหมดกี่ใบ และโหลดให้ครบได้ในคลิกเดียว */}
      <div
        data-admin-cards-pager
        className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2 text-xs text-gray-300"
      >
        <span data-admin-cards-total>
          ทั้งหมด <b className="text-white">{pagination.total}</b> ใบ
          {showAll
            ? ` · แสดงครบทั้ง ${cards.length} ใบ`
            : ` · กำลังแสดง ${pagination.from}–${pagination.to} · หน้า ${pagination.page}/${pagination.totalPages}`}
        </span>

        <label className="ml-auto flex items-center gap-1">
          ต่อหน้า
          <select
            data-admin-cards-limit
            value={limit}
            onChange={(e) => {
              const next = normalizeLimit(e.target.value, CARD_PAGER);
              setLimit(next);
              void load(search, 1, next);
            }}
            className="rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white"
          >
            {[20, 50, 100].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          data-admin-cards-load-all
          onClick={() => void loadAll(search)}
          disabled={loadingAll}
          className="btn-secondary px-3 py-1 text-xs disabled:opacity-50"
        >
          {loadingAll ? 'กำลังโหลด…' : `📥 โหลดทั้งหมด (${pagination.total})`}
        </button>

        {!showAll && pagination.totalPages > 1 && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              data-admin-cards-prev
              onClick={() => void load(search, Math.max(1, pagination.page - 1))}
              disabled={pagination.page <= 1}
              className="rounded bg-white/10 px-2 py-1 disabled:opacity-40"
            >
              ◀ ก่อนหน้า
            </button>
            {pageWindow(pagination.page, pagination.totalPages).map((p) => (
              <button
                key={p}
                type="button"
                data-admin-cards-page={p}
                onClick={() => void load(search, p)}
                className={`rounded px-2 py-1 ${
                  p === pagination.page ? 'bg-amber-500 text-black' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              data-admin-cards-next
              onClick={() => void load(search, Math.min(pagination.totalPages, pagination.page + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="rounded bg-white/10 px-2 py-1 disabled:opacity-40"
            >
              ถัดไป ▶
            </button>
          </span>
        )}
      </div>

      {msg && <p className="text-green-400 text-sm mb-2">{msg}</p>}
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      {loading ? (
        <p className="text-gray-400">กำลังโหลด...</p>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-700 text-gray-300">
              <tr>
                <th className="p-2 text-left">รูป</th>
                <th className="p-2 text-left">การ์ด</th>
                <th className="p-2 text-left">ธาตุ/ความหายาก</th>
                <th className="p-2 text-right">ครั้งที่ค้นพบ</th>
                <th className="p-2 text-right">เจ้าของ</th>
                <th className="p-2 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} data-admin-card={c.id} className="border-t border-gray-700 text-gray-200">
                  <td className="p-2">
                    {/* การ์ดย่อ: กดเพื่อดูรูปใหญ่ (เหมือนหน้าดูการ์ดปกติ) */}
                    <button
                      type="button"
                      onClick={() => setViewing(c)}
                      title="กดเพื่อดูรูปใหญ่"
                      className="relative block w-20 aspect-[7/10] rounded bg-black/40 overflow-hidden ring-1 ring-transparent hover:ring-amber-400 transition"
                    >
                      <CardFace
                        cardId={c.id}
                        imageUrl={c.imageUrl}
                        imageStatus={c.imageStatus}
                        rarity={c.rarity}
                        alt={c.nameTh || c.name}
                      />
                    </button>
                    <div className="mt-1 text-[10px]">
                      <ImageStatusBadge status={c.imageStatus} />
                      <span className="text-gray-500"> · 🔍 ดูรูปใหญ่</span>
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="font-bold">{c.nameTh || c.name}</div>
                    <div className="text-xs text-gray-500">{c.name}</div>
                  </td>
                  <td className="p-2 text-xs">
                    <div>{c.element}</div>
                    <div className="text-amber-400">{c.rarity}</div>
                  </td>
                  <td className="p-2 text-right">{c.discoveryCount}</td>
                  <td className="p-2 text-right">{c.ownerCount}</td>
                  <td className="p-2 text-center space-y-1">
                    <button onClick={() => openEdit(c)} className="btn-secondary text-xs px-3 py-1">แก้ไข</button>
                    <button
                      onClick={() => regenerate(c)}
                      disabled={regeneratingId === c.id}
                      className="btn-primary text-xs px-3 py-1 disabled:opacity-50"
                    >
                      {regeneratingId === c.id ? 'กำลังสั่ง…' : '🔄 สร้างรูปใหม่'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-600">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">แก้ไขการ์ด: {editing.name}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <label className="block text-xs text-gray-400 mb-1">ชื่อไทย</label>
            <input
              value={editForm.nameTh}
              onChange={(e) => setEditForm({ ...editForm, nameTh: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white mb-3"
            />
            <label className="block text-xs text-gray-400 mb-1">เรื่องเล่า (ไทย)</label>
            <textarea
              value={editForm.loreTh}
              onChange={(e) => setEditForm({ ...editForm, loreTh: e.target.value })}
              rows={4}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white mb-4"
            />
            <div className="flex gap-2">
              <button onClick={handleSave} className="btn-primary flex-1 text-sm">บันทึก</button>
              <button onClick={() => setEditing(null)} className="btn-secondary text-sm px-4">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
      {/* Large card view — ดูรูปใหญ่เหมือนหน้าดูการ์ดปกติ */}
      {viewing && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
          onClick={() => setViewing(null)}
        >
          <div
            className="bg-gray-800 rounded-2xl p-4 max-w-md w-full border border-gray-600"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold">
                {viewing.nameTh || viewing.name}
                <span className="text-xs text-gray-400 ml-2">{viewing.rarity} · {viewing.element} · {viewing.role}</span>
              </h3>
              <button onClick={() => setViewing(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="relative mx-auto w-full max-w-[330px] aspect-[7/10]">
              <CardFace
                cardId={viewing.id}
                imageUrl={viewing.imageUrl}
                imageStatus={viewing.imageStatus}
                rarity={viewing.rarity}
                alt={viewing.nameTh || viewing.name}
              />
            </div>

            <div className="mt-3 text-xs text-gray-400 text-center space-y-1">
              <div>{viewing.name}</div>
              <div>
                <ImageStatusBadge status={viewing.imageStatus} />
                {' · '}เจ้าของ {viewing.ownerCount} คน · ถูกค้นพบ {viewing.discoveryCount} ครั้ง
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={async () => {
                  await regenerate(viewing);
                  setViewing({ ...viewing, imageStatus: 'PROCESSING' });
                }}
                disabled={regeneratingId === viewing.id}
                className="btn-primary flex-1 text-sm disabled:opacity-50"
              >
                {regeneratingId === viewing.id ? 'กำลังสั่ง…' : '🔄 สร้างรูปใหม่'}
              </button>
              <button onClick={() => setViewing(null)} className="btn-secondary text-sm px-4">ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
