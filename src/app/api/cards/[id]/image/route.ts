import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePlaceholderSvg } from '@/lib/image-placeholder';
import { findDungeon } from '@/lib/dungeon-definitions';
import { dungeonEnemyInfo, parseDungeonCardId, stableHash } from '@/lib/dungeon-art';

// GET /api/cards/[id]/image — การ์ดทั้งใบ (กรอบ/ชื่อ/ดาว/กล่องคำบรรยาย/สเตตัส)
// - ค่าเริ่มต้น: วาดฉากเองทั้งใบ (deterministic SVG)
// - ?mode=overlay: วาดเฉพาะกรอบ/ข้อความ เว้นช่องภาพโปร่งใส → ใช้ซ้อนทับภาพ AI ของการ์ด
//
// Phase 31.1: การ์ดศัตรูดันเจี้ยน (dungeon:<CODE>:f<ชั้น>:boss|minion<K>) ไม่มีใน CardDefinition
//   → เดิมตกเป็น placeholder "???" (404) ทำให้ฝั่งศัตรูบนหน้าสนามรบพังทั้งแถว
//   ⇒ ตอนนี้สร้างกรอบจากนิยามดันเจี้ยน (ชื่อ/ธาตุ/status เดียวกับที่ใช้ต่อสู้จริง)
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const mode = request.nextUrl.searchParams.get('mode') === 'overlay' ? 'overlay' : 'full';

  // การ์ดศัตรูดันเจี้ยน — วาดจากนิยามดันเจี้ยน
  const dungeonRef = parseDungeonCardId(params.id);
  if (dungeonRef) {
    const dungeon = findDungeon(dungeonRef.dungeonCode);
    const info = dungeon ? dungeonEnemyInfo(dungeon, dungeonRef) : null;
    if (info) {
      const svg = generatePlaceholderSvg(
        {
          cardId: info.cardId,
          name: info.name,
          nameTh: info.nameTh,
          element: info.element,
          rarity: info.rarity,
          role: info.role,
          canonicalSeedHash: stableHash(info.cardId).toString(16).padStart(8, '0'),
          stats: { ...info.stats, manaCost: info.manaCost },
          descriptionTh: info.descriptionTh,
        },
        { mode }
      );
      return new NextResponse(svg, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
        },
      });
    }
  }

  const card = await prisma.cardDefinition.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, nameTh: true, element: true,
      rarity: true, role: true, canonicalSeedHash: true, imageUrl: true,
      atk: true, def: true, hp: true, spd: true, manaCost: true,
      skill1Name: true, skill1Desc: true, skill1ManaCost: true,
      skill2Name: true, skill2Desc: true, skill2ManaCost: true,
      descriptionTh: true, loreTh: true,
    },
  });

  if (!card) {
    const svg = generatePlaceholderSvg({
      cardId: 'unknown', name: '???', element: 'VEILMARKED',
      rarity: 'COMMON', role: 'SUPPORT', canonicalSeedHash: '00',
    });
    return new NextResponse(svg, {
      status: 404,
      headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  // หมายเหตุ: ไม่ redirect ไปภาพจริงอีกแล้ว — ภาพ AI ถูกใช้เป็นเลเยอร์ล่างใน UI
  // ส่วน endpoint นี้ให้ "การ์ด" (กรอบ/ข้อความ) เสมอ เพื่อให้ ?mode=overlay ทำงานได้

  const svg = generatePlaceholderSvg({
    cardId: card.id,
    name: card.name,
    nameTh: card.nameTh,
    element: card.element,
    rarity: card.rarity,
    role: card.role,
    canonicalSeedHash: card.canonicalSeedHash,
    // ข้อมูลสำหรับพิมพ์ลงในกรอบการ์ด (สกิล/คำอธิบาย/สเตตัส)
    stats: {
      atk: card.atk,
      def: card.def,
      hp: card.hp,
      spd: card.spd,
      manaCost: card.manaCost,
    },
    skills: [
      card.skill1Name && { name: card.skill1Name, description: card.skill1Desc, manaCost: card.skill1ManaCost },
      card.skill2Name && { name: card.skill2Name, description: card.skill2Desc, manaCost: card.skill2ManaCost },
    ].filter(Boolean) as Array<{ name: string; description: string | null; manaCost: number | null }>,
    descriptionTh: card.descriptionTh,
    loreTh: card.loreTh,
  }, { mode });
  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // deterministic → cache ได้ยาว
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
