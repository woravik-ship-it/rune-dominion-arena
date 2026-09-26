import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession, auditAdminAction } from '@/lib/admin';
import { checkManageUser, normalizeAdminRole, ROLE_LABEL_TH } from '@/lib/admin-users';

// PATCH /api/admin/users/[id] — กำหนดสิทธิ์ / แบน / ปลดแบน (Phase 29)
//
// ผู้ใช้สั่ง 2026-09-27: "เมนูสำหรับจัดการผู้เล่น หรือกำหนดสิทธิ์ผู้เล่น แบนผู้เล่น หรือลบผู้เล่น"
// body: { role?: 'PLAYER'|'MODERATOR'|'ADMIN', isActive?: boolean, reason?: string }
//  - role     = เปลี่ยนสิทธิ์ (แอดมินเท่านั้น)
//  - isActive = false → แบน (ล็อกอินไม่ได้ทันที + session เดิมใช้ไม่ได้) · true → ปลดแบน
//  - กติกาความปลอดภัยมาจาก src/lib/admin-users.ts (ห้ามจัดการตัวเอง · ห้ามแตะบัญชีแอดมิน)
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = getAdminSession(request);
    if (!session) return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as {
      role?: unknown;
      isActive?: unknown;
      reason?: unknown;
    };
    const wantsRole = body.role !== undefined;
    const wantsActive = body.isActive !== undefined;

    if (!wantsRole && !wantsActive) {
      return NextResponse.json({ error: 'ต้องส่ง role หรือ isActive มาอย่างน้อยหนึ่งอย่าง' }, { status: 400 });
    }
    if (wantsActive && typeof body.isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive ต้องเป็น true/false' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, username: true, role: true, isActive: true },
    });
    if (!target) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });

    // ---- เปลี่ยนสิทธิ์ ----
    if (wantsRole) {
      const nextRole = normalizeAdminRole(body.role);
      const verdict = checkManageUser({
        actorId: session.sub,
        actorRole: session.role,
        targetId: target.id,
        targetRole: target.role,
        action: 'changeRole',
        nextRole: body.role,
      });
      if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 400 });
      if (!nextRole) return NextResponse.json({ error: 'สิทธิ์ไม่ถูกต้อง' }, { status: 400 });

      // ต้องเหลือแอดมินอย่างน้อย 1 คน (กันระบบไม่มีคนดูแล)
      if (target.role === 'ADMIN' && nextRole !== 'ADMIN') {
        const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
        if (adminCount <= 1) {
          return NextResponse.json({ error: 'ต้องมีแอดมินอย่างน้อย 1 คนในระบบ' }, { status: 400 });
        }
      }

      const updated = await prisma.user.update({
        where: { id: target.id },
        data: { role: nextRole },
        select: { id: true, username: true, role: true, isActive: true },
      });
      await auditAdminAction(session, 'UPDATE_USER_ROLE', 'USER', target.id, {
        username: target.username,
        from: target.role,
        to: nextRole,
        reason: typeof body.reason === 'string' ? body.reason.slice(0, 200) : null,
      });
      return NextResponse.json({
        success: true,
        data: updated,
        message: `เปลี่ยนสิทธิ์ ${target.username} เป็น ${ROLE_LABEL_TH[nextRole]} แล้ว`,
      });
    }

    // ---- แบน / ปลดแบน ----
    const nextActive = body.isActive as boolean;
    const verdict = checkManageUser({
      actorId: session.sub,
      actorRole: session.role,
      targetId: target.id,
      targetRole: target.role,
      action: nextActive ? 'unban' : 'ban',
    });
    if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 400 });
    if (target.isActive === nextActive) {
      return NextResponse.json({
        success: true,
        data: target,
        message: nextActive ? `${target.username} ใช้งานได้อยู่แล้ว` : `${target.username} ถูกแบนอยู่แล้ว`,
      });
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { isActive: nextActive },
      select: { id: true, username: true, role: true, isActive: true },
    });
    await auditAdminAction(session, nextActive ? 'UNBAN_USER' : 'BAN_USER', 'USER', target.id, {
      username: target.username,
      reason: typeof body.reason === 'string' ? body.reason.slice(0, 200) : null,
    });
    return NextResponse.json({
      success: true,
      data: updated,
      message: nextActive
        ? `ปลดแบน ${target.username} แล้ว (เข้าเล่นได้ตามปกติ)`
        : `แบน ${target.username} แล้ว (ล็อกอินไม่ได้ทันที · session เดิมใช้ไม่ได้)`,
    });
  } catch (error) {
    console.error('Admin update user error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] — ลบผู้เล่น (Phase 29 · แอดมินเท่านั้น)
// body: { confirmUsername } ต้องพิมพ์ชื่อผู้ใช้ให้ตรง (กันกดพลาด)
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = getAdminSession(request);
    if (!session) return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as { confirmUsername?: unknown };
    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, username: true, role: true, isActive: true },
    });
    if (!target) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });

    const verdict = checkManageUser({
      actorId: session.sub,
      actorRole: session.role,
      targetId: target.id,
      targetRole: target.role,
      action: 'delete',
    });
    if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 400 });

    if (typeof body.confirmUsername !== 'string' || body.confirmUsername.trim() !== target.username) {
      return NextResponse.json(
        { error: `ต้องพิมพ์ชื่อผู้ใช้ "${target.username}" ให้ตรงเพื่อยืนยันการลบ` },
        { status: 400 }
      );
    }

    // นับของที่จะหายไปด้วย (รายงานให้แอดมินรู้ว่าลบอะไรไปบ้าง)
    const [cards, decks, battles, notifications] = await Promise.all([
      prisma.userCard.count({ where: { userId: target.id } }),
      prisma.deck.count({ where: { userId: target.id } }),
      prisma.battleLog.count({ where: { attackerId: target.id } }),
      prisma.notification.count({ where: { userId: target.id } }),
    ]);

    await prisma.user.delete({ where: { id: target.id } });
    await auditAdminAction(session, 'DELETE_USER', 'USER', target.id, {
      username: target.username,
      role: target.role,
      removed: { cards, decks, battles, notifications },
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: target.id,
        username: target.username,
        removed: { cards, decks, battles, notifications },
      },
      message: `ลบผู้เล่น ${target.username} แล้ว (การ์ด ${cards} · ทีม ${decks} · ศึก ${battles} · แจ้งเตือน ${notifications})`,
    });
  } catch (error) {
    console.error('Admin delete user error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

