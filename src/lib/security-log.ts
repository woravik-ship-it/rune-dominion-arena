// Security Audit Log — Phase 10
// บันทึกเหตุการณ์ความปลอดภัยลงตาราง security_events (ดูได้ที่ GET /api/admin/security)
// ทุกการบันทึกเป็น fail-safe — พังแล้วแค่ console.error ไม่กระทบ flow หลัก
import { prisma } from '@/lib/prisma';

export type SecurityEventType =
  | 'RATE_LIMIT_BLOCKED'     // โดนบล็อกเพราะยิงถี่เกิน
  | 'BOT_PATTERN'            // ตรวจพบพฤติกรรมบอท
  | 'ALT_ACCOUNT_SUSPECT'    // สงสัยบัญชีแฝง (device/fingerprint ซ้ำ)
  | 'REPLAY_TAMPERED'        // battle replay ไม่ตรงกับการคำนวณใหม่
  | 'AUTH_FAILURE_SPIKE'     // ยิงล็อกอินผิดรัวๆ
  | 'CORS_BLOCKED';          // request จาก origin ต้องห้าม

export type SecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SecurityEventInput {
  type: SecurityEventType;
  severity: SecuritySeverity;
  userId?: string | null;
  ip?: string | null;
  deviceId?: string | null;
  detail?: unknown;
}

/** บันทึกเหตุการณ์ความปลอดภัย (fire-and-forget ได้: void logSecurityEvent(...)) */
export async function logSecurityEvent(evt: SecurityEventInput): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        type: evt.type,
        severity: evt.severity,
        userId: evt.userId ?? null,
        ip: evt.ip ?? null,
        deviceId: evt.deviceId ?? null,
        detail: evt.detail === undefined ? undefined : (evt.detail as object),
      },
    });
  } catch (error) {
    console.error('SecurityEvent log error:', error);
  }
}
