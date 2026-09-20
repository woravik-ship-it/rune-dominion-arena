import { NextRequest, NextResponse } from 'next/server';
import { DiscoveryService } from '@/services/discovery';
import { resolveRequestUserId } from '@/lib/current-user';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const param = searchParams.get('userId');

    // ยึด session cookie ก่อน → fallback param (username/cuid)
    const resolvedUserId = await resolveRequestUserId(request, param);
    if (!resolvedUserId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    // ผ่าน Service เพื่อให้ lazy daily refill ทำงานด้วย
    const energy = await DiscoveryService.getEnergy(resolvedUserId);

    return NextResponse.json({
      success: true,
      energy,
    });
  } catch (error) {
    console.error('Get energy error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
