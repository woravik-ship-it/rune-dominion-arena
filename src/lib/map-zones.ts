// ระบบแผนที่ฟาร์ม (Map) — Phase ตามที่ผู้ใช้สั่ง 2026-10-03
//
// กติกา (ผู้ใช้กำหนด):
//  - Stamina หลอดเต็ม 100 · เดินทางหักตามระยะทางจริง **จากจุดที่ยืนอยู่ปัจจุบัน**
//  - ผู้ใช้สั่ง (2026-10-03 รอบ 3): "5 Map ให้แยกกันเลย 1 Map 15 จุด"
//    ⇒ 5 แผนที่แยกกัน (แท็บ/ฉากของตัวเอง) แต่ละแผนที่มี 15 จุด = 75 จุด
//    ⇒ ค่า Stamina คิดจากตำแหน่งจริงของจุดที่ยืนอยู่ (ข้ามแผนที่ = ไกลกว่า = หักมากกว่า)
//  - ใช้ "พลังค้นหา" (discoveryEnergy) เติม Stamina: 1 จุด → +20 · ต่อสู้เหมือนดันเจี้ยน ศัตรูสุ่ม 1-5 ใบ
//  - ชนะ = ได้รางวัล (Item/ฝุ่น/Shards/อัญมณีตีบวก) · แพ้ = ไม่ได้รางวัล
//  - รีเซ็ตทุกวัน (วันใหม่ = Stamina เต็ม)
//
// ไฟล์นี้บริสุทธิ์ (ไม่แตะ DB) ⇒ เทสต์ได้ และเป็นแหล่งเดียวของพิกัด/ค่า Stamina/ตารางดรอป
// แต่ละโซนมีระนาบพิกัดของตัวเอง (x 0..MAP_WIDTH) และวางห่างกันบนระนาบโลกด้วย ZONE_GAP

export const STAMINA_MAX = 100;
/** 1 พลังค้นหา → +20 Stamina */
export const STAMINA_PER_ENERGY = 20;
/** ค่าเดินทาง = ceil(ระยะบนแผนที่ × อัตรานี้) */
export const STAMINA_TRAVEL_RATE = 1.5;
/** ศัตรูสุ่ม 1-5 ใบ */
export const MAP_ENEMY_MIN = 1;
export const MAP_ENEMY_MAX = 5;

/** ความกว้างระนาบของแผนที่แต่ละใบ (ใช้คิด % ตำแหน่งฝั่ง UI) */
export const MAP_WIDTH = 62;
export const MAP_HEIGHT = 24;
/** ระยะห่างระหว่างต้นของแต่ละแผนที่บน "ระนาบโลก" — ยิ่งไกลยิ่งเสีย Stamina ข้ามแผนที่ */
export const MAP_ZONE_GAP = 90;

export type MapZoneId = 'EMBERFIELD' | 'SUNSCAR' | 'FROSTREACH' | 'MOONFALL' | 'VOIDGATE';

export interface MapZone {
  id: MapZoneId;
  nameTh: string;
  name: string;
  icon: string;
  descriptionTh: string;
  /** ความหายากหลักของของในโซน (ใช้โชว์/เทสต์) */
  tier: 1 | 2 | 3;
  /** ธีมภาพพื้นหลังที่ใช้สร้างด้วย AI (สีหลัก + บรรยากาศ) */
  palette: string;
  mood: string;
}

export const MAP_ZONES: MapZone[] = [
  {
    id: 'EMBERFIELD', nameTh: 'ทุ่งเถ้าถ่าน', name: 'Emberfield', icon: '🔥',
    descriptionTh: 'แผ่นดินเถ้าลาวาและเตาโบราณใต้ท้องฟ้าสีแดงเข้ม เปลวไฟริบหรี่ตามรอยแตก',
    tier: 1, palette: 'crimson, orange and gold palette with blackened iron',
    mood: 'fierce and burning',
  },
  {
    id: 'SUNSCAR', nameTh: 'ท้องทะเลทรายสุริยา', name: 'Sunscar', icon: '☀️',
    descriptionTh: 'ทะเลทรายทองกว้างใหญ่กับวิหารสุริยะและโอเอซิสที่ถูกแสงเผาไหม้',
    tier: 2, palette: 'golden sand, amber and burnt umber palette',
    mood: 'harsh, scorching and ancient',
  },
  {
    id: 'FROSTREACH', nameTh: 'ขอบฟ้าน้ำแข็ง', name: 'Frostreach', icon: '❄️',
    descriptionTh: 'ยอดเขาน้ำแข็ง ธารน้ำแข็ง และถ้ำเยือกสีฟ้าขาว ใต้ลมหนาวที่พัดตลอดปี',
    tier: 2, palette: 'deep blue, icy cyan and silver palette',
    mood: 'cold, serene yet dangerous',
  },
  {
    id: 'MOONFALL', nameTh: 'ป่าดาราเขียว', name: 'Moonfall', icon: '🌙',
    descriptionTh: 'ป่าหนาทึบใต้แสงจันทร์สีเขียว หนองควันมรกต และซากศาลาโบราณเรืองแสง',
    tier: 3, palette: 'emerald, moss green and moonlit silver palette',
    mood: 'mystical and ominous',
  },
  {
    id: 'VOIDGATE', nameTh: 'ประตูห้วงเวท', name: 'Voidgate', icon: '🌌',
    descriptionTh: 'ห้วงเวทมืดมิดที่ความจริงแตกเป็นรอยร้าว ม่านหมอกม่วง และดวงตาทั้งหมื่น',
    tier: 3, palette: 'indigo, violet and silver palette with deep black',
    mood: 'mysterious and ominous',
  },
];

