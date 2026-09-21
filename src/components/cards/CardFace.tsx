interface CardFaceProps {
  cardId: string;
  /** imageUrl ของการ์ด — ถ้าเป็นภาพ AI จริงจะถูกใช้เป็น "รูป" ในช่องภาพ */
  imageUrl?: string | null;
  alt: string;
}

/** เลือกเฉพาะ imageUrl ที่เป็น "ภาพจริง" (ไม่ใช่ placeholder ที่ route ของเราเจนเอง) */
export function cardArtSrc(imageUrl?: string | null): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('/api/cards/') && imageUrl.includes('/image')) return null;
  return imageUrl;
}

/**
 * เลเยอร์ของการ์ดสำหรับแสดงผล: ภาพ AI (ถ้ามี) + กรอบ/ข้อความจาก /api/cards/[id]/image
 *
 * ⚠️ สำคัญ: คอมโพเนนต์นี้ **ไม่ตั้ง position เอง** — ต้องวางในกล่องที่
 *    - `position: relative`
 *    - มีสัดส่วนการ์ด เช่น `aspect-[7/10]` หรือความสูงที่ชัดเจน
 * ไม่งั้นเลเยอร์ `absolute` จะสูง 0 และรูปจะมองไม่เห็น
 * (เคยพลาดมาแล้ว: ใส่ทั้ง `relative` และ `absolute` ให้กล่องเดียวกัน → เบราว์เซอร์เลือก relative → สูง 0)
 *
 * ตรวจด้วยของจริงได้ด้วย: `npm run inspect:cards`
 */
export default function CardFace({ cardId, imageUrl, alt }: CardFaceProps) {
  const art = cardArtSrc(imageUrl);

  return (
    <>
      {art ? (
        // ภาพ AI ในช่องภาพ (ตำแหน่งตรงกับช่องภาพในการ์ด 420×600)
        <img
          src={art}
          alt=""
          aria-hidden
          className="absolute object-cover"
          style={{ left: '5.71%', top: '17.67%', width: '88.57%', height: '37%' }}
        />
      ) : null}
      {/* เลเยอร์การ์ด: กรอบ/ชื่อ/ดาว/กล่องคำบรรยาย/สเตตัส */}
      <img
        src={`/api/cards/${cardId}/image?v=5${art ? '&mode=overlay' : ''}`}
        alt={alt}
        className="absolute inset-0 w-full h-full object-contain"
      />
    </>
  );
}

