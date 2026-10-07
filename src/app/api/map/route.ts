import { NextRequest, NextResponse } from 'next/server';
import { MapFarmService } from '@/services/map-farm';
import { resolveRequestUserId } from '@/lib/current-user';

// GET /api/map — สถานะแผนที่ฟาร์ม (Stamina/พลังค้นหา/เส้นทาง/จุดถัดไป)
export async function GET(request: NextRequest) {
  try {
    const actualUser = await resolveRequestUserId(request);
    if (!actualUser) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const state = await MapFarmService.state(actualUser);
    return NextResponse.json({ success: true, data: state });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'โหลดแผนที่ไม่สำเร็จ';
    console.error('Map state error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}