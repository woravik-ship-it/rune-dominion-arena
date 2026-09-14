import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession, auditAdminAction } from '@/lib/admin';

// PATCH /api/admin/cards/[id] — แก้ไขข้อมูลการ์ด (ชื่อ/คำอธิบาย/lore)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = getAdminSession(request);
    if (!session) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { name, nameTh, descriptionTh, loreTh } = body as {
      name?: string;
      nameTh?: string;
      descriptionTh?: string;
      loreTh?: string;
    };

    const card = await prisma.cardDefinition.findUnique({ where: { id: params.id } });
    if (!card) {
      return NextResponse.json({ error: 'ไม่พบการ์ด' }, { status: 404 });
    }

    const updated = await prisma.cardDefinition.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name: name.trim() || card.name }),
        ...(nameTh !== undefined && { nameTh: nameTh.trim() || null }),
        ...(descriptionTh !== undefined && { descriptionTh: descriptionTh.trim() || null }),
        ...(loreTh !== undefined && { loreTh: loreTh.trim() || null }),
      },
    });

    await auditAdminAction(session, 'UPDATE_CARD', 'CARD', params.id, {
      before: { name: card.name, nameTh: card.nameTh, loreTh: card.loreTh },
      after: { name: updated.name, nameTh: updated.nameTh, loreTh: updated.loreTh },
    });

    return NextResponse.json({ success: true, data: { id: updated.id, name: updated.name, nameTh: updated.nameTh } });
  } catch (error) {
    console.error('Admin update card error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

// GET /api/admin/cards/[id] — รายละเอียดการ์ดสำหรับแก้ไข
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!getAdminSession(request)) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
    }
    const card = await prisma.cardDefinition.findUnique({ where: { id: params.id } });
    if (!card) {
      return NextResponse.json({ error: 'ไม่พบการ์ด' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: card });
  } catch (error) {
    console.error('Admin get card error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
