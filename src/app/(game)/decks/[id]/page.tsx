'use client';

import { apiFetch } from '@/lib/api-client';
import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import CardFace from '@/components/cards/CardFace';
import DeckRing, { type RingCard } from '@/components/deck/DeckRing';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { CardPreviewModal } from '@/components/cards/CardMiniPreview';
import { compareCardStats, compareVerdictLabel, deltaLabel } from '@/lib/deck-compare';
import StatHexagon from '@/components/deck/StatHexagon';
import {
  ROLE_AFFINITY,
  SLOT_ROLE_STYLE,
  formationReport,
  skillPower,
  slotRole,
  type DeckSlotRole,
  type FormationCard,
} from '@/lib/deck-formation';
import { DECK_SIZE } from '@/lib/constants';

interface PoolCard {
  id: string;
  cardId: string;
  name: string;
  nameTh: string | null;
  element: string;
  rarity: string;
  role?: string | null;
  imageUrl?: string | null;
  imageStatus?: string | null;
  stats: { atk: number; def: number; hp: number; spd: number; manaCost: number };
  /** สกิล (Phase 15: ใช้คิดพลังสกิลของช่องสนับสนุน) — /api/cards ส่งมาให้ตั้งแต่รอบนี้ */
  skills?: Array<{ name: string; description: string; manaCost: number }> | null;
}

interface PlacedCard extends PoolCard {
  position: number;
}

/** แปลงการ์ดในคลังเป็นรูปแบนที่สูตรคะแนน (lib) ใช้ได้ตรงๆ */
function toFormationCard(card: PoolCard): FormationCard {
  return {
    cardId: card.cardId,
    name: card.name,
    nameTh: card.nameTh,
    element: card.element,
    rarity: card.rarity,
    role: card.role ?? null,
    atk: card.stats.atk,
    def: card.stats.def,
    hp: card.stats.hp,
    spd: card.stats.spd,
    manaCost: card.stats.manaCost,
    skills: card.skills ?? [],
  };
}

function toRingCard(card: PoolCard): RingCard {
  return { ...toFormationCard(card), imageUrl: card.imageUrl, imageStatus: card.imageStatus };
}

const ROLE_FILTERS: Array<{ key: 'ALL' | DeckSlotRole; label: string }> = [
  { key: 'ALL', label: 'ทั้งหมด' },
  { key: 'ATTACK', label: `⚔️ ${SLOT_ROLE_STYLE.ATTACK.th}` },
  { key: 'DEFENSE', label: `🛡️ ${SLOT_ROLE_STYLE.DEFENSE.th}` },
  { key: 'SUPPORT', label: `✨ ${SLOT_ROLE_STYLE.SUPPORT.th}` },
];

/** การ์ดบทบาทนี้ "เข้าช่อง" บทบาทไหนได้โบนัสตรงบทบาทบ้าง (ใช้ติดป้ายในคลังการ์ด) */
const CARD_ROLE_AFFINITY: Array<{ role: DeckSlotRole; cardRoles: readonly string[] }> = [
  { role: 'ATTACK', cardRoles: ROLE_AFFINITY.ATTACK },
  { role: 'DEFENSE', cardRoles: ROLE_AFFINITY.DEFENSE },
  { role: 'SUPPORT', cardRoles: ROLE_AFFINITY.SUPPORT },
];

function cardRoleHints(cardRole?: string | null): DeckSlotRole[] {
  if (!cardRole) return [];
  return CARD_ROLE_AFFINITY.filter((entry) => entry.cardRoles.includes(cardRole)).map((entry) => entry.role);
}

