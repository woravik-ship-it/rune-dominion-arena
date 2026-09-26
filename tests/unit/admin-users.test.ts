// เทสต์กติกาการจัดการผู้เล่นของแอดมิน (Phase 29)
// ผู้ใช้สั่ง 2026-09-27: "เมนูสำหรับจัดการผู้เล่น หรือกำหนดสิทธิ์ผู้เล่น แบนผู้เล่น หรือลบผู้เล่น"
import {
  ACTION_LABEL_TH,
  ADMIN_ROLES,
  ROLE_LABEL_TH,
  checkManageUser,
  isAdminRole,
  isStaffRole,
  normalizeAdminRole,
} from '@/lib/admin-users';

const base = {
  actorId: 'admin-1',
  actorRole: 'ADMIN',
  targetId: 'player-1',
  targetRole: 'PLAYER',
};

describe('ค่าเริ่มต้นของสิทธิ์', () => {
  test('มี 3 สิทธิ์: ผู้เล่น / ผู้ดูแล / แอดมิน', () => {
    expect(ADMIN_ROLES).toEqual(['PLAYER', 'MODERATOR', 'ADMIN']);
    expect(ROLE_LABEL_TH.ADMIN).toBe('แอดมิน');
    expect(ROLE_LABEL_TH.MODERATOR).toBe('ผู้ดูแล');
    expect(ROLE_LABEL_TH.PLAYER).toBe('ผู้เล่น');
  });

  test('normalizeAdminRole รับเฉพาะค่าที่รู้จัก', () => {
    expect(normalizeAdminRole('ADMIN')).toBe('ADMIN');
    expect(normalizeAdminRole('MODERATOR')).toBe('MODERATOR');
    expect(normalizeAdminRole('player')).toBeNull();
    expect(normalizeAdminRole('SUPERADMIN')).toBeNull();
    expect(normalizeAdminRole(undefined)).toBeNull();
  });

  test('ช่วยแยกบทบาทเจ้าหน้าที่', () => {
    expect(isAdminRole('ADMIN')).toBe(true);
    expect(isAdminRole('MODERATOR')).toBe(false);
    expect(isStaffRole('MODERATOR')).toBe(true);
    expect(isStaffRole('PLAYER')).toBe(false);
  });

  test('มีป้ายชื่อการกระทำครบ 4 อย่าง', () => {
    expect(Object.keys(ACTION_LABEL_TH).sort()).toEqual(['ban', 'changeRole', 'delete', 'unban']);
  });
});

describe('กติกา: ใครทำอะไรได้', () => {
  test('ผู้เล่นทั่วไปจัดการใครไม่ได้', () => {
    const verdict = checkManageUser({ ...base, actorRole: 'PLAYER', action: 'ban' });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('ผู้ดูแลระบบ');
  });

  test('ห้ามจัดการบัญชีตัวเองทุกกรณี', () => {
    for (const action of ['changeRole', 'ban', 'unban', 'delete'] as const) {
      const verdict = checkManageUser({
        ...base,
        actorId: 'same',
        targetId: 'same',
        action,
        nextRole: 'PLAYER',
      });
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toContain('ตัวเอง');
    }
  });

  test('แอดมินเปลี่ยนสิทธิ์ผู้เล่นได้ (PLAYER → MODERATOR/ADMIN)', () => {
    expect(checkManageUser({ ...base, action: 'changeRole', nextRole: 'MODERATOR' }).ok).toBe(true);
    expect(checkManageUser({ ...base, action: 'changeRole', nextRole: 'ADMIN' }).ok).toBe(true);
  });

  test('ผู้ดูแล (MODERATOR) เปลี่ยนสิทธิ์ไม่ได้ · แต่แบน/ปลดแบนผู้เล่นได้', () => {
    expect(checkManageUser({ ...base, actorRole: 'MODERATOR', action: 'changeRole', nextRole: 'ADMIN' }).ok).toBe(false);
    expect(checkManageUser({ ...base, actorRole: 'MODERATOR', action: 'ban' }).ok).toBe(true);
    expect(checkManageUser({ ...base, actorRole: 'MODERATOR', action: 'unban' }).ok).toBe(true);
  });

  test('ผู้ดูแลลบผู้เล่นไม่ได้ (แอดมินเท่านั้น)', () => {
    const verdict = checkManageUser({ ...base, actorRole: 'MODERATOR', action: 'delete' });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('แอดมิน');
  });

  test('ห้ามแบน/ลบบัญชีแอดมิน (ต้องลดสิทธิ์ก่อน)', () => {
    const targetAdmin = { ...base, targetId: 'admin-2', targetRole: 'ADMIN' };
    for (const action of ['ban', 'unban', 'delete'] as const) {
      const verdict = checkManageUser({ ...targetAdmin, action });
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toContain('แอดมิน');
    }
  });

  test('แอดมินลดสิทธิ์แอดมินคนอื่นได้ (เหลือ ≥1 คน — ตรวจที่ route)', () => {
    expect(
      checkManageUser({
        ...base,
        targetId: 'admin-2',
        targetRole: 'ADMIN',
        action: 'changeRole',
        nextRole: 'MODERATOR',
      }).ok
    ).toBe(true);
  });

  test('เปลี่ยนสิทธิ์เป็นค่าเดิม / ค่าเพี้ยน → ปฏิเสธ', () => {
    const same = checkManageUser({ ...base, action: 'changeRole', nextRole: 'PLAYER' });
    expect(same.ok).toBe(false);
    expect(same.reason).toContain('อยู่แล้ว');

    const invalid = checkManageUser({ ...base, action: 'changeRole', nextRole: 'GOD' });
    expect(invalid.ok).toBe(false);
    expect(invalid.reason).toContain('ไม่ถูกต้อง');
  });

  test('แบน/ปลดแบนผู้เล่นทั่วไปได้ทั้งแอดมินและผู้ดูแล', () => {
    expect(checkManageUser({ ...base, action: 'ban' }).ok).toBe(true);
    expect(checkManageUser({ ...base, action: 'unban' }).ok).toBe(true);
    expect(checkManageUser({ ...base, actorRole: 'MODERATOR', action: 'unban' }).ok).toBe(true);
  });
});
