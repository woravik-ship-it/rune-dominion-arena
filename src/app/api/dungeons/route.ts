import { NextRequest, NextResponse } from 'next/server';
import { listDungeons } from '@/services/dungeon';
import { LevelService } from '@/services/level';
import { itemDropBonusPercent } from '@/lib/level';
import { resolveRequestUserId } from '@/lib/current-user';

// GET /api/dungeons — รายการดันเจี้ยน + สถานะเข้าได้ + ชั้นสูงสุดที่เคยผ่าน
export async function GET(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });
    const [dungeons, level] = await Promise.all([listDungeons(userId), LevelService.progress(userId)]);
    return NextResponse.json({
      success: true,
      data: {
        dungeons,
        // Phase 33: โบนัสโอกาสดรอป Item จากเลเวล (สูงสุด +20% ที่เลเวล 350)
        level: { ...level, dropBonusPercent: itemDropBonusPercent(level.level) },
      },
    });
  } catch (error) {
    console.error('List dungeons error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
