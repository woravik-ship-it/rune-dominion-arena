// Map Farm Service (Phase 2026-10-03) — แผนที่ฟาร์ม Item (เลือกจุดอิสระ)
//
// กติกา (ตามที่ผู้ใช้กำหนด):
//  - Stamina หลอดเต็ม 100 · เดินทางหัก Stamina ตามระยะ (ยิ่งไกลยิ่งหักมาก)
//  - ผู้ใช้สั่ง (2026-10-03 รอบ 2): "ไม่ต้องทำลำดับการเดิน · กลับจุดเก่าได้
//    แต่ต้องไม่ใช่จุดที่อยู่ปัจจุบัน · เลือกจุดเดินได้หมดใน Map"
//    ⇒ จุดที่ยืนอยู่ = จุดที่ฟาร์มล่าสุด · เลือกไปจุดไหนก็ได้ยกเว้นจุดที่ยืนอยู่ · ค่าเดินทางคิดจากระยะทางจริง
//  - ต่อสู้เหมือนดันเจี้ยน แต่ศัตรูสุ่ม 1-5 ใบ · ชนะ = ได้รางวัล (Item/ฝุ่น/Shards/อัญมณีตีบวก)
//  - ม้วนผลที่เซิร์ฟเวอร์ (randomInt) + idempotency ด้วย runId (กันรีดซ้ำ/กดซ้ำ)
//  - ชนะ/แพ้เก็บ log ทุกครั้ง → ดู replay เต็มได้ที่ /battle/map-run:<runId>
import { prisma } from '@/lib/prisma';
import { randomInt } from 'node:crypto';
import {
  MAP_NODES,
  STAMINA_MAX,
  STAMINA_PER_ENERGY,
  findMapNode,
  pickEnemyCount,
  travelStaminaCost,
} from '@/lib/map-zones';
import { deckToCombatCards } from '@/services/battle-api';
import { buildBattleSeed, type CombatCard } from '@/services/combat';
import { simulateBattle } from '@/services/combat-engine';
import { InventoryService } from '@/services/inventory';
import { CRAFTING_DUST_CODE, CRAFTING_DUST_NAME_TH, ENHANCE_JEWEL_CODE } from '@/services/inventory';
import { ItemService } from '@/services/item';
import { creditVeilShards } from '@/services/veil-shard';
import { DiscoveryService } from '@/services/discovery';
import { findItemDef } from '@/lib/item-definitions';
import { ENHANCE_JEWEL_NAME_TH, ENHANCE_JEWEL_TYPE } from '@/lib/item-enhance';
import { mapBattlePath } from '@/lib/battle-route';

export interface MapNodeState {
  id: string;
  zone: string;
  nameTh: string;
  x: number;
  y: number;
  /** เคยไปสู้ที่จุดนี้แล้ว (จากประวัติการฟาร์ม) */
  visited: boolean;
  /** จุดที่ยืนอยู่ตอนนี้ — ต้องเลือกไปจุดอื่น */
  current: boolean;
  /** Stamina ที่ต้องใช้เดินทางจากจุดที่ยืนอยู่มาที่จุดนี้ (0 = จุดที่ยืนอยู่) */
  cost: number;
  enemyCountHint: string;
  jewelChanceLabel: string;
  drops: { code: string; nameTh: string }[];
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** รีเซ็ต Stamina ทุกวัน (lazy) — ตำแหน่งคงไว้ (เส้นทางอิสระไม่ต้องเริ่มต้นใหม่) */
async function ensureMapDailyReset(userId: string): Promise<{ stamina: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mapStamina: true, mapStaminaResetAt: true },
  });
  if (!user) throw new Error('ไม่พบผู้ใช้');
  if (!user.mapStaminaResetAt || user.mapStaminaResetAt < startOfToday()) {
    await prisma.user.update({
      where: { id: userId },
      data: { mapStamina: STAMINA_MAX, mapStaminaResetAt: new Date() },
    });
    return { stamina: STAMINA_MAX };
  }
  return { stamina: user.mapStamina };
}

