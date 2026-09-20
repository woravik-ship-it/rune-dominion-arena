import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, sessionCookieOptions, signSession } from '@/lib/session';
import { parseJsonBody, loginSchema } from '@/lib/validation';
import { enforceRateLimit, enforceRateLimitForKey } from '@/lib/api-guard';
import { logSecurityEvent } from '@/lib/security-log';
import { getClientIp, getDeviceId } from '@/lib/request-context';

// POST /api/auth/login — เข้าสู่ระบบ (username หรือ email + password)
export async function POST(request: NextRequest) {
  try {
    // Phase 10: input validation (Zod)
    const { data, errorResponse } = await parseJsonBody(request, loginSchema);
    if (errorResponse) return errorResponse;
    const { identifier, password } = data;

    // Phase 10: rate limit กัน brute force — ต่อ IP และต่อบัญชีเป้าหมาย
    const rl = enforceRateLimit(request, 'AUTH_LOGIN');
    if (rl) {
      void logSecurityEvent({
        type: 'AUTH_FAILURE_SPIKE',
        severity: 'MEDIUM',
        ip: getClientIp(request),
        deviceId: getDeviceId(request),
        detail: { endpoint: 'POST /api/auth/login', scope: 'AUTH_LOGIN', key: 'per-ip' },
      });
      return rl;
    }
    const acctKey = `acct:${identifier.trim().toLowerCase()}`;
    const acctRl = enforceRateLimitForKey(request, 'AUTH_LOGIN', acctKey);
    if (acctRl) {
      void logSecurityEvent({
        type: 'AUTH_FAILURE_SPIKE',
        severity: 'MEDIUM',
        ip: getClientIp(request),
        deviceId: getDeviceId(request),
        detail: { endpoint: 'POST /api/auth/login', scope: 'AUTH_LOGIN', key: 'per-account' },
      });
      return acctRl;
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
    });
    // ตอบข้อความเดียวกันทั้งกรณี "ไม่พบผู้ใช้" และ "รหัสผ่านผิด" (กัน user enumeration)
    if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 });
    }

    // Phase 10: fingerprint — อัปเดต last IP/device + ตรวจบัญชีแฝง (device เดียวกัน)
    const ip = getClientIp(request);
    const deviceId = getDeviceId(request);
    const relatedAccounts = deviceId
      ? await prisma.user.findMany({
          where: {
            id: { not: user.id },
            OR: [{ lastDeviceId: deviceId }, { signupDeviceId: deviceId }],
          },
          select: { username: true },
        })
      : [];
    await prisma.user.update({
      where: { id: user.id },
      data: { lastIp: ip, lastDeviceId: deviceId },
    });
    if (relatedAccounts.length > 0) {
      void logSecurityEvent({
        type: 'ALT_ACCOUNT_SUSPECT',
        severity: 'MEDIUM',
        userId: user.id,
        ip,
        deviceId,
        detail: {
          reason: 'SHARED_DEVICE',
          related: relatedAccounts.map((a) => a.username),
        },
      });
    }

    const token = signSession({ sub: user.id, username: user.username, role: user.role });
    const res = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          role: user.role,
          discoveryEnergy: user.discoveryEnergy,
        },
      },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_TTL_SECONDS));
    return res;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
