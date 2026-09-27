'use client';

// CardPreviewModal / CardMiniPreview — "ดูการ์ดเป็นฟอง" ใช้ได้ทุกหน้า (Phase 41)
//
// ผู้ใช้สั่ง 2026-09-27:
//  *"ในหน้ากระเป๋าที่ item ระบุการ์ดที่ใส่ ให้แสดงหน้าการ์ด ไม่เอาแค่ตัวหนังสือ เอาเป็นย่อ ขยายได้ (แบบฟอง)"*
//  *"หน้าดูการ์ด กับจัด Deck ควรควบรวมกัน เพราะตอนนี้ต้องเปิดกลับไปมาถึงจะใส่ Item ให้การ์ดได้"*
//
// ⇒ การ์ดย่อ 1 ใบ (CardMiniPreview) กดแล้วเปิด "ฟอง" ที่มีการ์ดเต็มใบ + ช่างใส่ Item ในที่เดียว
//    (หน้าจัดเด็คเรียกใช้ตัวนี้ตอนกด "ดูการ์ด" → ใส่ Item ได้โดยไม่ต้องออกจากหน้าเด็ค)
import { useState } from 'react';
import CardFace from '@/components/cards/CardFace';
import CardItemWorkshop from '@/components/cards/CardItemWorkshop';
import Modal from '@/components/ui/Modal';

export interface CardPreviewData {
  cardId: string;
  nameTh: string | null;
  name?: string | null;
  element?: string | null;
  rarity?: string | null;
  imageUrl?: string | null;
  imageStatus?: string | null;
  level?: number | null;
}

/** ฟองดูการ์ดเต็มใบ + ช่างใส่ Item (ใช้ซ้ำได้ทุกหน้า) */
export function CardPreviewModal({
  card,
  open,
  onClose,
  showWorkshop = true,
  onChanged,
  footer,
}: {
  card: CardPreviewData | null;
  open: boolean;
  onClose: () => void;
  /** ปิดได้ถ้าไม่ต้องแก้ไข Item (เช่นดูอย่างเดียว) */
  showWorkshop?: boolean;
  onChanged?: () => void;
  footer?: React.ReactNode;
}) {
  if (!card) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`🎴 ${card.nameTh || card.name || card.cardId}`}
      subtitle={[card.name, card.rarity, card.element].filter(Boolean).join(' · ')}
      size="md"
      footer={footer}
    >
      <div data-card-preview={card.cardId} className="mx-auto w-[240px]">
        <div className="relative aspect-[7/10] overflow-hidden rounded-xl border border-white/10 bg-black/40">
          <CardFace
            cardId={card.cardId}
            imageUrl={card.imageUrl}
            imageStatus={card.imageStatus}
            rarity={card.rarity}
            alt={card.nameTh || card.name || card.cardId}
          />
        </div>
      </div>
      {showWorkshop && (
        <div className="mt-4">
          <CardItemWorkshop cardId={card.cardId} onChanged={onChanged} />
        </div>
      )}
    </Modal>
  );
}

/** การ์ดย่อ (เห็นภาพจริง + ชื่อ) กดแล้วเปิดฟองดูการ์ด/ใส่ Item */
export function CardMiniPreview({
  card,
  width = 64,
  label,
  showWorkshop = true,
  onChanged,
  badge,
}: {
  card: CardPreviewData;
  /** ความกว้างการ์ดย่อ (px) — สูงคำนวณจากสัดส่วนการ์ด 7:10 */
  width?: number;
  label?: React.ReactNode;
  showWorkshop?: boolean;
  onChanged?: () => void;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const height = Math.round((width * 10) / 7);
  return (
    <>
      <button
        type="button"
        data-card-mini={card.cardId}
        onClick={() => setOpen(true)}
        title={`ดูการ์ด ${card.nameTh || card.name || card.cardId}`}
        className="group relative shrink-0 overflow-hidden rounded-lg border border-white/15 bg-black/40 transition-transform hover:scale-105"
        style={{ width, height }}
      >
        <CardFace
          cardId={card.cardId}
          imageUrl={card.imageUrl}
          imageStatus={card.imageStatus}
          rarity={card.rarity}
          alt={card.nameTh || card.name || card.cardId}
        />
        {badge && <span className="absolute left-0 top-0 rounded-br bg-black/70 px-1 text-[9px] text-white">{badge}</span>}
        {label && (
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1 text-[9px] text-gray-100">
            {label}
          </span>
        )}
      </button>
      <CardPreviewModal
        card={card}
        open={open}
        onClose={() => setOpen(false)}
        showWorkshop={showWorkshop}
        onChanged={onChanged}
      />
    </>
  );
}

export default CardMiniPreview;
