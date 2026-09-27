'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CardFace from '@/components/cards/CardFace';
import CardArtStatus from '@/components/cards/CardArtStatus';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { emitVeilShardsChanged } from '@/lib/veil-shard-events';

interface Card {
  id: string;
  cardId: string;
  name: string;
  nameTh: string;
  element: string;
  rarity: string;
  role: string;
  stats: {
    atk: number;
    def: number;
    hp: number;
    spd: number;
    manaCost: number;
  };
  imageUrl: string | null;
  imageStatus: string;
  /** จำนวนใบที่ถือครอง — ค้นพบซ้ำจะได้อีกใบ */
  quantity: number;
  obtainedAt: string;
  obtainedMethod: string;
  isFavorite?: boolean;
}

const ELEMENTS = [
  { value: 'EMBERBOUND', label: 'เพลิง', color: 'from-red-500 to-orange-500' },
  { value: 'TIDEBORN', label: 'น้ำ', color: 'from-blue-500 to-cyan-500' },
  { value: 'SKYRIVEN', label: 'ลม', color: 'from-teal-400 to-green-400' },
  { value: 'ROOTFORGED', label: 'ดิน', color: 'from-yellow-600 to-amber-700' },
  { value: 'DAWNSWORN', label: 'แสง', color: 'from-yellow-300 to-amber-400' },
  { value: 'VEILMARKED', label: 'เงา', color: 'from-purple-600 to-indigo-800' },
];

const RARITIES = [
  { value: 'COMMON', label: 'ทั่วไป', border: 'border-gray-400' },
  { value: 'UNCOMMON', label: 'ไม่ธรรมดา', border: 'border-green-400' },
  { value: 'RARE', label: 'หายาก', border: 'border-blue-400' },
  { value: 'EPIC', label: 'ตำนาน', border: 'border-purple-400' },
  { value: 'LEGENDARY', label: 'ตำนานเลือง', border: 'border-orange-400' },
  { value: 'MYTHIC', label: 'สร้างสรรค์', border: 'border-red-400' },
];

