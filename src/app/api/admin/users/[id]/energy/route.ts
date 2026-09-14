import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession, auditAdminAction } from '@/lib/admin';

const MAX_ENERGY = 5;

type EnergyMode = 'refill' | 'add' | 'set';

// POST /api/admin/users/[id]/energy — เติมพลังค้นหาให้ผู้เล่น
// body (optional JSON): { mode?: 'refill'|'add'|'set', amount?: number }
//  - refill (default, ไม่ต้องส่ง body): เติมเต็มเป็น 5/5
//  - add: บวกเพิ่ม amount (1..5) แล้ว clamp ไม่เกิน 5
//  - set: ตั้งค่าเป็น amount (0..5)
// ทุกโหมดเป็น integer-only + clamp 0..MAX + audit log
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = getAdminSession(request);
    if (!session) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, username: true, discoveryEnergy: true, isActive: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
    }

    // อ่าน body แบบทนทาน — ไม่มี body = refill เต็ม (backward compatible)
    let mode: EnergyMode = 'refill';
    let amount: number | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.mode === 'string' && ['refill', 'add', 'set'].includes(body.mode)) {
        mode = body.mode as EnergyMode;
      }
      if (body && body.amount !== undefined) amount = Number(body.amount);
    } catch {
      // ไม่มี body — ใช้ refill เป็นค่าเริ่มต้น
    }

    if (mode === 'add' || mode === 'set') {
      if (amount === undefined || !Number.isInteger(amount)) {
        return NextResponse.json({ error: 'จำนวนพลังต้องเป็นจำนวนเต็ม' }, { status: 400 });
      }
      if (mode === 'add' && (amount < 1 || amount > MAX_ENERGY)) {
        return NextResponse.json({ error: `จำนวนที่เติมต้องอยู่ระหว่าง 1–${MAX_ENERGY}` }, { status: 400 });
      }
      if (mode === 'set' && (amount < 0 || amount > MAX_ENERGY)) {
        return NextResponse.json({ error: `ค่าพลังต้องอยู่ระหว่าง 0–${MAX_ENERGY}` }, { status: 400 });
      }
    }

    const before = user.discoveryEnergy;
    let target: number;
    if (mode === 'add') {
      target = Math.min(MAX_ENERGY, before + (amount as number));
    } else if (mode === 'set') {
      target = amount as number;
    } else {
      target = MAX_ENERGY;
    }
    // กันค่าหลุดช่วงเสมอ (integer-only)
    target = Math.max(0, Math.min(MAX_ENERGY, Math.trunc(target)));

    // Atomic + idempotent: refill ใช้เงื่อนไข lt (ไม่แตะถ้าเต็มอยู่แล้ว),
    // add/set อัปเดตตรง (idempotent เมื่อยิงซ้ำด้วยค่าเดิม)
    let writeCount = 0;
    if (mode === 'refill') {
      const result = await prisma.user.updateMany({
        where: { id: params.id, discoveryEnergy: { lt: MAX_ENERGY } },
        data: { discoveryEnergy: MAX_ENERGY, lastEnergyResetAt: new Date() },
      });
      writeCount = result.count;
    } else {
      const result = await prisma.user.updateMany({
        where: { id: params.id },
        data: { discoveryEnergy: target, lastEnergyResetAt: new Date() },
      });
      writeCount = result.count;
    }

    const updated = await prisma.user.findUnique({
      where: { id: params.id },
      select: { discoveryEnergy: true },
    });
    const after = updated?.discoveryEnergy ?? target;

    await auditAdminAction(session, 'REFILL_ENERGY', 'USER', params.id, {
      username: user.username,
      mode,
      amount: amount ?? null,
      before,
      after,
      target,
      touched: writeCount === 1,
    });

    const alreadyFull = mode === 'refill' && writeCount === 0;
    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        username: user.username,
        energy: after,
        max: MAX_ENERGY,
        refilled: writeCount === 1,
        alreadyFull,
        mode,
      },
      message: alreadyFull
        ? `${user.username} มีพลังเต็มอยู่แล้ว (⚡ ${after}/${MAX_ENERGY})`
        : `เติมพลังค้นหาให้ ${user.username} แล้ว (⚡ ${before} → ${after}/${MAX_ENERGY})`,
    });
  } catch (error) {
    console.error('Admin refill energy error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
