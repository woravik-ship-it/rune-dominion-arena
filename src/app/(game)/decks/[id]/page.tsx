'use client';

import { apiFetch } from '@/lib/api-client';
import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CardFace from '@/components/cards/CardFace';
import DeckRing, { type RingCard } from '@/components/deck/DeckRing';
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

  useEffect(() => { loadAll(); }, [deckId]);

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
      }
      if (cardsData.success) setPool(cardsData.data);
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

  const handleSlotClick = (pos: number) => {
    setErr(null);
    setMsg(null);
    if (placed[pos]) {
      const next = [...placed];
      next[pos] = null;
      setPlaced(next);
      setMsg(`ถอดการ์ดออกจากช่อง${SLOT_ROLE_STYLE[slotRole(pos)].th}แล้ว`);
      return;
    }
    if (!selectedPool) {
      const role = slotRole(pos);
      setErr(
        `แตะการ์ดในคลังก่อน แล้วแตะช่องที่จะวาง · ช่อง ${pos + 1} เป็นช่อง${SLOT_ROLE_STYLE[role].th} (เหมาะกับ ${affinityHint(role)})`
      );
      return;
    }
    if (placedIds.has(selectedPool)) { setErr('การ์ดใบนี้อยู่ในทีมแล้ว'); return; }
    const card = pool.find((p) => p.cardId === selectedPool);
    if (!card) return;
    const next = [...placed];
    next[pos] = { ...card, position: pos };
    setPlaced(next);
    setSelectedPool(null);
    const role = slotRole(pos);
    const bonus = formationReport(next.map((c) => (c ? toFormationCard(c) : null)));
    setMsg(
      `วาง ${card.nameTh || card.name} ในช่อง${SLOT_ROLE_STYLE[role].th} · คะแนนรวม ${bonus.total.toLocaleString('th-TH')}`
    );
  };

  const handleSave = async () => {
    setErr(null); setMsg(null);
    if (filledCount !== 5) { setErr(`ทีมต้องครบ 5 ใบ (ปัจจุบัน ${filledCount} ใบ)`); return; }
    if (overElement) { setErr(`ธาตุ ${overElement[0]} เกิน 3 ใบ`); return; }
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
        return;
      }
      setMsg(
        `บันทึกแล้ว ⚡ คะแนนรวม ${report.total.toLocaleString('th-TH')} (เกรด ${report.grade.key}) · โบนัสช่อง +${(report.bonusScore + report.affinityScore).toLocaleString('th-TH')}`
      );
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
        <button onClick={() => router.push('/decks')} className="text-sm text-gray-400 mb-2">
          ← กลับรายการเด็ค
        </button>
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
          onClick={handleSave}
          disabled={saving || filledCount !== 5}
          className="btn-primary w-full disabled:opacity-50"
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึกเด็ค'}
        </button>
      </div>
    </main>
  );
}
