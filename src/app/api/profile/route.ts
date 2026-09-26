import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveRequestUserId } from '@/lib/current-user';
import { WalletService } from '@/services/wallet';
import { VeilShardService } from '@/services/veil-shard';
import { DiscoveryService } from '@/services/discovery';
import { dustBalance } from '@/services/item';
import { avatarKind, gridRows, paintedCells } from '@/lib/avatar';

// GET /api/profile — ข้อมูลโปรไฟล์ผู้เล่น (Phase 26)
//
// ผู้ใช้สั่ง 2026-09-27: "Profile ก็ยังไม่มีข้อมูล ทำให้ด้วย"
// รวมทุกอย่างที่ผู้เล่นอยากเห็นในที่เดียว: ตัวตน + อวตาร + ยอดเงิน + สถิติการเล่น
export async function GET(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const [
      user,
      wallet,
      veilShards,
      energy,
      cards,
      deckCount,
      battles,
      wins,
      questsCompleted,
      eventPart,
      itemCount,
      equippedCount,
      dust,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, username: true, displayName: true, role: true, createdAt: true,
          locale: true, avatarEmoji: true, avatarGrid: true,
        },
      }),
      WalletService.getWallet(userId),
      VeilShardService.balance(userId),
      DiscoveryService.getEnergy(userId).catch(() => null),
      prisma.userCard.findMany({ where: { userId }, select: { quantity: true, isFavorite: true } }),
      prisma.deck.count({ where: { userId } }),
      prisma.battleLog.count({ where: { attackerId: userId } }),
      prisma.battleLog.count({ where: { attackerId: userId, winnerId: userId } }),
      prisma.questProgress.count({ where: { userId, rewardClaimed: true } }),
      prisma.eventParticipation.findFirst({
        where: { userId },
        orderBy: { joinedAt: 'desc' },
        select: { eventPoints: true, damageDealt: true, currencyEarned: true, currencySpent: true },
      }),
      prisma.userItem.aggregate({ where: { userId }, _sum: { quantity: true } }),
      prisma.cardItemSlot.count({ where: { userCard: { userId } } }),
      dustBalance(userId),
    ]);

    if (!user) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });

    const ownedCards = cards.reduce((sum, row) => sum + row.quantity, 0);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          locale: user.locale,
          joinedAt: user.createdAt.toISOString(),
          avatarEmoji: user.avatarEmoji,
          avatarGrid: user.avatarGrid,
          /** ชนิดอวตารที่จะแสดงจริง (emoji / grid / default) */
          avatarKind: avatarKind({ emoji: user.avatarEmoji, grid: user.avatarGrid }),
          /** แถวของภาพวาด 6×6 (สำหรับเรนเดอร์) */
          avatarRows: gridRows(user.avatarGrid),
          paintedCells: paintedCells(user.avatarGrid),
        },
        balances: {
          coin: wallet.balance,
          coinEarned: wallet.totalEarned,
          coinSpent: wallet.totalSpent,
          veilShards,
          dust,
          energyRemaining: energy?.remaining ?? null,
          energyMax: energy?.max ?? null,
        },
        stats: {
          cardTypes: cards.length,
          ownedCards,
          favoriteCards: cards.filter((row) => row.isFavorite).length,
          decks: deckCount,
          battles,
          wins,
          losses: Math.max(0, battles - wins),
          winRate: battles > 0 ? Number(((wins / battles) * 100).toFixed(1)) : 0,
          questsCompleted,
          items: itemCount._sum.quantity ?? 0,
          equippedItems: equippedCount,
        },
        event: eventPart
          ? {
              eventPoints: eventPart.eventPoints,
              damageDealt: eventPart.damageDealt,
              shardsEarned: eventPart.currencyEarned,
              shardsSpent: eventPart.currencySpent,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json({ error: 'อ่านข้อมูลโปรไฟล์ไม่สำเร็จ' }, { status: 500 });
  }
}
