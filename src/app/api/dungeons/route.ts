import { NextRequest, NextResponse } from 'next/server';
import { listDungeons } from '@/services/dungeon';
import { resolveRequestUserId } from '@/lib/current-user';

// GET /api/dungeons — รายการดันเจี้ยน + สถานะเข้าได้ + ชั้นสูงสุดที่เคยผ่าน
export async function GET(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });
    const dungeons = await listDungeons(userId);
    return NextResponse.json({ success: true, data: { dungeons } });
  } catch (error) {
    console.error('List dungeons error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
