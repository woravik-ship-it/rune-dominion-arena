// GET /api/health — Phase 12: uptime + สถานะ DB + เวอร์ชัน (ใช้กับ monitoring/uptime checker)
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const startedAt = Date.now();

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // ตรวจ DB ด้วย query เบา ๆ พร้อมจับเวลา
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true, detail: `${Date.now() - dbStart}ms` };
  } catch (error) {
    checks.database = {
      ok: false,
      detail: error instanceof Error ? error.message.slice(0, 120) : 'unknown error',
    };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      version: process.env.APP_VERSION ?? 'beta',
      environment: process.env.NODE_ENV ?? 'development',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
