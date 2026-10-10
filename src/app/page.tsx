import Link from 'next/link';

/**
 * หน้าเมนูหลัก — Responsive มือถือ + คอม
 * (ผู้ใช้สั่ง 2026-10-02: แก้ไข UI หน้าเมนูให้สวยงามและใช้งานได้ทั้งสองขนาดจอ)
 * - Hero + ปุ่ม CTA ชัดเจน ทัชได้เต็มพื้นที่บนมือถือ (ปุ่มกว้างเต็มแถว)
 * - การ์ดเมนู 6 รายการ: 1 คอลัมน์บนมือถือ → 2 บน sm → 3 บน lg (ไม่ล้นขอบ)
 * - ยังเป็น Server Component (ไม่มี hooks) เหมือนเดิม
 */
const features = [
  // Phase 45.7 (ผู้ใช้สั่ง 2026-10-08): การ์ดคู่มือผู้เล่นใหม่ไว้บนสุด — ผู้เล่นใหม่กดจากหน้าแรกได้เลย
  { href: '/guide', icon: '📖', title: 'คู่มือผู้เล่นใหม่', desc: 'เริ่มเล่นยังไง (3 ขั้นแรก) + แผน 7 วันแรก — อ่าน 5 นาทีจบ' },
  { href: '/discover', icon: '🔮', title: 'ค้นหารูน', desc: 'ลากแผนรูน 8–16 ช่อง ถอดรหัสการ์ดใหม่' },
  { href: '/decks', icon: '📋', title: 'จัดทีม', desc: 'เลือกการ์ด 5 ใบ วางเป็นวงแหวนพลัง' },
  { href: '/battle', icon: '🎯', title: 'ทดสอบทีม', desc: 'จำลองต่อสู้อัตโนมัติก่อนลุยจริง' },
  { href: '/arena', icon: '⚔️', title: 'ประลอง', desc: 'ท้าประลองผู้เล่นอื่น ไล่ลีดเดอร์บอร์ด' },
  { href: '/quests', icon: '📜', title: 'สมุดภารกิจ', desc: 'รับเควสต์และเก็บรางวัลประจำวัน' },
  { href: '/events', icon: '🌙', title: 'กิจกรรม', desc: 'อีเวนต์จำกัดเวลา เก็บของหายาก' },
];

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* พื้นหลังตกแต่ง (ไม่ขวางการแตะ) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-32 left-1/2 h-96 w-[40rem] -translate-x-1/2 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-purple-600/10 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-72 w-72 rounded-full bg-orange-600/10 blur-3xl" />
        {/* รูนตกแต่ง — แสดงบนจอใหญ่เท่านั้น (กันรกมือถือ) */}
        <span className="absolute left-[8%] top-24 hidden select-none text-6xl text-amber-500/10 md:block">ᚱ</span>
        <span className="absolute right-[10%] top-44 hidden select-none text-7xl text-orange-500/10 md:block">ᚢ</span>
        <span className="absolute bottom-36 left-[16%] hidden select-none text-5xl text-amber-400/10 md:block">ᚠ</span>
        <span className="absolute bottom-44 right-[20%] hidden select-none text-6xl text-purple-500/10 md:block">ᚦ</span>
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col items-center justify-center px-4 py-10 md:py-16">
        {/* Hero */}
        <div className="text-center">
          <p className="mb-3 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1 text-xs font-semibold tracking-wide text-amber-300 md:text-sm">
            Fantasy TCG · Auto Battle · Competitive Arena
          </p>
          <h1 className="bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 bg-clip-text text-4xl font-bold leading-tight text-transparent sm:text-6xl md:text-7xl">
            Rune Dominion Arena
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-gray-300 sm:text-lg md:text-xl">
            ค้นพบการ์ดด้วยรูน · จัดทีม 5 ใบ · ต่อสู้อัตโนมัติ · แข่งขันในอารีน่า
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/discover" className="btn-primary w-full py-4 text-lg sm:w-auto sm:px-10">
              🔮 เริ่มค้นหารูน
            </Link>
            <Link href="/quests" className="btn-secondary w-full py-4 text-lg sm:w-auto sm:px-8">
              📜 สมุดภารกิจ
            </Link>
          </div>
        </div>

        {/* การ์ดเมนูฟีเจอร์ */}
        <div className="mt-12 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:mt-16 lg:grid-cols-3 lg:gap-4">
          {features.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:border-amber-400/50 hover:bg-white/10 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] active:scale-[0.98]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 text-2xl transition-transform group-hover:scale-110">
                {f.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-base font-bold text-gray-100 group-hover:text-amber-200">{f.title}</span>
                <span className="mt-0.5 block text-sm leading-snug text-gray-400">{f.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
