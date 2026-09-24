'use client';

import { useEffect, useState } from 'react';
import CardAura from '@/components/cards/CardAura';
import CardAuraCanvas from '@/components/cards/CardAuraCanvas';
import CardFoil from '@/components/cards/CardFoil';
import { DEFAULT_AURA_VARIANT, isCanvasVariant, type AuraVariant } from '@/lib/card-aura';
import { cardArtSrc, isRegenerating, cardFrameUrl } from '@/lib/card-image';

interface CardFaceProps {
  cardId: string;
  /** imageUrl ของการ์ด — ถ้าเป็นภาพ AI จริงจะถูกใช้เป็น "รูป" ในช่องภาพ */
  imageUrl?: string | null;
  /** สถานะภาพจาก API: PENDING | PROCESSING | READY | FAILED */
  imageStatus?: string | null;
  /** ระดับความหายาก — ใช้กำหนดชั้นแสงเลื่อม (foil) + แสงเรืองตีบวก (aura) ที่ครอบบนการ์ด */
  rarity?: string | null;
  /**
   * ดีไซน์แสงเรืองตีบวก (ไม่ส่ง = ดีไซน์ที่ผู้ใช้เลือกไว้ = `DEFAULT_AURA_VARIANT` = `inner`)
   * ส่งค่าอื่นได้เมื่อต้องการทดลองดีไซน์อื่น (ดู /aura-preview)
   */
  auraVariant?: AuraVariant;
  alt: string;
}

/**
 * การ์ดสำหรับแสดงผล: ภาพ AI + กรอบ/ข้อความจาก /api/cards/[id]/image?mode=overlay
 * + ชั้นแสงเลื่อม (foil) + ชั้นแสงเรืองแบบไอเทมตีบวก (aura)
 *
 * กติกา UX (ผู้ใช้กำหนด): **ห้ามแสดงการ์ดวาดเอง (สคริปต์) เด็ดขาด**
 *  - PENDING/PROCESSING (รวมถึงตอนสร้างใหม่) → แสดง "กำลังสร้างภาพด้วย AI…" แล้ว poll จนภาพพร้อม
 *  - FAILED → บอกว่า "สร้างภาพไม่สำเร็จ" (แอดมินสั่งสร้างใหม่ได้)
 *  - READY → แสดงภาพ AI + กรอบการ์ด
 *
 * ⚠️ ต้องวางในกล่องที่ `position: relative` + มีสัดส่วนการ์ด (`aspect-[7/10]`) หรือความสูงชัดเจน
 *    ไม่งั้นเลเยอร์ `absolute` จะสูง 0 และรูปมองไม่เห็น (เคยพลาดมาแล้ว — ตรวจด้วย `npm run inspect:cards`)
 * ✅ ชั้น aura ที่ใช้จริง (`inner`) ตัดแสงให้อยู่ในกรอบการ์ด → ใช้ในกล่องที่มี `overflow-hidden` ได้
 *    โดยไม่ต้องแก้ layout ของหน้าไหน (ต่างจากดีไซน์นอกกรอบที่ต้องมีที่ว่าง 12% รอบการ์ด)
 */
export default function CardFace({
  cardId,
  imageUrl,
  imageStatus,
  rarity,
  auraVariant,
  alt,
}: CardFaceProps) {

  // ระหว่างสร้างใหม่ถือว่า "ยังไม่พร้อม" → ซ่อนภาพเดิมไว้ก่อน (ผู้ใช้กำหนด)
  const [artSrc, setArtSrc] = useState<string | null>(
    isRegenerating(imageStatus) ? null : cardArtSrc(imageUrl)
  );
  const [waited, setWaited] = useState(0);

  // props เปลี่ยน (เช่น รีเฟรชรายการ) → คำนวณใหม่
  useEffect(() => {
    setArtSrc(isRegenerating(imageStatus) ? null : cardArtSrc(imageUrl));
  }, [imageUrl, imageStatus]);

  // ยังไม่มีภาพ/กำลังสร้าง → poll /api/cards/[id]/art?probe=1 เพื่อรอจน "พร้อมใช้" จริง
  useEffect(() => {
    if (artSrc) return;
    if (imageStatus === 'FAILED') return;

    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/cards/${cardId}/art?probe=${Date.now()}`, { cache: 'no-store' });
        if (res.ok && !cancelled) {
          setArtSrc(`/api/cards/${cardId}/art?v=${Date.now()}`);
          clearInterval(timer);
          setWaited(0);
        } else if (!cancelled) {
          setWaited((n) => n + 1);
        }
      } catch {
        if (!cancelled) setWaited((n) => n + 1);
      }
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [artSrc, cardId, imageStatus]);

  const artWindow = { left: '5.71%', top: '17.67%', width: '88.57%', height: '37%' } as const;
  const chosenVariant = auraVariant ?? DEFAULT_AURA_VARIANT;

  return (
    <>
      {artSrc ? (
        // ภาพ AI ในช่องภาพ (ตำแหน่งตรงกับช่องภาพในการ์ด 420×600)
        <img src={artSrc} alt="" aria-hidden className="absolute object-cover" style={artWindow} />
      ) : imageStatus === 'FAILED' ? (
        <div
          className="absolute flex flex-col items-center justify-center gap-1 bg-slate-900 text-center"
          style={artWindow}
        >
          <span className="text-lg">⚠️</span>
          <span className="text-[10px] leading-tight text-red-300">ยังวาดภาพไม่สำเร็จ</span>
        </div>
      ) : (
        // กำลังวาดภาพ — ห้ามแสดงการ์ดวาดเอง (พื้นทึบ ทับช่องภาพเดิม)
        <div
          className="absolute flex flex-col items-center justify-center gap-1 bg-slate-900 text-center"
          style={artWindow}
        >
          <span className="animate-spin text-lg">⏳</span>
          <span className="text-[10px] leading-tight text-amber-300">กำลังวาดภาพ…</span>
          {waited >= 8 && <span className="text-[9px] text-gray-400">ใช้เวลานานกว่าปกติ — รอสักครู่</span>}
        </div>
      )}

      {/* เลเยอร์การ์ด: กรอบ/ชื่อ/ดาว/กล่องคำบรรยาย/สเตตัส (โหมด overlay — ช่องภาพโปร่ง) */}
      <img
        src={cardFrameUrl(cardId)}
        alt={alt}
        className="absolute inset-0 w-full h-full object-contain"
      />

      {/* ชั้นแสงเลื่อม (foil) ครอบบนการ์ด — CSS ล้วน ไม่เกี่ยวกับการเจนภาพ · ความเข้มตามระดับความหายาก */}
      <CardFoil rarity={rarity} seed={cardId} />

      {/* ชั้นแสงเรืองแบบไอเทมตีบวก (aura) — SVG glow · ระดับต่ำ (COMMON/UNCOMMON) ไม่ render อะไรเลย
          ดีไซน์ `neon` วาดด้วย Canvas 2D (คนละคอมโพเนนต์) — เลือกตาม isCanvasVariant */}
      {isCanvasVariant(chosenVariant) ? (
        <CardAuraCanvas rarity={rarity} seed={cardId} />
      ) : (
        <CardAura rarity={rarity} seed={cardId} variant={chosenVariant} />
      )}
    </>
  );
}
