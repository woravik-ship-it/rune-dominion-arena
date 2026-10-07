import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SESSION_COOKIE, verifySession } from '@/lib/session';
import { WalletService } from '@/services/wallet';
import { itemDropBonusPercent, levelProgress } from '@/lib/level';

// GET /api/auth/me — ข้อมูลผู้ใช้ปัจจุบันจาก session cookie
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = verifySession(token);
    if (!session) {
      return NextResponse.json({ success: false, error: 'ไม่ได้เข้าสู่ระบบ' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: {
        id: true, username: true, email: true, displayName: true,
        avatarUrl: true, role: true, discoveryEnergy: true, isActive: true, createdAt: true,
        // Phase 26: อวตารในเกม (อิโมจิ หรือภาพวาด 6×6)
        avatarEmoji: true, avatarGrid: true, exp: true,
        // Phase 43: เครื่องประดับ + ฉายา (หัวเว็บแสดงกรอบ/ฉายา)
        avatarFrameCode: true, titleCode: true, titleTh: true,
      },
    });
    if (!user || !user.isActive) {
      return NextResponse.json({ success: false, error: 'ไม่ได้เข้าสู่ระบบ' }, { status: 401 });
    }

    const wallet = await WalletService.getWallet(user.id);
    // Phase 38: ส่งข้อมูลเลเวลไปกับ /me เลย (หัวเว็บโชว์ ⭐ Lv. ได้โดยไม่ต้องยิง API เพิ่ม)
    const level = levelProgress(user.exp ?? 0);
    // Phase 45 (2026-10-07): เดิม route นี้ไม่ส่ง cardCount แต่ OnboardingProvider เอาไปใช้ตัดสินว่า
    // "ผู้เล่นใหม่" หรือยัง ⇒ Number(undefined ?? 0) = 0 เสมอ ทำให้ modal แนะนำการเล่นเด้งหาผู้เล่น
    // ที่มีการ์ดอยู่แล้วทุกคน (บั๊กที่เจอตอนเขียนเทสต์ E2E) — ส่งจำนวนการ์ดจริงไปด้วย
    const cardCount = await prisma.userCard.count({ where: { userId: user.id } });
    return NextResponse.json({
      success: true,
      data: {
        user,
        wallet,
        cardCount,
        level: { ...level, dropBonusPercent: itemDropBonusPercent(level.level) },
      },
    });
  } catch (error) {
    console.error('Me error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