export function mapZone(zoneId: string): MapZone | null {
  return MAP_ZONES.find((zone) => zone.id === zoneId) ?? null;
}

export interface MapNode {
  id: string;
  zone: MapZoneId;
  nameTh: string;
  name: string;
  /** พิกัดบนแผนที่ของโซนนั้น (x 0..MAP_WIDTH) — ใช้คำนวณ Stamina ผ่าน nodeGlobalCoords() */
  x: number;
  y: number;
  /** รายการ Item ที่ดรอปได้ (weight — สุ่มเลือก) */
  drops: { code: string; weight: number }[];
  /** โอกาสอัญมณีตีบวก (ต่อ 1000) */
  jewelWeight: number;
  /** ฝุ่นเวทที่ได้เมื่อชนะ */
  dust: number;
  /** Veil Shards ที่ได้เมื่อชนะ */
  shards: number;
}

/** ชื่อ 15 จุดของแต่ละแผนที่ (ไทย) — ใช้สร้าง MAP_NODES */
const ZONE_NODE_NAMES: Record<MapZoneId, string[]> = {
  EMBERFIELD: [
    'ทุ่งรูนรกร้าง', 'ดงไฟมอด', 'เตาเถ้าถ่าน', 'ทางไหม้เกรียม', 'ยอดปล่องเถ้า',
    'ลานหินหลอม', 'ถ้ำโลหะเดือด', 'สะพานไฟลาม', 'หลุมเถ้าร้อน', 'ศาลาเปลวกรุ่น',
    'รอยแตกเพลิง', 'ป่าถ่านยักษ์', 'หุบควันดำ', 'จุดหลอมรูน', 'ดวงตาแห่งเพลิง',
  ],
  SUNSCAR: [
    'เนินทรายสุริยัน', 'หุบเขาแสงจ้า', 'วิหารสุริยะกราบ', 'โอเอซิสไหม้', 'ทุ่งหินทราย',
    'บัลลังก์ดวงอาทิตย์', 'ปากถ้ำทะเลทราย', 'ลานน้ำค้างทอง', 'ศิลาแผดเผา', 'ทางเกลือขาว',
    'หอคอยมิราจ', 'ทะเลธุลี', 'แอ่งสุริยันตาย', 'กันดารเปลวทอง', 'ใจกลางดวงตะวัน',
  ],
  FROSTREACH: [
    'ธารน้ำแข็ง', 'ถ้ำหมอกเยือก', 'ยอดเขาหวิว', 'ที่ราบหิมะนิ่ง', 'ผาน้ำแข็งคราม',
    'บ่อน้ำแข็งลึก', 'ป่าเข็มเยือก', 'รอยแยกธาร', 'ศาลาน้ำแข็ง', 'ลานน้ำค้างแข็ง',
    'อุโมงค์เยือกแข็ง', 'สะพานลมหนาว', 'ยอดเขาน้ำแข็งขาว', 'ดวงตาหิมะ', 'แกนกลางเยือกนิรันดร์',
  ],
  MOONFALL: [
    'ป่าดาราเขียว', 'หนองควันมรกต', 'ศาลาจันทร์เขียว', 'เรือนยอดเรืองแสง', 'แอ่งมูนสโตน',
    'รากโบราณเขียว', 'พลบค่ำมรกต', 'ถ้ำแสงจันทร์', 'ทุ่งเห็ดเรือง', 'สระเดือนใบ้',
    'หุบดาวหล่น', 'คฤหาสน์เถาวัลย์', 'ทางเดินใบไม้รำไร', 'บัลลังก์มรกต', 'ใจกลางจันทร์สีเขียว',
  ],
  VOIDGATE: [
    'ม่านห้วงเวท', 'เกลียวระแหง', 'รอยแยกนิรันดร์', 'ประตูหมอกม่วง', 'ดวงตาว่างเปล่า',
    'เสาห้วงหมุน', 'หลุมไร้ก้น', 'ศาลาเงาสะท้อน', 'บันไดดาวร่วง', 'ปราสาทห้วงมืด',
    'จุดแตกความจริง', 'หอคอยอักษรต้องห้าม', 'ทะเลหมอกเวท', 'แกนกลางความว่าง', 'ดวงตาแห่งนิรันดร์',
  ],
};