export default function CardsPage() {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [elementFilter, setElementFilter] = useState('');
  const [rarityFilter, setRarityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Phase 41: เลือกหลายใบ + การ์ดที่อยู่ในทีม (ผู้ใช้สั่ง)
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** cardId → รายชื่อทีมที่การ์ดใบนี้อยู่ (พร้อมช่อง) */
  const [teamOf, setTeamOf] = useState<Record<string, Array<{ deckId: string; deckName: string; position: number }>>>({});
  const [confirmSell, setConfirmSell] = useState(false);
  const [confirmTeamRemove, setConfirmTeamRemove] = useState<{ deckId: string; deckName: string; cardId: string; nameTh: string; position: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    loadCards();
    void loadTeams();
  }, [page, elementFilter, rarityFilter]);

  /** โหลดว่าการ์ดแต่ละใบอยู่ในทีมไหน (ใช้ติดป้าย + เอาออกได้จากหน้านี้) */
  const loadTeams = async () => {
    try {
      const res = await apiFetch('/api/decks');
      const json = await res.json().catch(() => null);
      if (!json?.success) return;
      const map: Record<string, Array<{ deckId: string; deckName: string; position: number }>> = {};
      for (const deck of json.data ?? []) {
        for (const slot of deck.slots ?? []) {
          const key = slot.cardId ?? slot.card?.cardId;
          if (!key) continue;
          (map[key] ??= []).push({ deckId: deck.id, deckName: deck.name, position: slot.position });
        }
      }
      setTeamOf(map);
    } catch { /* ไม่มีเด็ค = ไม่มีป้าย */ }
  };

  const toggleSelected = (cardId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId); else next.add(cardId);
      return next;
    });
  };

  /** ขายการ์ดที่เลือกทั้งหมด (มีหน้า Confirm) — ขายทีละใบตาม API เดิม */
  const sellSelected = async () => {
    setBusy(true); setErrMsg(''); setNotice('');
    try {
      let totalShards = 0;
      let sold = 0;
      for (const cardId of selected) {
        const res = await apiFetch(`/api/cards/${cardId}/sell`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantity: 1 }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) { setErrMsg(json?.error ?? 'ขายไม่สำเร็จบางใบ'); continue; }
        totalShards += Number(json.data?.gained ?? 0);
        sold += 1;
      }
      setConfirmSell(false);
      setSelected(new Set());
      setNotice(`ขายแล้ว ${sold} ใบ — ได้ 💠 ${totalShards} Veil Shards`);
      emitVeilShardsChanged(Number.NaN); // ให้หัวเว็บดึงยอดใหม่
      await loadCards();
      await loadTeams();
    } finally { setBusy(false); }
  };

  /**
   * เอาออก/เปลี่ยนการ์ดจากทีม (Phase 41)
   * หมายเหตุสำคัญ: API บังคับว่าเด็คต้องครบ 5 ช่อง (0-4) เสมอ ⇒ "ถอดทิ้งเฉย ๆ" ไม่ได้
   *   (จะทำให้ทีมสู้ไม่ได้) จึงพาไปหน้าเด็คที่ "เปิดฟองเลือกการ์ดให้ช่องนั้น" พร้อมเทียบดีขึ้น/แย่ลงทันที
   */
  const goChangeInDeck = () => {
    if (!confirmTeamRemove) return;
    const { deckId, position } = confirmTeamRemove;
    setConfirmTeamRemove(null);
    router.push(`/decks/${deckId}?slot=${position}`);
  };

  const loadCards = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '12',
      });
      if (elementFilter) params.set('element', elementFilter);
      if (rarityFilter) params.set('rarity', rarityFilter);
      if (search) params.set('search', search);

      const response = await apiFetch(`/api/cards?${params}`);
      const data = await response.json();

      if (data.success) {
        setCards(data.data);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (error) {
      console.error('Failed to load cards:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadCards();
  };

  const getElementColor = (element: string) => {
    return ELEMENTS.find(e => e.value === element)?.color || 'from-gray-500 to-gray-600';
  };

  const getRarityBorder = (rarity: string) => {
    return RARITIES.find(r => r.value === rarity)?.border || 'border-gray-400';
  };

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">คอลเลกชันการ์ด</h1>
        <p className="text-center text-gray-400 mb-6">การ์ดที่คุณสะสมได้</p>

        {/* Phase 41: เลือกหลายใบ (กดขายพร้อมกันได้) */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-cards-select-toggle
            onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
            className={`rounded-full border px-3 py-1 text-xs ${selectMode ? 'border-amber-400 bg-amber-400/20 text-amber-200' : 'border-gray-700 bg-gray-800 text-gray-300'}`}
          >
            {selectMode ? '✔ กำลังเลือกหลายใบ (ปิด)' : '☑ เลือกหลายใบเพื่อขายพร้อมกัน'}
          </button>
          {selectMode && <span className="text-xs text-gray-400">เลือกแล้ว {selected.size} ใบ</span>}
        </div>
        {notice && <p data-cards-notice className="mb-3 rounded-lg bg-emerald-500/10 p-2 text-sm text-emerald-300">{notice}</p>}
        {errMsg && <p className="mb-3 rounded-lg bg-red-500/10 p-2 text-sm text-red-300">{errMsg}</p>}

        {/* Search & Filters */}
        <div className="mb-6 space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              placeholder="ค้นหาการ์ด..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
            />
            <button type="submit" className="btn-primary px-6">
              🔍
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            <select
              value={elementFilter}
              onChange={(e) => { setElementFilter(e.target.value); setPage(1); }}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
            >
              <option value="">ทุกธาตุ</option>
              {ELEMENTS.map(el => (
                <option key={el.value} value={el.value}>{el.label}</option>
              ))}
            </select>

            <select
              value={rarityFilter}
              onChange={(e) => { setRarityFilter(e.target.value); setPage(1); }}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
            >
              <option value="">ทุกความหายาก</option>
              {RARITIES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Cards Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin text-4xl">⏳</div>
            <p className="text-gray-400 mt-2">กำลังโหลด...</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">ยังไม่มีการ์ด ไปค้นหารูนกัน!</p>
            <Link href="/discover" className="btn-primary mt-4 inline-block">
              ค้นหารูน
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {cards.map((userCard) => (
                <Link
                  key={userCard.id}
                  href={`/cards/${userCard.cardId}`}
                  onClick={(event) => {
                    if (!selectMode) return;
                    event.preventDefault();
                    toggleSelected(userCard.cardId);
                  }}
                  className={`bg-gray-800 rounded-lg border-2 ${getRarityBorder(userCard.rarity)} transition-transform hover:scale-105 ${
                    selectMode && selected.has(userCard.cardId) ? 'ring-2 ring-amber-400' : ''
                  }`}
                >
                  {/* การ์ด: ภาพ AI (ถ้ามี) + กรอบ/ข้อความ */}
                  <div className={`relative aspect-[7/10] bg-gradient-to-br ${getElementColor(userCard.element)}`}>
                    <CardFace
                      cardId={userCard.cardId}
                      imageUrl={userCard.imageUrl}
                      imageStatus={userCard.imageStatus}
                      rarity={userCard.rarity}
                      alt={userCard.nameTh || userCard.name}
                    />
                    {/* จำนวนใบที่ถือครอง — ค้นพบซ้ำจะได้อีกใบ */}
                    {userCard.quantity > 1 && (
                      <span className="absolute top-1 left-1 px-2 py-0.5 rounded-full bg-black/70 text-amber-300 text-xs font-bold">
                        ×{userCard.quantity}
                      </span>
                    )}
                    {userCard.isFavorite && (
                      <span className="absolute top-1 right-1 text-sm">⭐</span>
                    )}
                    {selectMode && (
                      <span
                        data-card-select={userCard.cardId}
                        className={`absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md border-2 text-xs font-bold ${
                          selected.has(userCard.cardId)
                            ? 'border-amber-300 bg-amber-400 text-black'
                            : 'border-white/60 bg-black/50 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                    )}
                  </div>

                  {/* Phase 41: ป้ายว่าอยู่ในทีมไหน + เอาออกได้จากจุดนี้ (ผู้ใช้สั่ง) */}
                  {(teamOf[userCard.cardId] ?? []).length > 0 && !selectMode && (
                    <div className="mt-2 flex flex-wrap items-center gap-1 px-3 text-[11px]">
                      {(teamOf[userCard.cardId] ?? []).map((team) => (
                        <span
                          key={`${team.deckId}-${team.position}`}
                          data-card-in-team={team.deckId}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-200"
                        >
                          🛡 {team.deckName} ช่อง {team.position + 1}
                          <button
                            type="button"
                            data-card-team-remove={`${team.deckId}:${userCard.cardId}`}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setConfirmTeamRemove({
                                deckId: team.deckId, deckName: team.deckName,
                                cardId: userCard.cardId, nameTh: userCard.nameTh, position: team.position,
                              });
                            }}
                            className="rounded bg-white/10 px-1 hover:bg-white/20"
                            title="เอาออกทีมนี้"
                          >
                            เอาออก
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Card Info */}
                  <div className="p-3">
                    <h3 className="font-bold text-sm truncate">{userCard.nameTh}</h3>
                    <p className="text-xs text-gray-400 truncate">{userCard.name}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-amber-400">⚡ {userCard.stats.manaCost}</span>
                      <span className="text-xs text-gray-500">{userCard.rarity}</span>
                    </div>
                    {/* สถานะการสร้างภาพ + เวลาที่ต้องรอ (Phase 20) */}
                    {!userCard.imageUrl && <CardArtStatus cardId={userCard.cardId} compact />}
                  </div>
                </Link>
              ))}
            </div>

            {/* แถบขายที่เลือก (โหมดหลายใบ) */}
            {selectMode && selected.size > 0 && (
              <div className="fixed inset-x-0 bottom-16 z-40 mx-auto flex max-w-md items-center justify-between gap-2 rounded-2xl border border-white/10 bg-gray-900/95 px-3 py-2 shadow-2xl backdrop-blur">
                <span className="text-xs text-gray-300">เลือก {selected.size} ใบ</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-gray-100 hover:bg-white/20"
                  >
                    ล้างที่เลือก
                  </button>
                  <button
                    type="button"
                    data-cards-sell-selected
                    onClick={() => setConfirmSell(true)}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500"
                  >
                    💠 ขายที่เลือก
                  </button>
                </div>
              </div>
            )}

            {/* ยืนยันขายหลายใบ (ผู้ใช้สั่ง: การขายต้องมีหน้า Confirm) */}
            <ConfirmDialog
              open={confirmSell}
              danger
              busy={busy}
              title={`ขายการ์ด ${selected.size} ใบ?`}
              message="ได้ Veil Shards ตามความหายากของแต่ละใบ — ขายแล้วนำกลับคืนไม่ได้"
              confirmLabel="ยืนยันขาย"
              onConfirm={() => void sellSelected()}
              onCancel={() => setConfirmSell(false)}
            />

            {/* ยืนยันเอาออกจากทีม */}
            <ConfirmDialog
              open={confirmTeamRemove !== null}
              danger
              busy={busy}
              title="เอาออกจากทีมนี้?"
              message={confirmTeamRemove
                ? `${confirmTeamRemove.nameTh}\nจะถูกถอดออกจากทีม "${confirmTeamRemove.deckName}" ช่อง ${confirmTeamRemove.position + 1}\nแล้วพาไปเลือกการ์ดใบใหม่แทนทันที (ทีมต้องครบ 5 ใบถึงจะสู้ได้)`
                : ''}
              confirmLabel="ไปเปลี่ยนการ์ด"
              onConfirm={goChangeInDeck}
              onCancel={() => setConfirmTeamRemove(null)}
            />

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary px-4 py-2 disabled:opacity-50"
                >
                  ← ก่อนหน้า
                </button>
                <span className="px-4 py-2 text-gray-400">
                  หน้า {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-secondary px-4 py-2 disabled:opacity-50"
                >
                  ถัดไป →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
