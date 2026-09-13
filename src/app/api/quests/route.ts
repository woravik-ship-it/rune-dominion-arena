import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { QuestService } from '@/services/quest';

async function resolveUserId(param: string): Promise<string | null> {
  if (/^c[a-z0-9]+$/i.test(param)) {
    const byId = await prisma.user.findUnique({ where: { id: param }, select: { id: true } });
    if (byId) return byId.id;
  }
  const byName = await prisma.user.findUnique({ where: { username: param }, select: { id: true } });
  return byName?.id ?? null;
}

// GET /api/quests?userId=xxx — บอร์ดภารกิจของผู้เล่น (งวดปัจจุบัน)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const param = searchParams.get('userId') || 'temp-user';
    const userId = await resolveUserId(param);
    if (!userId) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });

    const board = await QuestService.getBoard(userId);
    return NextResponse.json({ success: true, data: board });
  } catch (error) {
    console.error('Get quests error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
