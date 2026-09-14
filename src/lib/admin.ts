// Admin guard + Audit log — Phase 9
// Role-based access: ใช้ User.role (ADMIN/MODERATOR) แทนตาราง AdminUser แยก
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SESSION_COOKIE, verifySession, SessionPayload } from '@/lib/session';

/** ตรวจว่า request มาจาก ADMIN/MODERATOR — คืน session หรือ null */
export function getAdminSession(request: NextRequest): SessionPayload | null {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySession(token);
  if (!session) return null;
  if (session.role !== 'ADMIN' && session.role !== 'MODERATOR') return null;
  return session;
}

/** บันทึก Audit Log ทุก action ของ Admin */
export async function auditAdminAction(
  session: SessionPayload,
  action: string,
  targetType: 'CARD' | 'QUEST' | 'USER' | 'IMAGE' | 'SYSTEM',
  targetId?: string,
  detail?: unknown
): Promise<void> {
  await prisma.adminActionLog.create({
    data: {
      adminId: session.sub,
      adminUsername: session.username,
      action,
      targetType,
      targetId: targetId ?? null,
      detail: detail === undefined ? undefined : (detail as object),
    },
  });
}