/** ของดรอปของแต่ละแผนที่ (อยู่ในแคตตาล็อกแล้ว) */
const ZONE_DROP_POOL: Record<MapZoneId, string[]> = {
  EMBERFIELD: ['ATK_WHETSTONE', 'DEF_OAK_BUCKLER', 'SUP_TRAVELERS_AMULET', 'ATK_ASHEN_SPIKE', 'DEF_PEBBLE_WARD'],
  SUNSCAR: ['ATK_HUNTERS_TALON', 'ATK_SPARK_SHARD', 'SUP_SWIFT_CHARM', 'DEF_IRONWEAVE', 'SUP_DAWNHEART'],
  FROSTREACH: ['ATK_FROSTBRAND', 'DEF_TIDEWALL', 'ATK_TEMPEST_EDGE', 'SUP_WINDWHISPER', 'DEF_STORMBULWARK'],
  MOONFALL: ['DEF_MOONPLATE', 'SUP_MOONLIT_TONIC', 'SUP_WORLDSEED', 'ATK_MOONLESS_BLADE', 'DEF_ETERNAL_AEGIS'],
  VOIDGATE: ['ATK_RIFTRENDER', 'SUP_SELENE_SIGIL', 'ATK_SUNFORGED', 'DEF_VEILGUARD', 'SUP_STARLIGHT_CORE', 'ATK_VOIDREAVER'],
};

/** ค่ารางวัลของแต่ละแผนที่ (ฐาน + เพิ่มตามลำดับจุด — ยิ่งไกลยิ่งดี) */
const ZONE_CFG: Record<MapZoneId, { jewelB: number; jewelS: number; dustB: number; dustS: number; shardB: number; shardS: number }> = {
  EMBERFIELD: { jewelB: 40, jewelS: 18, dustB: 5, dustS: 3, shardB: 1, shardS: 0.4 },
  SUNSCAR: { jewelB: 80, jewelS: 22, dustB: 10, dustS: 4, shardB: 3, shardS: 0.5 },
  FROSTREACH: { jewelB: 90, jewelS: 22, dustB: 12, dustS: 4, shardB: 4, shardS: 0.6 },
  MOONFALL: { jewelB: 140, jewelS: 26, dustB: 18, dustS: 5, shardB: 6, shardS: 0.7 },
  VOIDGATE: { jewelB: 190, jewelS: 30, dustB: 24, dustS: 6, shardB: 8, shardS: 0.9 },
};

/** พิกัด 15 จุด (กระจายทั่วระนาบของแผนที่ — ตรวจว่าไม่ซ้อนกันในเทสต์) */
const NODE_X = [5, 16, 28, 40, 53, 10, 24, 36, 50, 7, 20, 32, 45, 58, 14];
const NODE_Y = [9, 17, 6, 16, 21, 8, 18, 5, 14, 20, 11, 19, 7, 16, 22];

/** 75 จุด = 5 แผนที่ × 15 จุด (id ไม่ซ้ำ: <โซน>-n1..n15) */
export const MAP_NODES: MapNode[] = (Object.keys(ZONE_NODE_NAMES) as MapZoneId[]).flatMap((zoneId) => {
  const zone = mapZone(zoneId)!;
  const cfg = ZONE_CFG[zoneId];
  const pool = ZONE_DROP_POOL[zoneId];
  return ZONE_NODE_NAMES[zoneId].map((nameTh, i) => ({
    id: `${zoneId}-n${i + 1}`,
    zone: zoneId,
    nameTh,
    name: `${zone.name} Node ${i + 1}`,
    x: NODE_X[i],
    y: NODE_Y[i],
    // หมุนหยิบ 3 ตัวจากของกลางโซน (จุดละไม่ซ้ำกัน)
    drops: [0, 2, 4].map((k, di) => ({
      code: pool[(i + k) % pool.length],
      weight: di === 0 ? 40 : 35,
    })),
    jewelWeight: Math.round(cfg.jewelB + i * cfg.jewelS),
    dust: Math.round(cfg.dustB + i * cfg.dustS),
    shards: Math.max(1, Math.round(cfg.shardB + i * cfg.shardS)),
  }));
});