/** จุดที่ "ยืนอยู่" = จุดที่ฟาร์มครั้งล่าสุด (ไม่มีประวัติ = ยังอยู่จุดเริ่มต้น 0,0) */
async function currentNodeId(userId: string): Promise<string | null> {
  const last = await prisma.mapFarmLog.findFirst({
    where: { userId },
    select: { nodeId: true },
    orderBy: { createdAt: 'desc' },
  });
  return last?.nodeId ?? null;
}

/** เลือกไอเทมดรอปแบบถ่วงน้ำหนักด้วย randomInt (0..total-1) */
function weightedPick(
  entries: { code: string; weight: number }[],
  rnd: (n: number) => number
): string | null {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0 || entries.length === 0) return null;
  let roll = rnd(total);
  for (const entry of entries) {
    if ((roll -= entry.weight) < 0) return entry.code;
  }
  return entries[entries.length - 1]?.code ?? null;
}

/** ทีมศัตรูสุ่ม 1-5 ใบจากคลังการ์ดทั้งหมด */
async function buildRandomEnemyTeam(count: number): Promise<CombatCard[] | null> {
  const pool = await prisma.cardDefinition.findMany({
    select: {
      id: true, name: true, nameTh: true, element: true,
      atk: true, def: true, hp: true, spd: true,
    },
    take: 200,
    orderBy: { createdAt: 'asc' },
  });
  if (pool.length < 1) return null;
  const start = randomInt(Math.max(1, pool.length - count + 1));
  const picked = pool.slice(start, start + Math.min(count, pool.length));
  return picked.map((c) => ({
    cardId: c.id,
    name: c.name,
    nameTh: c.nameTh,
    element: c.element,
    atk: c.atk,
    def: c.def,
    hp: c.hp,
    spd: c.spd,
  }));
}

export interface MapRewards {
  dust: number;
  shards: number;
  itemCode: string | null;
  itemNameTh: string | null;
  jewel: number;
}