export default function DeckBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const deckId = params.id as string;
  const searchParams = useSearchParams();

  const [deckName, setDeckName] = useState('');
  const [pool, setPool] = useState<PoolCard[]>([]);
  const [placed, setPlaced] = useState<(PlacedCard | null)[]>([null, null, null, null, null]);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | DeckSlotRole>('ALL');
  // Phase 41: UI แบบ "ฟอง" + กันแก้แล้วลืมบันทึก
  const [sheetPos, setSheetPos] = useState<number | null>(null);
  const [pickPos, setPickPos] = useState<number | null>(null);
  const [viewCard, setViewCard] = useState<PoolCard | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** ลายเซ็นของเด็คที่บันทึกล่าสุด (ใช้เทียบว่ามีการแก้ไขค้างอยู่ไหม) */
  const [savedSig, setSavedSig] = useState('');

  useEffect(() => { loadAll(); }, [deckId]);

  /** ลายเซ็นเด็ค (ชื่อ + การ์ดแต่ละช่อง) — ใช้ตัดสินว่า "มีการแก้ไขค้าง" ไหม */
  const signatureOf = (name: string, cards: (PlacedCard | null)[]) =>
    `${name.trim()}|${cards.map((c) => c?.cardId ?? '-').join(',')}`;
  const currentSig = signatureOf(deckName, placed);
  const dirty = savedSig !== '' && currentSig !== savedSig;

  // รีเฟรช/ปิดแท็บ ต้องเตือนก่อนถ้ายังไม่บันทึก
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [deckRes, cardsRes] = await Promise.all([
        apiFetch(`/api/decks/${deckId}`),
        apiFetch('/api/cards?limit=100'),
      ]);
      const deckData = await deckRes.json();
      const cardsData = await cardsRes.json();
      if (deckData.success) {
        setDeckName(deckData.data.name);
        const arr: (PlacedCard | null)[] = [null, null, null, null, null];
        for (const s of deckData.data.slots) {
          arr[s.position] = { id: s.cardId, cardId: s.cardId, ...s, position: s.position };
        }
        setPlaced(arr);
        setSavedSig(signatureOf(deckData.data.name, arr));
      }
      if (cardsData.success) setPool(cardsData.data);
      // Phase 41: ถ้ามี ?slot=N (กด "เอาออก" มาจากหน้าการ์ด) → เปิดฟองเลือกการ์ดให้ช่องนั้นทันที
      const slotParam = Number(searchParams.get('slot'));
      if (Number.isInteger(slotParam) && slotParam >= 0 && slotParam < 5) setPickPos(slotParam);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Phase 15: สรุปการจัดทีม (โบนัสตามบทบาทช่อง + แกน 6 ด้าน + คะแนนรวม) — คิดสดบนเครื่องทุกครั้งที่การ์ดเข้า/ออก
  const report = useMemo(
    () => formationReport(placed.map((card) => (card ? toFormationCard(card) : null))),
    [placed]
  );
  const teamPower = report.baseScore;
  const elementCount: Record<string, number> = {};
  placed.forEach((c) => { if (c) elementCount[c.element] = (elementCount[c.element] || 0) + 1; });
  const overElement = Object.entries(elementCount).find(([, n]) => n > 3);
  const filledCount = report.filled;
  const placedIds = new Set(placed.filter(Boolean).map((c) => c!.cardId));

  /** ช่องนี้เหมาะกับการ์ดบทบาทอะไร (ใช้ในข้อความช่วยเหลือตอนวางการ์ด) */
  const affinityHint = (role: DeckSlotRole) =>
    ROLE_AFFINITY[role]
      .map((r) => (r === 'WARRIOR' ? 'นักรบ' : r === 'MAGE' ? 'จอมเวท' : r === 'HEALER' ? 'ผู้รักษา' : r === 'TANK' ? 'ผู้พิทักษ์' : r === 'ASSASSIN' ? 'นักฆ่า' : 'ผู้สนับสนุน'))
      .join('/');

  /** วางการ์ดลงช่อง (ใช้ทั้งตอนแตะการ์ดในคลังแล้วแตะช่อง และตอนเลือกจากฟองเปลี่ยนการ์ด) */
  const placeCard = (pos: number, card: PoolCard) => {
    const next = [...placed];
    next[pos] = { ...card, position: pos };
    setPlaced(next);
    setSelectedPool(null);
    setPickPos(null);
    const bonus = formationReport(next.map((c) => (c ? toFormationCard(c) : null)));
    setMsg(`วาง ${card.nameTh || card.name} ในช่อง ${pos + 1} · คะแนนรวม ${bonus.total.toLocaleString('th-TH')}`);
  };

  /** เอาออก (ต้องยืนยันก่อน — ผู้ใช้สั่ง: "การเปลี่ยน Item หรือการขาย ต้องมีหน้า Confirm") */
  const removeCard = (pos: number) => {
    const next = [...placed];
    next[pos] = null;
    setPlaced(next);
    setConfirmRemove(null);
    setSheetPos(null);
    setMsg(`เอาออกช่อง ${pos + 1} แล้ว — อย่าลืมบันทึก`);
  };

  /**
   * แตะช่องในวงแหวน (Phase 41)
   *  - ช่องมีการ์ด → เปิดชีต "ดูการ์ด / เปลี่ยนการ์ด / เอาออก"
   *  - ช่องว่าง → เปิดฟองเลือกการ์ดทันที (ถ้าเลือกการ์ดในคลังไว้ก่อนแล้ว → วางเลย)
   */
  const handleSlotClick = (pos: number) => {
    setErr(null);
    setMsg(null);
    if (placed[pos]) { setSheetPos(pos); return; }
    if (selectedPool) {
      const card = pool.find((c) => c.cardId === selectedPool);
      if (!card) return;
      if (placedIds.has(card.cardId)) { setErr('การ์ดใบนี้อยู่ในทีมแล้ว'); return; }
      placeCard(pos, card);
      return;
    }
    setPickPos(pos);
  };

  /** ออกไปหน้าอื่น — ถ้ามีการแก้ไขค้างให้ถามก่อน (ผู้ใช้สั่ง) */
  const leavePage = (target = '/decks') => {
    if (dirty) { setConfirmLeave(true); return; }
    router.push(target);
  };

  /** บันทึกแล้วออก (ใช้จากกล่องยืนยัน "ยังไม่บันทึก") */
  const saveThenLeave = async () => {
    const ok = await handleSave();
    if (ok) { setConfirmLeave(false); router.push('/decks'); }
  };

  const handleSave = async (): Promise<boolean> => {
    setErr(null); setMsg(null);
    if (filledCount !== 5) { setErr(`ทีมต้องครบ 5 ใบ (ปัจจุบัน ${filledCount} ใบ)`); return false; }
    if (overElement) { setErr(`ธาตุ ${overElement[0]} เกิน 3 ใบ`); return false; }
    setSaving(true);
    try {
      const slots = placed.map((c, position) => ({ cardId: c!.cardId, position }));
      const res = await apiFetch(`/api/decks/${deckId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: deckName, slots }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.details ? data.details.join('\n') : data.error || 'บันทึกไม่สำเร็จ');
        return false;
      }
      setMsg(
        `บันทึกแล้ว ⚡ คะแนนรวม ${report.total.toLocaleString('th-TH')} (เกรด ${report.grade.key}) · โบนัสช่อง +${(report.bonusScore + report.affinityScore).toLocaleString('th-TH')}`
      );
      setSavedSig(currentSig);
      return true;
    } finally { setSaving(false); }
  };

  const filteredPool = pool.filter((c) => {
    if (roleFilter !== 'ALL') {
      const wanted = ROLE_AFFINITY[roleFilter];
      if (!c.role || !wanted.includes(c.role)) return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.nameTh || '').includes(search);
  });

  if (loading) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <p className="text-gray-400">กำลังโหลด...</p>
      </main>
    );
  }


  return (
    <main className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button onClick={() => leavePage()} data-deck-back className="text-sm text-gray-400 hover:text-gray-200">
            ← กลับรายการเด็ค
          </button>
          {dirty && (
            <span data-deck-dirty className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200">
              ● มีการแก้ไขที่ยังไม่บันทึก
            </span>
          )}
        </div>
        <input
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          maxLength={60}
          className="text-2xl font-bold bg-transparent border-b border-gray-700 w-full mb-4 focus:outline-none focus:border-amber-400"
        />
        <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* วงกลมการ์ด 5 ช่อง (โจมตี 2 · ป้องกัน 2 · สนับสนุน 1) — กราฟิกเรียลไทม์ */}
          <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-2">
            <h2 className="mb-1 px-1 text-sm font-bold text-gray-200">
              วงแหวนการจัดทีม (แตะช่องเพื่อวาง/ถอด)
            </h2>
            <p className="mb-1 px-1 text-[11px] leading-tight text-gray-400">
              ⚔️ โจมตี 2 ช่อง (+จาก ATK) · 🛡️ ป้องกัน 2 ช่อง (+จาก DEF) · ✨ สนับสนุน 1 ช่อง (+จากพลังสกิล)
            </p>
            <DeckRing
              slots={placed.map((c) => (c ? toRingCard(c) : null))}
              selectedCardId={selectedPool}
              total={report.total}
              bonusTotal={report.bonusScore + report.affinityScore}
              onSlotClick={handleSlotClick}
            />
          </div>

          {/* กราฟสถานะ 6 เหลี่ยม + คะแนนรวมตรงกลาง */}
          <div className="space-y-3">
            <StatHexagon report={report} />

            {/* สรุปโบนัสรายช่อง — อัปเดตทันทีเมื่อการ์ดเข้า/ออก */}
            <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-3">
              <h3 className="mb-2 text-sm font-bold text-gray-200">โบนัสตามบทบาทช่อง</h3>
              <ul className="space-y-1 text-[11px]">
                {report.slots.map((slot) => {
                  const style = SLOT_ROLE_STYLE[slot.role];
                  return (
                    <li key={slot.position} className="flex items-center justify-between gap-2">
                      <span className="truncate" style={{ color: style.color }}>
                        {style.icon} {slot.position + 1}. {style.th}
                        <span className="text-gray-500">
                          {slot.role === 'ATTACK' ? ' · ATK' : slot.role === 'DEFENSE' ? ' · DEF' : ' · สกิล'}
                        </span>
                      </span>
                      <span className="shrink-0 text-gray-300">
                        {slot.bonus.sourceValue}
                        <span className="text-gray-500"> ×{slot.bonus.rate}</span>
                        {' = '}
                        <span className="font-bold text-amber-300">+{slot.bonus.base}</span>
                        {slot.bonus.affinity > 0 && (
                          <span className="text-emerald-400"> (+{slot.bonus.affinity})</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex justify-between text-xs">
                <span className="text-gray-400">พลังทีม (สเตตัสพื้นฐาน)</span>
                <span className="font-bold text-amber-400">{teamPower.toLocaleString('th-TH')}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-700">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, (report.total / 3500) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                {filledCount}/{DECK_SIZE} ใบ · การ์ดที่วางตรงบทบาทได้โบนัสเพิ่มอีก 10%
              </p>
            </div>
          </div>
        </div>
        {(err || overElement || filledCount !== 5) && (
          <div className="text-sm mb-4 space-y-1">
            {err && <p className="text-red-400 whitespace-pre-line">{err}</p>}
            {overElement && <p className="text-red-400">⚠️ ธาตุ {overElement[0]} เกิน 3 ใบ</p>}
            {filledCount !== 5 && <p className="text-yellow-400">⚠️ วางการ์ดให้ครบ 5 ใบก่อนบันทึก</p>}
          </div>
        )}
        {msg && <p className="text-green-400 text-sm mb-4">{msg}</p>}
        <h2 className="font-bold mb-2">คลังการ์ด (แตะเพื่อเลือก แล้วแตะช่องในวง)</h2>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {ROLE_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setRoleFilter(filter.key)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                roleFilter === filter.key
                  ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                  : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อการ์ด..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-3"
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          {filteredPool.map((c) => {
            const inTeam = placedIds.has(c.cardId);
            const selected = selectedPool === c.cardId;
            return (
              <button
                key={c.cardId}
                disabled={inTeam}
                onClick={() => setSelectedPool(selected ? null : c.cardId)}
                className={`rounded-xl p-2 text-left text-xs border-2 transition-all ${
                  inTeam ? 'opacity-40 border-gray-700 bg-gray-900'
                  : selected ? 'border-amber-400 bg-gray-700'
                  : 'border-gray-700 bg-gray-800'
                }`}
              >
                <div className="relative w-full aspect-[7/10] mb-1 bg-black/40 rounded-lg overflow-hidden">
                  <CardFace
                    cardId={c.cardId}
                    imageUrl={c.imageUrl}
                    imageStatus={c.imageStatus}
                    rarity={c.rarity}
                    alt={c.nameTh || c.name}
                  />
                </div>
                <div className="font-bold truncate">{c.nameTh || c.name}</div>
                <div className="text-gray-400 truncate">{c.name}</div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">{c.element}</span>
                  <span className="text-amber-400">⚡{c.stats.atk + c.stats.def + c.stats.hp + c.stats.spd}</span>
                </div>
                <div className="mt-0.5 flex justify-between text-[10px]">
                  <span className="text-gray-400">{c.role ?? '—'}</span>
                  <span className="text-purple-300">สกิล {skillPower(c.skills ?? [])}</span>
                </div>
                {cardRoleHints(c.role).length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                    {cardRoleHints(c.role).map((role) => (
                      <span key={role} style={{ color: SLOT_ROLE_STYLE[role].color }}>
                        {SLOT_ROLE_STYLE[role].icon} {SLOT_ROLE_STYLE[role].th}
                      </span>
                    ))}
                  </div>
                )}
                {inTeam && <div className="text-green-400 mt-1">อยู่ในทีมแล้ว</div>}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => void handleSave()}
          disabled={saving || filledCount !== 5}
          data-deck-save
          className="btn-primary w-full disabled:opacity-50"
        >
          {saving ? 'กำลังบันทึก...' : dirty ? 'บันทึกเด็ค (มีการแก้ไข)' : 'บันทึกเด็ค'}
        </button>
        {/* ===== ฟอง/ป็อปอัปทั้งหมดของหน้าจัดเด็ค (Phase 41) ===== */}

        {/* ชีตตัวเลือกเมื่อแตะช่องที่มีการ์ดอยู่ */}
        <Modal
          open={sheetPos !== null}
          onClose={() => setSheetPos(null)}
          title={sheetPos !== null && placed[sheetPos] ? `🎴 ${placed[sheetPos]!.nameTh || placed[sheetPos]!.name}` : ''}
          subtitle={sheetPos !== null ? `ช่อง ${sheetPos + 1} · ${SLOT_ROLE_STYLE[slotRole(sheetPos)].th}` : ''}
          size="sm"
        >
          {sheetPos !== null && placed[sheetPos] && (
            <div className="space-y-2">
              <button
                type="button" data-slot-action="view"
                onClick={() => { const card = placed[sheetPos]!; setSheetPos(null); setViewCard(card); }}
                className="w-full rounded-xl bg-white/10 px-3 py-2 text-left text-sm text-gray-100 hover:bg-white/20"
              >
                👁 ดูการ์ด + ใส่/ถอด Item (ไม่ต้องออกจากหน้านี้)
              </button>
              <button
                type="button" data-slot-action="swap"
                onClick={() => { setPickPos(sheetPos); setSheetPos(null); }}
                className="w-full rounded-xl bg-amber-500/20 px-3 py-2 text-left text-sm text-amber-100 hover:bg-amber-500/30"
              >
                🔄 เปลี่ยนการ์ด (เทียบดีขึ้น/แย่ลงให้ก่อน)
              </button>
              <button
                type="button" data-slot-action="remove"
                onClick={() => { setConfirmRemove(sheetPos); setSheetPos(null); }}
                className="w-full rounded-xl bg-red-500/15 px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/25"
              >
                🗑 เอาออกช่องนี้
              </button>
            </div>
          )}
        </Modal>
        {/* ฟองเลือกการ์ด + เทียบสถานะกับการ์ดเดิมในช่อง (ผู้ใช้สั่ง: ต้องบอกว่าดีขึ้นหรือแย่ลง) */}
        <Modal
          open={pickPos !== null}
          onClose={() => setPickPos(null)}
          title={pickPos !== null && placed[pickPos] ? 'เปลี่ยนการ์ดในช่อง' : 'เลือกการ์ดใส่ช่องว่าง'}
          subtitle={pickPos !== null ? `ช่อง ${pickPos + 1} · ${SLOT_ROLE_STYLE[slotRole(pickPos)].th}` : ''}
          size="lg"
        >
          {pickPos !== null && (
            <div className="space-y-2" data-deck-picker={pickPos}>
              {pool.filter((c) => !placedIds.has(c.cardId)).length === 0 && (
                <p className="text-sm text-gray-400">ไม่มีการ์ดอื่นให้เลือก (การ์ดที่เหลืออยู่ในทีมหมดแล้ว)</p>
              )}
              {pool
                .filter((c) => !placedIds.has(c.cardId))
                .map((c) => {
                  const current = placed[pickPos];
                  const cmp = compareCardStats(current ? current.stats : null, c.stats);
                  const verdictColor =
                    cmp.verdict === 'better' ? 'text-emerald-300'
                      : cmp.verdict === 'worse' ? 'text-red-300' : 'text-gray-300';
                  return (
                    <div
                      key={c.cardId}
                      data-picker-card={c.cardId}
                      className="flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-900/70 p-2"
                    >
                      <div className="relative h-[70px] w-[49px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                        <CardFace cardId={c.cardId} imageUrl={c.imageUrl} imageStatus={c.imageStatus} rarity={c.rarity} alt={c.nameTh || c.name} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">{c.nameTh || c.name}</p>
                        <p className="text-[11px] text-gray-400">{c.element} · {c.role ?? '—'}</p>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px]">
                          {cmp.lines.map((line) => (
                            <span
                              key={line.key}
                              className={line.trend === 'up' ? 'text-emerald-300' : line.trend === 'down' ? 'text-red-300' : 'text-gray-500'}
                            >
                              {line.icon} {deltaLabel(line.delta)}
                            </span>
                          ))}
                          <span className={`font-bold ${verdictColor}`} data-picker-verdict={cmp.verdict}>
                            {cmp.verdict === 'better' ? '▲' : cmp.verdict === 'worse' ? '▼' : '＝'} {compareVerdictLabel(cmp.verdict)}
                            <span className="text-gray-500"> ({cmp.scoreDelta >= 0 ? '+' : ''}{cmp.scoreDelta})</span>
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        data-picker-pick={c.cardId}
                        onClick={() => placeCard(pickPos, c)}
                        className="shrink-0 rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-400"
                      >
                        ใช้ใบนี้
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </Modal>
        {/* ฟองดูการ์ดเต็มใบ + ช่างใส่ Item (รวมหน้าดูการ์ดเข้ากับหน้าจัดเด็ค) */}
        <CardPreviewModal
          card={viewCard}
          open={viewCard !== null}
          onClose={() => setViewCard(null)}
          onChanged={() => { void loadAll(); }}
        />

        {/* ยืนยันก่อนเอาออก (ผู้ใช้สั่ง: การเปลี่ยน/ถอด ต้องมีหน้า Confirm) */}
        <ConfirmDialog
          open={confirmRemove !== null}
          danger
          title="เอาการ์ดออกจากทีม?"
          message={confirmRemove !== null && placed[confirmRemove]
            ? `${placed[confirmRemove]!.nameTh || placed[confirmRemove]!.name}`
            : ''}
          confirmLabel="เอาออก"
          onConfirm={() => confirmRemove !== null && removeCard(confirmRemove)}
          onCancel={() => setConfirmRemove(null)}
        />

        {/* เตือนก่อนออกโดยยังไม่บันทึก (ผู้ใช้สั่ง: ต้องถามก่อน) */}
        <ConfirmDialog
          open={confirmLeave}
          title="ยังไม่ได้บันทึกการแก้ไข"
          message="ต้องการบันทึกก่อนออกหรือไม่?"
          confirmLabel="บันทึกแล้วออก"
          cancelLabel="ยกเลิก"
          busy={saving}
          onConfirm={() => void saveThenLeave()}
          onCancel={() => setConfirmLeave(false)}
        >
          <button
            type="button"
            data-deck-leave-anyway
            onClick={() => { setConfirmLeave(false); router.push('/decks'); }}
            className="mt-3 w-full rounded-xl bg-white/10 px-3 py-2 text-xs text-gray-200 hover:bg-white/20"
          >
            ออกโดยไม่บันทึก
          </button>
        </ConfirmDialog>
      </div>
    </main>
  );
}
