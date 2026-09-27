// Battle Route (Phase 31.1) — บั๊กจริง: id ใน URL ถูก percent-encode ทำให้หน้าดันเจี้ยนเปิดไม่ติด
import { battleLogUrl, dungeonBattlePath, parseBattleRouteId } from '@/lib/battle-route';

describe('parseBattleRouteId — อ่าน id ของหน้า /battle/[id]', () => {
  const runId = 'cmuj5dnpz002win6but075yhj:EMBER_CRYPT:f1:1790472972923';

  test('ดันเจี้ยน: อ่านได้ทั้งแบบดิบและแบบ percent-encode (เคสที่ทำให้ "ไม่พบการต่อสู้")', () => {
    const raw = `dungeon-run:${runId}`;
    const encoded = encodeURIComponent(raw);
    expect(encoded).toContain('%3A');

    expect(parseBattleRouteId(raw)).toEqual({ kind: 'dungeon', id: runId });
    expect(parseBattleRouteId(encoded)).toEqual({ kind: 'dungeon', id: runId });
    // ค่าที่ Next ส่งมาแบบ encode ทั้งพาธ (มี %3A แทน ':') ต้องไม่ตกไปเป็นศึกปกติ
    expect(parseBattleRouteId(`dungeon-run%3A${encodeURIComponent(runId)}`).kind).toBe('dungeon');
  });

  test('ศึกปกติ: คืน battleId เดิม (ไม่แตะพาธ)', () => {
    expect(parseBattleRouteId('cmuj5kc9a0000mqdvk0cfm6am')).toEqual({
      kind: 'battle', id: 'cmuj5kc9a0000mqdvk0cfm6am',
    });
    expect(parseBattleRouteId(undefined)).toEqual({ kind: 'battle', id: '' });
    // ค่าที่ decode ไม่ได้ต้องไม่ทำให้หน้าเว็บพัง
    expect(parseBattleRouteId('bad%')).toEqual({ kind: 'battle', id: 'bad%' });
  });

  test('ประกอบ URL ของ API log ให้ id ที่มี ":" ส่งถึงเซิร์ฟเวอร์ถูกต้อง', () => {
    expect(battleLogUrl({ kind: 'dungeon', id: runId })).toBe(`/api/dungeons/run/${encodeURIComponent(runId)}/log`);
    expect(battleLogUrl({ kind: 'battle', id: 'abc' })).toBe('/api/battle/abc/log');
  });

  test('path ของหน้าศึกดันเจี้ยน (ที่เดียวที่ประกอบ path นี้)', () => {
    expect(dungeonBattlePath(runId)).toBe(`/battle/dungeon-run:${runId}`);
    // ต้องเป็น path ที่หน้า /battle/[id] จับได้ (ไม่มีอักขระ / เพิ่ม)
    expect(dungeonBattlePath(runId).split('/').filter(Boolean)).toHaveLength(2);
  });
});