/** กลิ้งรางวัล (ใช้เฉพาะตอนชนะ) — แยกกลับมาเพื่อเทสต์ได้ */
export function rollMapRewards(
  node: { dust: number; shards: number; drops: { code: string; weight: number }[]; jewelWeight: number },
  rnd: (n: number) => number
): MapRewards {
  const itemCode = weightedPick(node.drops, rnd);
  const itemDef = itemCode ? findItemDef(itemCode) : null;
  return {
    dust: node.dust,
    shards: node.shards,
    itemCode,
    itemNameTh: itemDef?.nameTh ?? itemDef?.name ?? null,
    jewel: rnd(1000) < node.jewelWeight ? 1 : 0,
  };
}
export class MapFarmService {
  /** สถานะแผนที่ — Stamina/พลังค้นหา/จุดที่ยืนอยู่/ทุกจุดพร้อมค่าเดินทาง (เลือกได้ทุกจุดยกเว้นจุดที่ยืน) */
  static async state(userId: string) {
    const { stamina } = await ensureMapDailyReset(userId);
    const [energy, decks, wallet, runs] = await Promise.all([
      DiscoveryService.getEnergy(userId),
      prisma.deck.findMany({
        where: { userId },
        select: { id: true, name: true },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.wallet.findUnique({ where: { userId }, select: { balance: true } }),
      prisma.mapFarmLog.findMany({
        where: { userId },
        select: { nodeId: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const visitedIds = new Set(runs.map((r) => r.nodeId));
    const currentId = runs[0]?.nodeId ?? null;
    const from = currentId ? findMapNode(currentId) : null;

    const nodes: MapNodeState[] = MAP_NODES.map((node) => ({
      id: node.id,
      zone: node.zone,
      nameTh: node.nameTh,
      x: node.x,
      y: node.y,
      visited: visitedIds.has(node.id),
      current: node.id === currentId,
      cost: node.id === currentId ? 0 : travelStaminaCost(from, node),
      enemyCountHint: 'ศัตรู 1-5 ใบ',
      jewelChanceLabel: `${(node.jewelWeight / 10).toFixed(1)}%`,
      drops: node.drops.map((d) => ({ code: d.code, nameTh: findItemDef(d.code)?.nameTh ?? d.code })),
    }));

    return {
      stamina,
      max: STAMINA_MAX,
      staminaPerEnergy: STAMINA_PER_ENERGY,
      energy: energy.remaining,
      /** nodeId ของจุดที่ยืนอยู่ (null = ยังอยู่จุดเริ่มต้น) */
      current: currentId,
      /** ชื่อจุดที่ยืนอยู่ (โชว์ให้ผู้เล่นเห็นว่า Stamina คิดจากตรงนี้) */
      currentNameTh: currentId ? findMapNode(currentId)?.nameTh ?? null : null,
      decks: decks.map((d) => ({ id: d.id, name: d.name })),
      coins: Math.max(0, wallet?.balance ?? 0),
      nodes,
    };
  }

  /** เติม Stamina ด้วยพลังค้นหา (1 จุด → +20 สูงสุด 100) */
  static async refill(
    userId: string,
    points: number
  ): Promise<{ consumed: number; stamina: number; energy: number }> {
    const want = Math.max(1, Math.min(5, Math.trunc(points)));
    await ensureMapDailyReset(userId);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.user.findUnique({
        where: { id: userId },
        select: { discoveryEnergy: true, mapStamina: true },
      });
      if (!row) throw new Error('ไม่พบผู้ใช้');
      const consume = Math.min(want, Math.max(0, row.discoveryEnergy));
      if (consume <= 0) throw new Error(`พลังค้นหาไม่พอ (มี ${row.discoveryEnergy})`);
      return tx.user.update({
        where: { id: userId },
        data: {
          discoveryEnergy: { decrement: consume },
          mapStamina: Math.min(STAMINA_MAX, row.mapStamina + consume * STAMINA_PER_ENERGY),
        },
        select: { discoveryEnergy: true, mapStamina: true },
      });
    });

    return { consumed: Math.min(want, 5), stamina: updated.mapStamina, energy: updated.discoveryEnergy };
  }

  /**
   * เดินทางไปจุดที่เลือก + สู้ (สุ่มศัตรู 1-5) + จ่ายรางวัลเมื่อชนะ
   * - เลือกจุดไหนก็ได้บนแผนที่ ยกเว้น "จุดที่ยืนอยู่" (กันกดสู้ซ้ำจุดเดิม) — Stamina หักตามระยะทางจริง
   * - idempotent ด้วย runId (คืนผลเดิม ไม่หัก Stamina ซ้ำ) · เก็บการต่อสู้เพื่อดู replay
   */
  static async farm(
    userId: string,
    deckId: string,
    nodeId: string,
    runId?: string
  ): Promise<{
    runId: string;
    won: boolean;
    enemyCount: number;
    staminaCost: number;
    staminaRemaining: number;
    nodeId: string;
    battleUrl: string;
    roundsPlayed: number;
    rewards: MapRewards;
  }> {
    const { stamina } = await ensureMapDailyReset(userId);
    const node = findMapNode(nodeId);
    if (!node) throw new Error('ไม่พบจุดนี้บนแผนที่');

    const currentId = await currentNodeId(userId);
    if (nodeId === currentId) {
      throw new Error('คุณอยู่ที่จุดนี้แล้ว — เลือกจุดอื่นบนแผนที่เพื่อเดินทาง');
    }

    const from = currentId ? findMapNode(currentId) : null;
    const cost = travelStaminaCost(from, node);
    if (stamina < cost) {
      throw new Error(`Stamina ไม่พอ (ต้องใช้ ${cost} · มี ${stamina}) — เติมด้วยพลังค้นหาได้`);
    }

    const id = runId ?? `${userId}:map:${nodeId}:${Date.now()}`;
    const existing = await prisma.mapFarmLog.findUnique({ where: { runId: id } });
    if (existing) {
      const stored = existing.rewards as MapRewards | null;
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { mapStamina: true },
      });
      return {
        runId: existing.runId,
        won: existing.won,
        enemyCount: 0,
        staminaCost: existing.staminaCost,
        staminaRemaining: Math.max(0, current?.mapStamina ?? 0),
        nodeId: existing.nodeId,
        battleUrl: mapBattlePath(existing.runId),
        roundsPlayed: 0,
        rewards: stored ?? { dust: 0, shards: 0, itemCode: null, itemNameTh: null, jewel: 0 },
      };
    }

    const deck = await prisma.deck.findUnique({ where: { id: deckId }, select: { userId: true } });
    if (!deck || deck.userId !== userId) throw new Error('ไม่พบเด็คนี้ในทีมของคุณ');
    const teamA = await deckToCombatCards(deckId);
    if (!teamA) throw new Error('เด็คต้องมีการ์ดครบ 5 ใบก่อนฟาร์ม');

    const enemyCount = pickEnemyCount((n) => randomInt(n));
    const teamB = await buildRandomEnemyTeam(enemyCount);
    if (!teamB) throw new Error('ไม่มีการ์ดศัตรูในระบบ');

    const seed = buildBattleSeed(
      id,
      teamA.map((c) => c.cardId),
      teamB.map((c) => c.cardId),
      process.env.SERVER_PEPPER ?? 'rune-dominion'
    );
    const result = simulateBattle(teamA, teamB, seed);
    const won = result.winner === 'A';
    const rewards = won
      ? rollMapRewards(node, (n) => randomInt(n))
      : { dust: 0, shards: 0, itemCode: null, itemNameTh: null, jewel: 0 };

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { mapStamina: { decrement: cost } },
      });

      if (won) {
        if (rewards.dust > 0) {
          await InventoryService.grant(
            { userId, itemType: 'CRAFTING_DUST', code: CRAFTING_DUST_CODE, nameTh: CRAFTING_DUST_NAME_TH, quantity: rewards.dust, source: 'MAP_FARM' },
            tx
          );
        }
        if (rewards.shards > 0) {
          await creditVeilShards(tx, {
            userId,
            amount: rewards.shards,
            source: 'MAP_FARM',
            description: `ฟาร์ม ${node.nameTh} สำเร็จ`,
          });
        }
        if (rewards.itemCode) {
          await ItemService.grantItemByCode(userId, rewards.itemCode, 1, tx);
        }
        if (rewards.jewel > 0) {
          await InventoryService.grant(
            { userId, itemType: ENHANCE_JEWEL_TYPE as never, code: ENHANCE_JEWEL_CODE, nameTh: ENHANCE_JEWEL_NAME_TH, quantity: rewards.jewel, source: 'MAP_FARM' },
            tx
          );
        }
      }

      await tx.mapFarmLog.create({
        data: {
          userId,
          runId: id,
          nodeId,
          deckId,
          won,
          staminaCost: cost,
          rewards: rewards as object,
          battleData: JSON.parse(JSON.stringify({
            seed,
            log: result.log,
            teams: { A: teamA, B: teamB },
            roundsPlayed: result.roundsPlayed,
          })),
        },
      });
    });

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { mapStamina: true },
    });

    return {
      runId: id,
      won,
      enemyCount,
      staminaCost: cost,
      staminaRemaining: Math.max(0, current?.mapStamina ?? 0),
      nodeId,
      battleUrl: mapBattlePath(id),
      roundsPlayed: result.roundsPlayed,
      rewards,
    };
  }
}