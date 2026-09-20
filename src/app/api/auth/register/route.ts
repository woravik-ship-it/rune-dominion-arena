import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, sessionCookieOptions, signSession } from '@/lib/session';
import { WalletService } from '@/services/wallet';
import { parseJsonBody, registerSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/api-guard';
import { logSecurityEvent } from '@/lib/security-log';
import { getClientIp, getDeviceId } from '@/lib/request-context';

function toSafeUser(user: {
  id: string; username: string; email: string; displayName: string | null;
  avatarUrl: string | null; role: string; discoveryEnergy: number; createdAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    discoveryEnergy: user.discoveryEnergy,
    createdAt: user.createdAt,
  };
}

// POST /api/auth/register — สมัครสมาชิก (username + email + password)
export async function POST(request: NextRequest) {
  try {
    // Phase 10: input validation (Zod — username/email/password ตามกติกาเดิม)
    const { data, errorResponse } = await parseJsonBody(request, registerSchema);
    if (errorResponse) return errorResponse;
    const { username, email, password, displayName } = data;

    // Phase 10: rate limit กันสมัครรัวๆ
    const rl = enforceRateLimit(request, 'AUTH_REGISTER');
    if (rl) return rl;

    // Phase 10: fingerprint — จับ IP/device ตอนสมัคร (ใช้ตรวจ Alt-account)
    const ip = getClientIp(request);
    const deviceId = getDeviceId(request);
    const relatedAccounts = deviceId
      ? await prisma.user.findMany({
          where: {
            OR: [{ lastDeviceId: deviceId }, { signupDeviceId: deviceId }],
          },
          select: { username: true },
        })
      : [];

    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { username: true, email: true },
    });
    if (existing) {
      const conflict = existing.username === username ? 'ชื่อผู้ใช้' : 'อีเมล';
      return NextResponse.json({ error: `${conflict}นี้ถูกใช้แล้ว` }, { status: 409 });
    }

    const passwordHash = hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        displayName: displayName?.trim() || null,
        signupIp: ip,
        signupDeviceId: deviceId,
        lastIp: ip,
        lastDeviceId: deviceId,
      },
    });

    // Phase 10: สมัครจาก device ที่มีบัญชีอื่นอยู่แล้ว → บันทึกสงสัยบัญชีแฝง
    if (relatedAccounts.length > 0) {
      void logSecurityEvent({
        type: 'ALT_ACCOUNT_SUSPECT',
        severity: 'HIGH',
        userId: user.id,
        ip,
        deviceId,
        detail: {
          reason: 'SHARED_DEVICE_AT_SIGNUP',
          related: relatedAccounts.map((a) => a.username),
        },
      });
    }

    // สร้างกระเป๋าเริ่มต้น (โบนัสสมัคร)
    await WalletService.getWallet(user.id);

    const token = signSession({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
    const res = NextResponse.json({ success: true, data: { user: toSafeUser(user) } }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_TTL_SECONDS));
    return res;
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
