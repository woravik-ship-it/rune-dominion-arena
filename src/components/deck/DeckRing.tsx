'use client';

import CardFace from '@/components/cards/CardFace';
import { useSmoothNumbers } from '@/components/deck/useSmoothNumbers';
import {
  DECK_SLOT_COUNT,
  SLOT_ROLE_STYLE,
  formationGrade,
  polygonPointsAttr,
  ringLayout,
  roleBonus,
  type FormationCard,
} from '@/lib/deck-formation';

/** การ์ดที่แสดงบนวงกลม — สเตตัสแบบแบน (ไม่ซ้อนใน stats) เพื่อใช้สูตรคะแนนชุดเดียวกับ lib */
export interface RingCard extends FormationCard {
  imageUrl?: string | null;
  imageStatus?: string | null;
}

interface DeckRingProps {
  /** อาเรย์ความยาว 5 (index = position) — ช่องว่างใส่ null */
  slots: Array<RingCard | null>;
  /** การ์ดที่เลือกจากคลัง (ถ้ามี จะไฮไลต์ช่องว่างให้เห็นว่าวางได้) */
  selectedCardId?: string | null;
  /** คะแนนรวมทั้งทีม (แสดงกลางวง) */
  total: number;
  /** โบนัสจากช่องทั้งหมด (แสดงใต้คะแนนรวม) */
  bonusTotal: number;
  onSlotClick: (position: number) => void;
}

/**
 * การ์ด 5 ใบเรียงเป็น **วงกลม** ตามคำสั่งผู้ใช้ — โจมตี 2 · ป้องกัน 2 · สนับสนุน 1
 *
 * ทำไมเป็นวงรีไม่ใช่วงกลมเป๊ะ: การ์ดเกมมีสัดส่วน 7:10 (สูงกว่ากว้าง) ถ้าใช้วงกลมจริง
 * การ์ดใบล่างสุด/บนสุดจะล้นออกนอกกล่อง → ใช้รัศมีแกน X 34% แกน Y 24% ของกล่อง
 * ทำให้การ์ดพอดีกล่อง และตายังอ่านเป็น "วงกลมของการ์ด" เหมือนเดิม
 *
 * Graphics เรียลไทม์: ตอนการ์ดเข้า/ออก (1) การ์ดใบนั้นเล่นอนิเมชัน `deckSlotIn`
 * (2) เส้นเชื่อมระหว่างช่อง morph ด้วย rAF (ช่องว่างยุบเข้าศูนย์กลาง)
 * (3) จุดเรืองและคะแนนกลางวงเต้น · ทั้งหมดเป็น CSS transform/opacity + rAF → ไม่กระตุกบนมือถือ
 */
