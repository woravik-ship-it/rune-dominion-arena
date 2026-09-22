import CardFace from '@/components/cards/CardFace';
import { foilSpec } from '@/lib/card-foil';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// หน้าพรีวิว "ชั้นแสงเลื่อม" (foil overlay) — ดูได้โดยไม่ต้องล็อกอิน (server component)
// ใช้เทียบระดับความหายากข้างกัน เพื่อดูว่าความเข้ม/สี/ประกาย ต่างกันจริงตามกติกาใน src/lib/card-foil.ts
const RARITY_ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
const PER_RARITY = 4;

const RARITY_LABEL: Record<string, string> = {
  COMMON: 'ทั่วไป',
  UNCOMMON: 'ไม่ธรรมดา',
  RARE: 'หายาก',
  EPIC: 'มหากาพย์',
  LEGENDARY: 'ตำนาน',
  MYTHIC: 'เทพนิยาย',
};

interface PreviewCard {
  id: string;
  name: string;
  nameTh: string | null;
  rarity: string;
  imageUrl: string | null;
  imageStatus: string;
}

export default async function FoilPreviewPage() {
  let cards: PreviewCard[] = [];
  let error: string | null = null;

  try {
    cards = await prisma.cardDefinition.findMany({
      orderBy: { rarity: 'asc' },
      take: 240,
      select: { id: true, name: true, nameTh: true, rarity: true, imageUrl: true, imageStatus: true },
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const groups = RARITY_ORDER.map((rarity) => ({
    rarity,
    spec: foilSpec(rarity),
    cards: cards.filter((c) => c.rarity === rarity).slice(0, PER_RARITY),
  }));

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-center mb-1">✨ พรีวิวแสงเลื่อมบนการ์ด</h1>
        <p className="text-xs md:text-sm text-center text-gray-400 mb-6">
          ชั้น foil/holo เป็น CSS ล้วน (ไม่เจนภาพใหม่) · ความเข้ม/สี/ประกาย มาจากระดับความหายาก
        </p>

        {error && (
          <p className="text-center text-red-300 text-sm mb-6">อ่านการ์ดจากฐานข้อมูลไม่ได้: {error}</p>
        )}

        {!error && cards.length === 0 && (
          <p className="text-center text-gray-400 text-sm mb-6">ยังไม่มีการ์ดในฐานข้อมูล</p>
        )}

        {groups.map((group) => (
          <section key={group.rarity} className="mb-8">
            <h2 className="text-sm md:text-base font-bold mb-1">
              {group.rarity} · {RARITY_LABEL[group.rarity]}
              <span className="ml-2 text-xs font-normal text-gray-400">
                ระดับ {group.spec.tier} · ความเข้ม {group.spec.intensity} · คาบกวาด {group.spec.sweepSec || '-'} วิ
              </span>
            </h2>
            {group.cards.length === 0 ? (
              <p className="text-xs text-gray-500">— ยังไม่มีการ์ดระดับนี้ในฐานข้อมูล —</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {group.cards.map((card) => (
                  <div key={card.id} className="text-center">
                    {/* ต้องมีกล่อง relative + สัดส่วนการ์ด (ข้อกำหนดของ CardFace) */}
                    <div className="relative aspect-[7/10] rounded-lg overflow-hidden bg-black/40">
                      <CardFace
                        cardId={card.id}
                        imageUrl={card.imageUrl}
                        imageStatus={card.imageStatus}
                        rarity={card.rarity}
                        alt={card.nameTh || card.name}
                      />
                    </div>
                    <p className="text-[10px] md:text-xs text-gray-400 mt-1 truncate">
                      {card.nameTh || card.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

        <p className="text-center text-xs text-gray-500">
          หมายเหตุ: ระดับ COMMON/UNCOMMON ไม่มีชั้นแสง (การ์ดธรรมดาต้องเรียบ) · ผู้ใช้ที่ปิดอนิเมชันในระบบจะเห็นแสงนิ่ง
        </p>
      </div>
    </main>
  );
}
