'use client';

/**
 * CardDetailModal — รายละเอียดการ์ดแบบป๊อปอัป ใช้ในหน้าคอลเลคชั่น (/cards)
 *
 * ที่มา 2026-10-07 (ผู้ใช้แจ้ง): *"เวลาอยู่หน้า 2 กดกลับคอลเลคชั่น จะกลับไปหน้า 1
 * แก้ให้เป็นดูแบบ Popup พอ จะได้ไม่ต้องกดกลับ"*
 *
 * เดิม <Link href="/cards/:id"> ทำให้หน้าคอลเลคชั่นถูก unmount → page/filter หาย
 * ตัวนี้ดึงข้อมูลจาก GET /api/cards/:id เอง แล้วโชว์ใน overlay ⇒ ไม่เปลี่ยน route
 * จึงกลับมาอยู่หน้าเดิม (ปิดได้ด้วย ✕ · ปุ่มปิด · คลิกพื้นหลัง · ปุ่ม Esc)
 */
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import CardDetail from '@/components/cards/CardDetail';
import { toCardDefinition } from '@/lib/card-modal';
import type { CardDefinition } from '@/types';

interface CardDetailModalProps {
  cardId: string;
  /**
   * URL ของหน้าคอลเลคชั่น ณ ตอนเปิดป๊อปอัป (มี page/ตัวกรองติดไปด้วย)
   * ส่งต่อไปกับปุ่ม "เปิดหน้าเต็ม" เป็น `?from=` เพื่อให้กดกลับจากหน้ารายละเอียด
   * แล้วได้ **หน้าของการ์ดที่เปิดดูอยู่** ไม่ใช่หน้า 1 (ผู้ใช้แจ้ง 2026-10-07)
   */
  fromHref?: string;
  onClose: () => void;
}

export default function CardDetailModal({ cardId, fromHref, onClose }: CardDetailModalProps) {
  const [card, setCard] = useState<CardDefinition | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /** ดึงการ์ดเต็มใบเมื่อเปิด (เฉพาะตอนเปิด) */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const res = await apiFetch(`/api/cards/${cardId}`);
        const data = await res.json();
        if (!alive) return;
        const parsed = toCardDefinition(data?.data);
        if (res.ok && parsed) setCard(parsed);
        else setErr(data?.error ?? 'โหลดรายละเอียดการ์ดไม่สำเร็จ');
      } catch (e) {
        console.error(e);
        if (alive) setErr('โหลดรายละเอียดการ์ดไม่สำเร็จ');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [cardId]);

  /** ปิดด้วย Esc + ล็อกไม่ให้หน้าคอลเลคชั่นเลื่อนตามหลัง overlay */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    // z-[70] = ต้องอยู่เหนือแถบเมนูล่าง (nav fixed z-50) ไม่งั้นปุ่ม "ปิด" ถูกทับ
    // pb-24 = เผื่อที่ให้แถบเมนูล่างไม่บังปุ่มล่างของ modal (เจอจริงใน E2E 2026-10-07)
    <div
      data-card-detail-modal="true"
      role="dialog"
      aria-modal="true"
      aria-label={card ? `${card.nameTh || card.name} — รายละเอียดการ์ด` : 'รายละเอียดการ์ด'}
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/80 p-3 pb-24 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="my-auto w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        {card ? (
          <CardDetail card={card} onClose={onClose} />
        ) : (
          <div className="rounded-xl bg-gray-900 p-6 text-center text-sm text-gray-300">
            {loading ? 'กำลังโหลด...' : err}
          </div>
        )}

        <div className="mt-2 flex items-center justify-center gap-3 text-[11px]">
          {/* ลิงก์ไปหน้าเต็มสำหรับคนที่ต้องการร้านไอเทม/สถานะภาพ AI
              ส่ง fromHref ติดไปด้วย ⇒ ปุ่ม "กลับไปคอลเลคชั่น" ในหน้านั้นพากลับมาหน้านี้ */}
          <a
            data-card-detail-fullpage
            href={`/cards/${cardId}${fromHref ? `?from=${encodeURIComponent(fromHref)}` : ''}`}
            className="text-gray-400 underline"
          >
            เปิดหน้าเต็ม
          </a>
          <button type="button" data-card-detail-close onClick={onClose} className="text-gray-400 underline">
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
