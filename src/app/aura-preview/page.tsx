import CardFace from '@/components/cards/CardFace';
import { AURA_VARIANTS, DEFAULT_AURA_VARIANT, auraLayers, auraSpec, type AuraVariant } from '@/lib/card-aura';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// หน้าพรีวิว "แสงเรืองแบบไอเทมตีบวก" (item upgrade glow) — ดูได้โดยไม่ต้องล็อกอิน (server component)
//
// ใช้เทียบดีไซน์และระดับข้างกัน ก่อนตัดสินใจนำไปใช้ทุกหน้า (บทเรียนจาก docs/FOIL_STATUS.md:
// ของเดิมที่ลองแล้วไม่ผ่าน — aura box-shadow และเปลวไฟรอบขอบ — ถูกประเมินจาก "ภาพจริง" เสมอ)
//
// วิธีใช้:
//   /aura-preview                        → เทียบ 5 ดีไซน์ ที่ระดับ LEGENDARY + MYTHIC
//   /aura-preview?rarity=MYTHIC          → เทียบ 5 ดีไซน์ ที่ระดับเดียว
//   /aura-preview?variant=radiant        → ดีไซน์เดียว ทุกระดับ (ดูบันได +7 → +13)
//   /aura-preview?rarity=EPIC&variant=ascend  → แถวเดียว

const RARITY_ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];

const RARITY_LABEL: Record<string, string> = {
  COMMON: 'ทั่วไป',
  UNCOMMON: 'ไม่ธรรมดา',
  RARE: 'หายาก',
  EPIC: 'มหากาพย์',
  LEGENDARY: 'ตำนาน',
  MYTHIC: 'เทพนิยาย',
};

const VARIANT_INFO: Record<AuraVariant, { label: string; desc: string }> = {
  tier: { label: 'บันไดระดับ (แนะนำ)', desc: 'ระดับสูงได้องค์ประกอบเพิ่มอัตโนมัติ: +7 ขอบเรือง → +9 ประกายดาว → +11 เสาแสง → +13 ครบชุด' },
  bloom: { label: 'Bloom', desc: 'แสงเรืองเกาะขอบการ์ด + อาบแสงในช่องภาพ — สุภาพ ใช้ได้ทุกหน้า' },
  radiant: { label: 'Radiant', desc: 'Bloom + ประกายดาว 4 แฉกกลางช่องภาพ (หมุนช้าๆ)' },
  ascend: { label: 'Ascend', desc: 'Bloom + เสาแสงแนวตั้ง + ประกายลอยขึ้น — เน้น "พลังไหลขึ้น" แบบตีบวก' },
  inner: {
    label: 'Inner — ใช้จริงบนการ์ดทุกหน้าแล้ว ✅',
    desc: 'แสงอยู่ในกรอบการ์ดทั้งหมด (ขอบเรือง + ประกายลอย · ถอดประกายดาวออกตามรีวิวบนการ์ดจริง) — ใช้ได้ทุกหน้าโดยไม่ต้องแก้ layout',
  },
};

const PER_ROW = 2;

interface PreviewCard {
  id: string;
  name: string;
  nameTh: string | null;
  rarity: string;
  imageUrl: string | null;
  imageStatus: string;
}

interface Row {
  title: string;
  subtitle: string;
  rarity: string;
  variant: AuraVariant;
  cards: PreviewCard[];
}

