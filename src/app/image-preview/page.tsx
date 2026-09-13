import { generatePlaceholderSvg } from '@/lib/image-placeholder';

// หน้าทดสอบภาพ placeholder — ดูได้โดยไม่ต้องล็อกอิน (server component)
const ELEMENTS = ['EMBERBOUND', 'TIDEBORN', 'SKYRIVEN', 'ROOTFORGED', 'DAWNSWORN', 'VEILMARKED'];
const RARITIES = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'UNCOMMON'];

const SAMPLE_NAMES = [
  'นักรบเพลิง', 'ผู้พิทักษ์น้ำ', 'นักฆ่าสายลม', 'ยักษ์หิน', 'นักบวชแสง', 'นักเวทเงา',
  'อัศวินมังกร', 'ราชินีคลื่น', 'เหยี่ยวพายุ', 'โกเล็มภูเขาไฟ', 'เซียนรุ่งอรุณ', 'ฆาตรเงามืด',
];

const SAMPLE_HASHES = [
  'a3f19c8e77b2d4001122334455667788',
  '5f2e8d1c99aa00ff11ee22dd33cc44bb',
  '7b40c1e6f2583a9d0011223344556677',
  'ff00ff00ff00ff00ff00ff00ff00ff00',
  '1234567890abcdef1234567890abcdef',
  'deadbeefcafebabe0123456789abcdef',
  '0000000000000000ffffffffffffffff',
  '9c8b7a695847362514f3e2d1c0b99887',
  '2468ace13579bdf02468ace13579bdf0',
  'faceb00cdeadbeef1337c0de51573411',
  '8e7c6b5a4938271605f4e3d2c1b0a998',
  'c0ffee00d15ea5e0123456789abcdef0',
];

function toDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export default function ImagePreviewPage() {
  const samples = SAMPLE_NAMES.map((name, i) => ({
    name,
    element: ELEMENTS[i % ELEMENTS.length],
    rarity: RARITIES[i % RARITIES.length],
    hash: SAMPLE_HASHES[i % SAMPLE_HASHES.length],
  }));

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-center mb-1">🎨 พรีวิวภาพการ์ด (Gen อัตโนมัติ)</h1>
        <p className="text-xs md:text-sm text-center text-gray-400 mb-6">
          ภาพจาก Deterministic Placeholder Generator — การ์ดเดิมให้ภาพเดิมเสมอ • ขณะรอ AI จริง (ถ้าตั้งค่า AI_IMAGE_API_URL)
        </p>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {samples.map((s) => {
            const svg = generatePlaceholderSvg({
              cardId: `sample-${s.hash.slice(0, 6)}`,
              name: s.name,
              nameTh: s.name,
              element: s.element,
              rarity: s.rarity,
              canonicalSeedHash: s.hash,
            });
            return (
              <div key={s.hash} className="text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={toDataUrl(svg)}
                  alt={s.name}
                  className="w-full rounded-lg border border-white/10 shadow-lg"
                />
                <p className="text-[10px] md:text-xs text-gray-400 mt-1 truncate">{s.name}</p>
                <p className="text-[9px] md:text-[10px] text-gray-600">
                  {s.element.slice(0, 4)} • {s.rarity.slice(0, 4)}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center text-xs text-gray-500 space-y-1">
          <p>ลองกด &quot;ค้นหารูน&quot; ในหน้า Discover → การ์ดใหม่จะเข้าคิวเจนภาพอัตโนมัติ</p>
          <p>ดูภาพของการ์ดจริงใน DB ได้ที่ /cards (คลิกการ์ดเพื่อดูรายละเอียด)</p>
        </div>
      </div>
    </main>
  );
}
