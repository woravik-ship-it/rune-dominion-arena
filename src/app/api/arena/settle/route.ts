import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateArenaReward } from '@/services/arena';
import { WalletService } from '@/services/wallet';
import { QuestService } from '@/services/quest';

// POST /api/arena/settle — settlement ห้องหมดอายุ (เรียกได้ทุกนาทีจาก scheduler)
// body: { roomId? } — ถ้าไม่ระบุ จะ settle ทุกห้องที่หมดอายุและยังไม่ settle
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { roomId } = body as { roomId?: string };

    const now = new Date();
    const rooms = await prisma.arenaRoom.findMany({
      where: {
        ...(roomId ? { id: roomId } : {}),
        status: { in: ['ACTIVE', 'WAITING', 'EXPIRED'] },
        expiresAt: { lte: now },
      },
      include: {
        participants: {
          orderBy: [{ wins: 'desc' }, { joinedAt: 'asc' }],
        },
      },
    });

    const settled: Array<{ roomId: string; winnerId: string | null; reward: number }> = [];

    for (const room of rooms) {
      if (room.status === 'SETTLED' || room.settledAt) continue;

      await prisma.arenaRoom.update({
        where: { id: room.id },
        data: { status: 'SETTLING' },
      });

      const count = room.participants.length;
      const reward = calculateArenaReward(count);
      const winner = room.participants[0] ?? null;
      const winnerId = winner?.userId ?? room.championId ?? null;

      if (winnerId && reward > 0) {
        await WalletService.credit(
          winnerId,
          reward,
          'REWARD',
          room.id,
          'ARENA_REWARD',
          `รางวัลแชมป์ห้อง ${room.name}`,
          `arena-settle:${room.id}`
        );
        await prisma.arenaParticipant.updateMany({
          where: { roomId: room.id, userId: winnerId },
          data: { prizeAmount: reward, placement: 1 },
        });
        // Quest hook: นับแชมป์ Arena (ไม่ให้กระทบ flow หลัก)
        try {
          await QuestService.recordEvent(winnerId, 'ARENA_WIN', 1);
        } catch (questError) {
          console.error('Quest ARENA_WIN hook error:', questError);
        }
      }

      await prisma.arenaRoom.update({
        where: { id: room.id },
        data: { status: 'SETTLED', settledAt: new Date(), rewardPool: reward },
      });

      settled.push({ roomId: room.id, winnerId, reward });
    }

    return NextResponse.json({ success: true, data: { settled, count: settled.length } });
  } catch (error) {
    console.error('Settle error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
