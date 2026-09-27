// Battle Route — Phase 31.1: ถอดรหัส id ของหน้า /battle/[id]
//
// บั๊กจริงที่พบ (ผู้ใช้แจ้ง 2026-09-27: "เข้าหน้าต่อสู้ไม่ได้จริง"):
//   ดันเจี้ยนใช้ URL `/battle/dungeon-run:<runId>` และ runId เองก็มี `:` อยู่หลายตัว
//   (`<userId>:<CODE>:f<ชั้น>:<เวลา>`) ⇒ Next.js ส่ง `useParams().id` มาเป็นค่าที่ percent-encode
//   (`dungeon-run%3Acmuj…%3AEMBER_CRYPT%3Af1%3A…`) ทำให้ `startsWith('dungeon-run:')` เป็น false
//   → หน้าเว็บยิงไปที่ /api/battle/dungeon-run%3A…/log (404) → ขึ้น "ไม่พบการต่อสู้" ทุกครั้ง
// ⇒ ไฟล์นี้เป็นที่เดียวที่ถอดรหัส/ประกอบ URL (ใช้ร่วมกับเทสต์ได้ ไม่ต้อง render)
const DUNGEON_PREFIX = 'dungeon-run:';

export interface BattleRouteRef {
  kind: 'dungeon' | 'battle';
  /** runId ของดันเจี้ยน หรือ battleId ของศึกปกติ */
  id: string;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // ค่าที่ decode ไม่ได้ (มี % โดด ๆ) → ใช้ค่าเดิม ไม่ให้หน้าจอพัง
    return value;
  }
}

/** อ่าน id ของหน้า /battle/[id] → รู้ว่าเป็นศึกดันเจี้ยนหรือศึกปกติ พร้อม id ที่ถอดรหัสแล้ว */
export function parseBattleRouteId(rawId: string | null | undefined): BattleRouteRef {
  const decoded = safeDecode(String(rawId ?? ''));
  if (decoded.startsWith(DUNGEON_PREFIX)) {
    return { kind: 'dungeon', id: decoded.slice(DUNGEON_PREFIX.length) };
  }
  return { kind: 'battle', id: decoded };
}

/** URL ของ API log ที่ต้องเรียกตามชนิดของศึก (encode id เพื่อให้ id ที่มี ':' ส่งถึงเซิร์ฟเวอร์ถูกต้อง) */
export function battleLogUrl(ref: BattleRouteRef): string {
  const id = encodeURIComponent(ref.id);
  return ref.kind === 'dungeon' ? `/api/dungeons/run/${id}/log` : `/api/battle/${id}/log`;
}

/** URL หน้าเว็บของศึกดันเจี้ยน (ที่เดียวที่ประกอบ path นี้) */
export function dungeonBattlePath(runId: string): string {
  return `/battle/${DUNGEON_PREFIX}${runId}`;
}