/** ตำแหน่งต้นของแผนที่บน "ระนาบโลก" (แผนที่ถัดไปไกลออกไป ใช้ทำให้ข้ามแผนที่เสีย Stamina มาก) */
export function zoneGlobalOffset(zoneId: string): number {
  const index = MAP_ZONES.findIndex((zone) => zone.id === zoneId);
  return Math.max(0, index) * MAP_ZONE_GAP;
}

/** พิกัดจริงบนระนาบโลกของจุด (x รวม offset ของแผนที่นั้น) — ใช้คิด Stamina ข้ามแผนที่ */
export function nodeGlobalCoords(node: { zone: string; x: number; y: number }): { x: number; y: number } {
  return { x: zoneGlobalOffset(node.zone) + node.x, y: node.y };
}

export function findMapNode(id: string): MapNode | null {
  return MAP_NODES.find((node) => node.id === id) ?? null;
}

/** จุดทั้งหมดของแผนที่ (โซน) หนึ่ง */
export function nodesInZone(zoneId: MapZoneId): MapNode[] {
  return MAP_NODES.filter((node) => node.zone === zoneId);
}

/**
 * โซนเริ่มต้นที่หน้าจอควรแสดง — **โซนของจุดที่ผู้เล่นยืนอยู่** ไม่ใช่โซนแรกเสมอ
 *
 * ผู้ใช้สั่ง 2026-10-07: *"ใน Map ให้แสดง Map ที่ผู้เล่นอยู่ เป็นหน้าปัจจุบัน"*
 * (ของเดิมเริ่มที่ EMBERFIELD ทุกครั้ง ⇒ ต้องกดแท็บเองทุกครั้งที่เปิดหน้า ทั้งที่อยู่โซนอื่น)
 */
export function initialActiveZone(
  nodes: ReadonlyArray<{ id: string; zone: string }>,
  currentNodeId: string | null | undefined,
  fallbackZone: string
): string {
  const current = currentNodeId ? nodes.find((node) => node.id === currentNodeId) : undefined;
  if (current) return current.zone;
  return nodes.some((node) => node.zone === fallbackZone) ? fallbackZone : (nodes[0]?.zone ?? fallbackZone);
}

/** จุดอ้างอิงใด ๆ — จุดจริง (มี zone) หรือพิกัดล้วน */
export type MapPoint = { x: number; y: number; zone?: string | null } | MapNode;

/** แปลงจุดอ้างอิงให้เป็นพิกัดบนระนาบโลก (จุดที่ไม่มี zone = พิกัดโลกตรง ๆ) */
export function pointGlobalCoords(p: MapPoint | null): { x: number; y: number } {
  if (!p) return { x: 0, y: 0 };
  const zone = (p as { zone?: string | null }).zone;
  if (typeof zone === 'string' && zone) return nodeGlobalCoords({ zone, x: p.x, y: p.y });
  return { x: p.x, y: p.y };
}

/**
 * ค่า Stamina ในการเดินทาง **จากจุดที่ยืนอยู่** → เป้าหมาย (คิดจากพิกัดจริงบนระนาบโลก)
 * - จากยอมรับ MapNode (มี zone) หรือพิกัด {x,y} ล้วน หรือ null (= ยังอยู่จุดเริ่มต้น 0,0)
 * - พิกัดของเป้าหมายจะแปลงเป็นพิกัดโลกเสมอ ⇒ ระยะทางอิงจุดปัจจุบันจริง + ข้ามแผนที่ไกลกว่า
 */
export function travelStaminaCost(from: MapPoint | null, to: MapNode): number {
  const start = pointGlobalCoords(from);
  const end = nodeGlobalCoords(to);
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  return Math.max(3, Math.ceil(dist * STAMINA_TRAVEL_RATE));
}

/** ตารางดรอปทั้งหมดในแมป (ใช้คำนวณ/เทสต์) */
export function mapDropPool(): Map<MapZoneId, string[]> {
  const out = new Map<MapZoneId, string[]>();
  for (const zone of MAP_ZONES) out.set(zone.id, []);
  for (const node of MAP_NODES) {
    const list = out.get(node.zone) ?? [];
    for (const drop of node.drops) if (!list.includes(drop.code)) list.push(drop.code);
  }
  return out;
}

/** จำนวนศัตรูสุ่ม (รอบไหนก็ได้ 1..5) — ใช้ร้านั้น ไม่ใช่ภายในรอบ */
export function pickEnemyCount(randomInt: (max: number) => number): number {
  const min = MAP_ENEMY_MIN;
  const max = MAP_ENEMY_MAX;
  return min + randomInt(max - min + 1);
}