export default function DeckRing({
  slots,
  selectedCardId,
  total,
  bonusTotal,
  onSlotClick,
}: DeckRingProps) {
  // ขนาดวง (ปรับ 2026-09-25 รอบ 3 หลังดูภาพจริงบนจอ 1280px: chord ระหว่างช่องติดกัน
  // ~235px แต่การ์ดกว้างแค่ 88px กลับ "ซ้อน" — สาเหตุคือป้ายชื่อ+โบนัสใต้การ์ดล้นออกนอก
  // ช่อง ทำให้การ์ดดูเบียดกัน) — ขยายวง + เพิ่มที่ว่างแนวตั้ง + ดึงป้ายให้ชิดการ์ด
  const RX = 40; // รัศมีแกน X (% ของกล่อง)
  const RY = 40; // รัศมีแกน Y (% ของกล่อง)
  const CARD_W = 19; // ความกว้างช่อง (% ของกล่อง)
  const nodes = ringLayout(1);

  // พิกัดช่องในหน่วย viewBox 0–100 (ช่องว่างถูกดึงเข้าศูนย์กลาง → เส้นเชื่อมยุบตัวนุ่มนวล)
  const targets: number[] = [];
  nodes.forEach((node, position) => {
    const filled = Boolean(slots[position]);
    targets.push(filled ? 50 + node.point.x * RX : 50, filled ? 50 + node.point.y * RY : 50);
  });
  const smooth = useSmoothNumbers(targets, 480);

  const polygonPoints = polygonPointsAttr(
    Array.from({ length: DECK_SLOT_COUNT }, (_, i) => ({
      x: smooth[i * 2] ?? 50,
      y: smooth[i * 2 + 1] ?? 50,
    }))
  );

  const filledCount = slots.filter(Boolean).length;
  const grade = formationGrade(total, filledCount);

  return (
    <div
      className="relative w-full max-w-[440px] mx-auto aspect-[5/6] select-none"
      data-ring-rx={RX}
      data-ring-ry={RY}
    >
      {/* ── ชั้นกราฟิกวงแหวน (SVG) ─────────────────────────────────────────── */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <radialGradient id="deckRingCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1f2937" stopOpacity="0.85" />
            <stop offset="70%" stopColor="#0b1020" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#0b1020" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="deckRingLink" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
          <filter id="deckRingGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* แสงเรืองรองรับการ์ดที่ล้อมเป็นวง */}
        <circle cx="50" cy="50" r="46" fill="url(#deckRingCore)" opacity="0.75" />

        {/* วงแหวนประดับด้านนอก (หมุนช้าๆ) */}
        <g className="deck-ring__spin" style={{ transformOrigin: '50px 50px' }}>
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="#f59e0b"
            strokeOpacity="0.22"
            strokeWidth="0.5"
            strokeDasharray="2 6"
          />
        </g>

        {/* รางวงการ์ด (วงรี) + แสงพลังงานไหลวน */}
        <ellipse cx="50" cy="50" rx={RX} ry={RY} fill="none" stroke="#94a3b8" strokeOpacity="0.22" strokeWidth="0.5" />
        <ellipse
          className="deck-ring__flow"
          cx="50"
          cy="50"
          rx={RX}
          ry={RY}
          fill="none"
          stroke="#fbbf24"
          strokeOpacity="0.75"
          strokeWidth="0.9"
          strokeDasharray="16 84"
          filter="url(#deckRingGlow)"
        />

        {/* เส้นเชื่อมช่องที่วางการ์ดแล้ว (morph เรียลไทม์) */}
        <polygon
          className="deck-ring__link"
          data-ring-link="true"
          points={polygonPoints}
          fill="url(#deckRingLink)"
          fillOpacity={filledCount >= 3 ? 0.08 : 0}
          stroke="url(#deckRingLink)"
          strokeOpacity={filledCount >= 2 ? 0.75 : 0.25}
          strokeWidth="0.6"
          strokeLinejoin="round"
          filter="url(#deckRingGlow)"
        />

        {/* จุดยอดของแต่ละช่อง (สีตามบทบาท · เรืองเมื่อมีการ์ด) */}
        {nodes.map((node) => {
          const card = slots[node.position];
          const style = SLOT_ROLE_STYLE[node.role];
          return (
            <circle
              key={node.position}
              cx={50 + node.point.x * RX}
              cy={50 + node.point.y * RY}
              r={card ? 1.6 : 1.1}
              fill={card ? style.color : '#0b1020'}
              stroke={style.color}
              strokeOpacity={card ? 0.95 : 0.45}
              strokeWidth="0.45"
              filter={card ? 'url(#deckRingGlow)' : undefined}
            />
          );
        })}
      </svg>

      {/* ── ช่องการ์ดทั้ง 5 (วางทับตำแหน่งบนวง) ─────────────────────────────── */}
      {nodes.map((node) => {
        const card = slots[node.position];
        const style = SLOT_ROLE_STYLE[node.role];
        const bonus = roleBonus(node.role, card);
        const canPlace = !card && Boolean(selectedCardId);
        const left = 50 + node.point.x * RX;
        const top = 50 + node.point.y * RY;
        const slotKey = card ? `${node.position}-${card.cardId}` : `${node.position}-empty`;

        return (
          <button
            key={slotKey}
            type="button"
            onClick={() => onSlotClick(node.position)}
            title={`ช่อง ${node.position + 1} · ${style.th} — ${style.bonusSourceTh}`}
            aria-label={
              card
                ? `ช่อง ${node.position + 1} ${style.th} มีการ์ด ${card.nameTh || card.name} แตะเพื่อถอดออก`
                : `ช่อง ${node.position + 1} ${style.th} ว่าง แตะเพื่อวางการ์ด`
            }
            style={{ left: `${left}%`, top: `${top}%`, width: `${CARD_W}%` }}
            className="deck-slot absolute -translate-x-1/2 -translate-y-1/2 text-left transition-transform active:scale-95"
            data-slot-position={node.position}
            data-slot-role={node.role}
            data-slot-filled={card ? 'true' : 'false'}
            data-slot-bonus={card ? bonus.total : 0}
          >
            <span
              className="deck-slot__card relative block w-full aspect-[7/10] overflow-hidden rounded-lg border-2 bg-black/50"
              style={{
                borderColor: card ? style.color : 'rgba(148,163,184,0.45)',
                boxShadow: card ? `0 0 12px ${style.color}55` : undefined,
                borderStyle: card ? 'solid' : 'dashed',
              }}
            >
              {card ? (
                <CardFace
                  cardId={card.cardId}
                  imageUrl={card.imageUrl}
                  imageStatus={card.imageStatus}
                  rarity={card.rarity}
                  alt={card.nameTh || card.name || card.cardId}
                />
              ) : (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
                  <span className="text-base leading-none" style={{ opacity: canPlace ? 1 : 0.55 }}>
                    {style.icon}
                  </span>
                  <span className="text-[9px] leading-tight text-gray-300">{style.th}</span>
                  <span className="text-[8px] leading-tight text-gray-500">
                    {canPlace ? 'แตะเพื่อวาง' : 'ว่าง'}
                  </span>
                </span>
              )}
            </span>

            {/* ป้ายบทบาท + โบนัสของช่อง (เปลี่ยนทันทีเมื่อการ์ดเข้า/ออก) */}
            <span className="mt-0.5 flex items-center justify-between gap-1 px-0.5 text-[8px] leading-tight">
              <span className="truncate" style={{ color: style.color }}>
                {style.icon} {style.th}
              </span>
              <span className={card ? 'text-amber-300' : 'text-gray-500'}>{card ? `+${bonus.total}` : '—'}</span>
            </span>
            <span className="block truncate px-0.5 text-[8px] leading-tight text-gray-400">
              {card ? card.nameTh || card.name : `ช่อง ${node.position + 1}`}
            </span>
            {card && bonus.affinity > 0 && (
              <span className="block px-0.5 text-[7px] leading-tight text-emerald-400">
                ตรงบทบาท +{bonus.affinity}
              </span>
            )}
          </button>
        );
      })}

      {/* ── แกนกลางวง: จำนวนใบ + คะแนนรวม (เต้นเมื่อคะแนนเปลี่ยน) ────────────── */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <div key={`total-${total}-${filledCount}`} className="deck-core__pop">
          <div className="text-[10px] text-gray-400">คะแนนรวม</div>
          <div className="text-xl font-bold leading-tight text-amber-300" data-deck-total={total}>
            {total.toLocaleString('th-TH')}
          </div>
          <div className="text-[10px]" style={{ color: grade.color }}>
            {grade.key === 'EMPTY' ? '—' : `เกรด ${grade.key}`}
          </div>
          <div className="text-[10px] text-gray-400">{filledCount}/5 ใบ</div>
          {bonusTotal > 0 && (
            <div className="text-[10px] text-emerald-400">โบนัสช่อง +{bonusTotal.toLocaleString('th-TH')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

