interface CardFaceProps {
  cardId: string;
  /** imageUrl ของการ์ด — ถ้าเป็นภาพ AI จริงจะถูกใช้เป็น "รูป" ในช่องภาพ */
  imageUrl?: string | null;
  alt: string;
  /** คลาสของกล่อง — ควรมีสัดส่วนการ์ด (เช่น aspect-[7/10]) */
  className?: string;
}

/** เลือกเฉพาะ imageUrl ที่เป็น "ภาพจริง" (ไม่ใช่ placeholder ที่ route ของเราเจนเอง) */
export function cardArtSrc(imageUrl?: string | null): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('/api/cards/') && imageUrl.includes('/image')) return null;
  return imageUrl;
}

/**
 * ใบการ์ดสำหรับแสดงผล: ภาพ AI (ถ้ามี) + กรอบ/ข้อความจาก /api/cards/[id]/image
 * - ไม่มีภาพ AI → ใช้การ์ดที่วาดเองทั้งใบ
 * - มีภาพ AI → ซ้อน "เลเยอร์กรอบ" (โปร่งใสช่องภาพ) ทับภาพจริง → ได้การ์ดที่มีรูปจริงและข้อความครบ
 */
export default function CardFace({ cardId, imageUrl, alt, className = '' }: CardFaceProps) {
  const art = cardArtSrc(imageUrl);

  if (!art) {
    return (
      <div className={`relative ${className}`}>
        <img
          src={`/api/cards/${cardId}/image?v=4`}
          alt={alt}
          className="absolute inset-0 w-full h-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* ภาพ AI ในช่องภาพ (ตำแหน่งตรงกับช่องภาพในการ์ด 420×600) */}
      <img
        src={art}
        alt=""
        aria-hidden
        className="absolute object-cover"
        style={{ left: '5.71%', top: '17.67%', width: '88.57%', height: '37%' }}
      />
      {/* เลเยอร์การ์ด: กรอบ/ชื่อ/ดาว/กล่องคำบรรยาย/สเตตัส */}
      <img
        src={`/api/cards/${cardId}/image?v=4&mode=overlay`}
        alt={alt}
        className="absolute inset-0 w-full h-full object-contain"
      />
    </div>
  );
}
