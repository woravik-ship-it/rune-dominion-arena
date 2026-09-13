// Admin/Worker guard — ใช้ session role (ADMIN/MODERATOR) หรือ WORKER_TOKEN header (สำหรับ cron)
import { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

export function isPrivileged(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySession(token);
  if (session && (session.role === 'ADMIN' || session.role === 'MODERATOR')) {
    return true;
  }
  const workerToken = process.env.WORKER_TOKEN;
  if (workerToken && request.headers.get('x-worker-token') === workerToken) {
    return true;
  }
  return false;
}
