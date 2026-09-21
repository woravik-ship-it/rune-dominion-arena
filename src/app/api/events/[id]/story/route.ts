// GET /api/events/[id]/story — บทเนื้อเรื่องที่ปลดล็อกตาม Community Damage
import { NextRequest, NextResponse } from 'next/server';
import { EventService } from '@/services/event';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const chapters = await EventService.storyState(params.id);
    return NextResponse.json({ success: true, data: chapters });
  } catch (error) {
    console.error('Event story error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