export default async function AuraPreviewPage({
  searchParams,
}: {
  searchParams: { rarity?: string; variant?: string };
}) {
  const rarityFilter = (searchParams.rarity ?? '').toUpperCase();
  // กันพิมพ์ดีไซน์ผิด (?variant=foo) → ถือว่าไม่ได้กรอง (ของเดิม cast ตรงๆ แล้วพังตอนอ่าน VARIANT_INFO[variant])
  const rawVariant = (searchParams.variant ?? '').toLowerCase();
  const variantFilter: AuraVariant | '' = (AURA_VARIANTS as string[]).includes(rawVariant)
    ? (rawVariant as AuraVariant)
    : '';

  const rarities = rarityFilter
    ? [rarityFilter]
    : variantFilter
      ? RARITY_ORDER
      : ['LEGENDARY', 'MYTHIC'];
  const variants = variantFilter ? [variantFilter] : (AURA_VARIANTS as AuraVariant[]);

  let cards: PreviewCard[] = [];
  let error: string | null = null;

  try {
    cards = await prisma.cardDefinition.findMany({
      where: { imageStatus: 'READY' },
      orderBy: { id: 'asc' },
      take: 300,
      select: { id: true, name: true, nameTh: true, rarity: true, imageUrl: true, imageStatus: true },
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const rows: Row[] = [];
  for (const rarity of rarities) {
    for (const variant of variants) {
      const spec = auraSpec(rarity);
      const layers = auraLayers(variant, rarity);
      const parts = [
        layers.halo ? 'ขอบเรือง' : '—',
        layers.flare ? 'ประกายดาว' : '',
        layers.pillar ? 'เสาแสง' : '',
        layers.sparks ? 'ประกายลอย' : '',
        layers.clip ? '(ตัดในกรอบ)' : '',
      ].filter(Boolean);
      rows.push({
        title: `${rarity} · ${RARITY_LABEL[rarity] ?? rarity}`,
        subtitle: `${VARIANT_INFO[variant].label} · ระดับแสง ${spec.tier} · ความเข้ม ${spec.intensity} · ${parts.join(' + ')}`,
        rarity,
        variant,
        cards: cards.filter((c) => c.rarity === rarity).slice(0, PER_ROW),
      });
    }
  }

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-center mb-1">
          ⚔️ พรีวิวแสงเรืองแบบไอเทมตีบวก (MU Online style)
        </h1>
        <p className="text-xs md:text-sm text-center text-gray-400 mb-2">
          SVG glow ล้วน (feGaussianBlur + gradient) — ไม่ใช้ box-shadow และไม่มีลูกเปลวไฟแบบที่เคยไม่ผ่าน ·
          แสงเกาะรูปทรงการ์ด สเกลตามขนาดจริงทุกหน้า
        </p>
        <p className="text-[11px] md:text-xs text-center text-gray-500 mb-6">
          ดีไซน์ bloom/radiant/ascend มีแสงล้นออกนอกการ์ด 12% (กล่องแม่ต้องไม่ overflow-hidden) ·
          ดีไซน์ inner อยู่ในกรอบทั้งหมด · COMMON/UNCOMMON ไม่มีแสง (การ์ดธรรมดาต้องเรียบ)
          <span className="block text-amber-300/80">
            ใช้จริงแล้ว: ดีไซน์ {DEFAULT_AURA_VARIANT} (การ์ดทุกหน้าในเกมได้แสงนี้อัตโนมัติผ่าน CardFace)
          </span>
        </p>

        {error && <p className="text-center text-red-300 text-sm mb-6">อ่านการ์ดจากฐานข้อมูลไม่ได้: {error}</p>}

        {rows.map((row) => (
          <section
            key={`${row.rarity}-${row.variant}`}
            className="mb-8"
            data-aura-row={`${row.rarity}-${row.variant}`}
          >
            <h2 className="text-sm md:text-base font-bold mb-1">
              {row.title}
              <span className="ml-2 text-xs font-normal text-amber-300">{VARIANT_INFO[row.variant].label}</span>
            </h2>
            <p className="text-[11px] md:text-xs text-gray-400 mb-2">
              {VARIANT_INFO[row.variant].desc}
              <span className="block text-gray-500">{row.subtitle}</span>
            </p>
            {row.cards.length === 0 ? (
              <p className="text-xs text-gray-500">— ยังไม่มีการ์ดระดับนี้ที่ภาพพร้อมใช้ —</p>
            ) : (
              <div className="flex flex-wrap gap-4">
                {row.cards.map((card) => (
                  <div key={`${card.id}-${row.variant}`} className="text-center">
                    {/* ต้องมีช่องว่างรอบการ์ด (14%) ให้แสงล้นออกได้ + ห้าม overflow-hidden
                        (จำเป็นเฉพาะดีไซน์นอกกรอบ · ดีไซน์ inner ที่ใช้จริงไม่ต้องมี) */}
                    <div className="p-[14%]">
                      <div className="relative w-[220px] aspect-[7/10]">
                        {/* ส่ง auraVariant ตรงนี้ → พรีวิวแสดงแสงชั้นเดียวเหมือนหน้าจริง (CardFace วาด aura ให้เอง) */}
                        <CardFace
                          cardId={card.id}
                          imageUrl={card.imageUrl}
                          imageStatus={card.imageStatus}
                          rarity={card.rarity}
                          auraVariant={row.variant}
                          alt={card.nameTh || card.name}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] md:text-xs text-gray-400 truncate max-w-[220px]">
                      {card.nameTh || card.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
