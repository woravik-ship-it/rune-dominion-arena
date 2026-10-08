// Dungeon Service — Phase 31: ลุยดันเจี้ยนหาวัตถุดิบคราฟต์
// กฎ: server-side ล้วน · deterministic · idempotent (runId ซ้ำ = คืนผลเดิม)
//
// Phase 31.1 (ผู้ใช้แจ้ง 2026-09-27):
//  - "เข้าหน้าต่อสู้ไม่ได้จริง" → ทีมศัตรูใช้ dungeonCardId() ร่วมกับการแสดงผล (การ์ด/ภาพ ตรงกันแล้ว)
//  - "ฝุ่นเวทที่ได้มีสัญลักษณ์ไม่เหมือนเดิม" → จ่ายฝุ่นเวทด้วยรหัส/ชื่อกลางตัวเดียว (CRAFTING_DUST_*)
//  - "เวลาฟรีต้องบอกเป็นช่วง" → ข้อความ/สถานะใช้ formatFreeWindowsTh() (12:00–14:00 และ 20:00–22:00)
import { prisma } from '@/lib/prisma';
import { CombatCard, buildBattleSeed } from '@/services/combat';
import { simulateBattle } from '@/services/combat-engine';
import { deckToCombatCards } from '@/services/battle-api';
import { WalletService } from '@/services/wallet';
import { VeilShardService } from '@/services/veil-shard';
import {
  CRAFTING_DUST_CODE,
  CRAFTING_DUST_NAME_TH,
  InventoryService,
} from '@/services/inventory';
import { NotificationService } from '@/services/notification';
import { QuestService } from '@/services/quest';
import { findItemDef } from '@/lib/item-definitions';
import {
  DUNGEONS, findDungeon, findFloor, floorDustReward, formatFreeWindowsTh, freeEntryStatusTh,
  floorBossCount, floorDifficulty, floorHpBonus, bossSynergy, isFreeWindowOpen, isFloorCleared, isRewardFloor, isWinOnlyReward,
  type DungeonDef,
} from '@/lib/dungeon-definitions';
import { dungeonEnemyInfo, dungeonEnemySlots, floorEnemyPower } from '@/lib/dungeon-art';
import { DUNGEON_LOSS_REFUND, FLOOR_BLOCK_SIZE } from '@/lib/dungeon-definitions';
import { LevelService } from '@/services/level';
import { EXP_REWARD, itemDropBonusPercent } from '@/lib/level';
import { dungeonBattlePath } from '@/lib/battle-route';

/** ข้อผิดพลาดที่เกิดจาก "กติกาเกม" (ผู้เล่นแก้ได้) → API ตอบ 400 ไม่ใช่ 500 */
export class DungeonRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DungeonRuleError';
  }
}

/** ข้อมูลชั้นสำหรับแสดงบนหน้าเว็บ (ชื่อชั้น + รางวัล + ปลดล็อกหรือยัง) */
export interface DungeonFloorView {
  floor: number;
  nameTh: string;
  unlocked: boolean;
  /** ผ่านชั้นนี้แล้ว (ชนะมาแล้ว) → ลุยซ้ำได้แต่ไม่ได้รางวัล */
  cleared: boolean;
  dust: number;
  /** ฝุ่นเวทที่ได้เมื่อ "แพ้" (0 = ดันนี้ให้รางวัลเฉพาะเมื่อชนะ) */
  lossDust: number;
  shards: number;
  itemNameTh: string | null;
  itemDropChance: number;
  minions: number;
  /** จำนวนบอสในชั้น (ชั้นลึกมี 2-3 ตัว) */
  bosses: number;
  /** ตัวคูณความยากของชั้น (ไว้โชว์/ตรวจสอบ) */
  scale: number;
  /** Phase 37: บล็อกที่เท่าไร (5 ชั้นต่อบล็อก) — ความยาก/รางวัลกระโดดเป็นบล็อก */
  block: number;
  /** ลำดับชั้นภายในบล็อก (1-5) */
  blockFloor: number;
  enemyNameTh: string;
}

export interface DungeonListItem {
  code: string; name: string; nameTh: string; descriptionTh: string; icon: string;
  entry: string; entryTh: string; coinCost: number; freeHours: number[];
  /** ช่วงเวลาฟรีของดันตามเวลา → '12:00–14:00 และ 20:00–22:00' ('' เมื่อไม่ใช่ดันตามเวลา) */
  freeWindowText: string;
  /** ประโยคสถานะการเข้า "ตอนนี้" สำหรับผู้เล่น */
  statusTh: string;
  /** ข้อความนับถอยหลังถึงรอบฟรีถัดไป ('' เมื่อเปิดอยู่/ไม่ต้องรอ) */
  waitTextTh: string;
  canEnterNow: boolean;
  /** ยอด Coin ปัจจุบัน + พอจ่ายค่าเข้าไหม (ดันเหรียญ) */
  coinBalance: number;
  canAfford: boolean;
  /** true = ให้รางวัลเฉพาะเมื่อชนะ (ดันฟรี) · false = แพ้ยังได้ฝุ่นเวทบางส่วน (ดันเหรียญ) */
  winOnlyReward: boolean;
  floors: number;
  floorInfo: DungeonFloorView[];
  bestFloor: number;
}

/** รางวัลของชั้น → ข้อความชื่อไอเทม (ดรอปได้) */
function floorItemNameTh(code: string | null): string | null {
  if (!code) return null;
  return findItemDef(code)?.nameTh ?? null;
}

/** รายการดันเจี้ยน + สถานะเข้าได้ตอนนี้ + ชั้นสูงสุดที่เคยผ่าน */
export async function listDungeons(userId: string, now = new Date()): Promise<DungeonListItem[]> {
  const [progress, wallet] = await Promise.all([
    prisma.dungeonProgress.findMany({ where: { userId } }),
    WalletService.getWallet(userId),
  ]);
  const bestByCode = new Map(progress.map((p) => [p.dungeonCode, p.bestFloor]));
  return DUNGEONS.map((d) => {
    const status = freeEntryStatusTh(d, now);
    const bestFloor = bestByCode.get(d.code) ?? 0;
    const canAfford = d.entry !== 'COIN' || wallet.balance >= d.coinCost;
    return {
      code: d.code, name: d.name, nameTh: d.nameTh, descriptionTh: d.descriptionTh,
      icon: d.icon, entry: d.entry,
      entryTh: d.entry === 'FREE_ALWAYS' ? 'ฟรีตลอด' : d.entry === 'FREE_TIMED' ? 'ฟรีตามเวลา' : 'ใช้เหรียญ',
      coinCost: d.coinCost, freeHours: d.freeHours,
      freeWindowText: formatFreeWindowsTh(d),
      statusTh: status.labelTh,
      waitTextTh: status.waitTextTh,
      // ดันเหรียญเข้าได้ตลอด แต่ต้องมี Coin พอ (เดิมปุ่มกดได้แล้วไปพังตอน API ตอบ error)
      canEnterNow: status.open && canAfford,
      coinBalance: wallet.balance,
      canAfford,
      winOnlyReward: isWinOnlyReward(d),
      floors: d.floors.length,
      floorInfo: d.floors.map((f, index, all) => {
        // ระดับความยาก 1-10 ของชั้นนี้ (เทียบกับช่วงความยากของดันนี้) — ให้ผู้เล่นเห็น "เปลี่ยนระดับ" ชัด ๆ
        const difficulties = all.map((row) => floorDifficulty(row));
        const minD = Math.min(...difficulties);
        const maxD = Math.max(...difficulties);
        const value = difficulties[index];
        const stars = maxD > minD ? 1 + Math.round((9 * (value - minD)) / (maxD - minD)) : 1;
        return {
          floor: f.floor,
          nameTh: f.nameTh,
          unlocked: f.floor === 1 || bestFloor >= f.floor - 1,
          cleared: isFloorCleared(bestFloor, f.floor),
          dust: f.reward.dust,
          lossDust: floorDustReward(d, f, false),
          shards: f.reward.shards,
          itemNameTh: floorItemNameTh(f.reward.itemDropCode),
          itemDropChance: f.reward.itemDropChance,
          bosses: floorBossCount(f),
          minions: f.minions,
          enemyNameTh: `บอส ${floorBossCount(f)} · ลูกน้อง ${f.minions}`,
          /** Phase 45.6: ชั้นบอส 2 ตัวขึ้นไป — บอสทุกตัวได้โบนัส "พยุงกัน" (โชว์ให้ผู้เล่นรู้ว่าชั้นนี้บอสเก่งขึ้น) */
          bossSkillTh:
            floorBossCount(f) >= 2
              ? `บอสพยุงกัน — บอสทุกตัวพลัง +${Math.round((bossSynergy(d, floorBossCount(f)) - 1) * 100)}%`
              : null,
          scale: f.scale,
          hpBonus: floorHpBonus(f),
          /** ความยากจริง (scale × จำนวนบอส × HP) — ตัวเลขเดียวที่เทียบข้ามชั้นได้ */
          difficulty: value,
          /** ระดับความยากที่ผู้เล่นเห็น (1 = ง่ายสุดของดันนี้, 10 = ยากสุด) */
          difficultyStars: stars,
          /** พลังรวมของทีมศัตรู (เทียบกับ "พลังทีม" ของผู้เล่นได้ตรง ๆ) */
          enemyPower: floorEnemyPower(d, f),
          block: Math.floor((f.floor - 1) / FLOOR_BLOCK_SIZE) + 1,
          blockFloor: ((f.floor - 1) % FLOOR_BLOCK_SIZE) + 1,
        };
      }),
      bestFloor,
    };
  });
}

/** ทีมศัตรูของชั้น: บอส N + ลูกน้อง (status กำหนดเอง ไม่ผูก CardDefinition) */
export function buildEnemyTeam(dungeon: DungeonDef, floorNo: number): CombatCard[] {
  const floor = findFloor(dungeon, floorNo);
  if (!floor) throw new DungeonRuleError('ไม่พบชั้นนี้ในดันเจี้ยน');
  const team: CombatCard[] = [];
  for (const slot of dungeonEnemySlots(floor)) {
    const info = dungeonEnemyInfo(dungeon, {
      dungeonCode: dungeon.code, floor: floorNo, kind: slot.kind, index: slot.index,
    });
    if (!info) continue;
    team.push({
      cardId: info.cardId,
      name: info.name,
      nameTh: info.nameTh,
      element: info.element,
      atk: info.stats.atk, def: info.stats.def, hp: info.stats.hp, spd: info.stats.spd,
    });
  }
  return team;
}
export interface DungeonRunResult {
  runId: string; battleUrl: string; won: boolean; roundsPlayed: number;
  teamHpRemaining: number; enemyHpRemaining: number;
  dustEarned: number; shardsEarned: number;
  itemDropped: string | null; itemNameTh: string | null;
  coinsSpent: number; floor: number; nextFloor: number | null;
  /** Coin ที่คืนให้เมื่อแพ้ (ดันเสียเงิน) */
  coinsRefunded: number;
  /** โอกาสดรอปไอเทมจริงของรอบนี้ (%) — รวมโบนัสจากเลเวลผู้เล่นแล้ว */
  dropChance: number;
  /** false = ชั้นนี้เคยชนะแล้ว → รอบนี้เป็นรอบซ้อม ไม่มีรางวัล */
  rewardEligible: boolean;
  log: unknown[];
}

/** ลุยดัน 1 ครั้ง — หักค่าเข้า/ตรวจเวลา/สู้/จ่ายรางวัล (idempotent ด้วย runId) */
export async function runDungeon(params: {
  userId: string; dungeonCode: string; floor: number; deckId: string; runId?: string;
  now?: Date;
}): Promise<DungeonRunResult> {
  const now = params.now ?? new Date();
  const dungeon = findDungeon(params.dungeonCode);
  if (!dungeon) throw new DungeonRuleError('ไม่พบดันเจี้ยนนี้');
  const floor = findFloor(dungeon, params.floor);
  if (!floor) throw new DungeonRuleError('ไม่พบชั้นนี้');
  const progress = await prisma.dungeonProgress.findUnique({
    where: { userId_dungeonCode: { userId: params.userId, dungeonCode: dungeon.code } },
  });
  const best = progress?.bestFloor ?? 0;
  if (params.floor > 1 && best < params.floor - 1) {
    throw new DungeonRuleError(`ต้องผ่านชั้น ${params.floor - 1} ก่อน จึงจะเข้าชั้น ${params.floor} ได้`);
  }
  /**
   * สิทธิ์รับรางวัล: ต้องเป็นชั้นที่ยังไม่เคยชนะ (ผู้ใช้สั่ง 2026-09-27)
   * ลุยซ้ำชั้นเดิมได้ (ซ้อม/เก็บเควส) แต่จะไม่ได้ฝุ่น/Shards/ไอเทมอีก
   */
  const rewardEligible = isRewardFloor(best, params.floor);
  const runId = params.runId ?? `${params.userId}:${dungeon.code}:f${params.floor}:${now.getTime()}`;
  const existing = await prisma.dungeonRun.findUnique({ where: { runId } });
  if (existing) {
    const stored = existing.battleData as { log?: unknown[]; rewardEligible?: boolean; dropChance?: number } | null;
    const level = await LevelService.progress(params.userId);
    const replayFloor = findFloor(dungeon, existing.floor);
    const storedDropChance = stored?.dropChance
      ?? Math.min(100, Math.round((replayFloor?.reward.itemDropChance ?? 0) + itemDropBonusPercent(level.level)));
    return {
      runId: existing.runId, battleUrl: dungeonBattlePath(existing.runId), won: existing.won, roundsPlayed: existing.roundsPlayed,
      teamHpRemaining: existing.teamHpRemaining, enemyHpRemaining: existing.enemyHpRemaining,
      dustEarned: existing.dustEarned, shardsEarned: existing.shardsEarned,
      itemDropped: existing.itemDropped, itemNameTh: existing.itemNameTh,
      coinsSpent: existing.coinsSpent, floor: existing.floor, coinsRefunded: 0,
      rewardEligible: stored?.rewardEligible ?? true,
      dropChance: storedDropChance,
      nextFloor: existing.floor < dungeon.floors.length ? existing.floor + 1 : null,
      log: stored?.log ?? [],
    };
  }
  let coinsSpent = 0;
  if (dungeon.entry === 'COIN') {
    try {
      await WalletService.debit(params.userId, dungeon.coinCost, 'PURCHASE', runId, 'DUNGEON_ENTRY', `ค่าเข้าดัน ${dungeon.nameTh} ชั้น ${params.floor}`, runId);
    } catch (e) {
      // เงินไม่พอ = กติกาเกม (ผู้เล่นแก้ได้) ไม่ใช่ข้อผิดพลาดหลังบ้าน
      throw new DungeonRuleError(`Coin ไม่พอสำหรับค่าเข้า (ต้องใช้ ${dungeon.coinCost} Coin)`);
    }
    coinsSpent = dungeon.coinCost;
  } else if (dungeon.entry === 'FREE_TIMED' && !isFreeWindowOpen(dungeon, now.getHours())) {
    const status = freeEntryStatusTh(dungeon, now);
    // บอกเป็น "ช่วงเวลา" ให้ผู้เล่นรู้ว่าเข้าได้ตอนไหน (เดิมบอกเป็นรายชั่วโมง อ่านไม่รู้เรื่อง)
    throw new DungeonRuleError(
      `${dungeon.nameTh} ปิดอยู่ — เข้าฟรี ${formatFreeWindowsTh(dungeon)}${status.waitTextTh ? ` · ${status.waitTextTh}` : ''}`
    );
  }
  const deck = await prisma.deck.findUnique({ where: { id: params.deckId }, select: { userId: true } });
  if (!deck || deck.userId !== params.userId) throw new DungeonRuleError('ไม่พบเด็คนี้ในทีมของคุณ');
  const teamA = await deckToCombatCards(params.deckId);
  if (!teamA) throw new DungeonRuleError('เด็คต้องมีการ์ดครบ 5 ใบก่อนลุย');
  const teamB = buildEnemyTeam(dungeon, params.floor);
  const seed = buildBattleSeed(runId, teamA.map((c) => c.cardId), teamB.map((c) => c.cardId), process.env.SERVER_PEPPER ?? 'rune-dominion');
  const result = simulateBattle(teamA, teamB, seed);
  const won = result.winner === 'A';
  return finishRun({
    params, dungeonCode: dungeon.code, floorNo: params.floor, seed, result, won,
    teamA, teamB, coinsSpent, runId, rewardEligible,
  });
}

async function finishRun(args: {
  params: { userId: string; deckId: string }; dungeonCode: string; floorNo: number;
  seed: string; result: { winner: string; roundsPlayed: number; teamAHpRemaining: number; teamBHpRemaining: number; log: unknown[] };
  won: boolean; teamA: CombatCard[]; teamB: CombatCard[]; coinsSpent: number; runId: string;
  /** false = ชั้นที่เคยชนะแล้ว → ไม่จ่ายรางวัล (ลุยซ้ำได้แต่เป็นโหมดซ้อม) */
  rewardEligible: boolean;
}): Promise<DungeonRunResult> {
  const { params, dungeonCode, floorNo, seed, result, won, teamA, teamB, coinsSpent, runId, rewardEligible } = args;
  const dungeon = findDungeon(dungeonCode);
  const floor = findFloor(dungeon!, floorNo)!;
  let itemDropped: string | null = null;
  let itemNameTh: string | null = null;
  // ไอเทมดรอป: ชนะ + ยังไม่เคยผ่านชั้นนี้ เท่านั้น
  // Phase 33: โบนัสโอกาสดรอปตามเลเวลผู้เล่น (Level 350 = +20%) — บอกผู้เล่นใน UI ด้วย
  const level = await LevelService.progress(params.userId);
  const dropChance = Math.min(100, Math.round(floor.reward.itemDropChance + itemDropBonusPercent(level.level)));
  if (won && rewardEligible && floor.reward.itemDropCode && dropChance > 0) {
    const hex = Buffer.from(seed, 'hex').readUInt32BE(0);
    if (hex % 100 < dropChance) itemDropped = floor.reward.itemDropCode;
  }
  // ฝุ่นเวท/Shards: ชั้นที่ผ่านแล้ว = 0 ทั้งคู่ (ไม่มีรางวัลซ้ำ)
  const dustEarned = rewardEligible ? floorDustReward(dungeon!, floor, won) : 0;
  // Phase 37: ดันที่จ่าย Coin — แพ้แล้วคืนค่าเข้าครึ่งหนึ่ง (ไม่ให้เจ็บตัวจากการลอง)
  let coinsRefunded = 0;
  if (!won && coinsSpent > 0) {
    coinsRefunded = Math.floor(coinsSpent * DUNGEON_LOSS_REFUND);
    if (coinsRefunded > 0) {
      await WalletService.credit(
        params.userId, coinsRefunded, 'REWARD', runId, 'DUNGEON_REFUND',
        `คืนค่าเข้าดัน ${dungeon!.nameTh} (แพ้)`, `refund:${runId}`
      );
    }
  }
  const shardsEarned = rewardEligible && won ? floor.reward.shards : 0;
  if (dustEarned > 0) {
    // รหัส/ชื่อ "ฝุ่นเวท" ต้องเป็นตัวเดียวกับทุกแหล่งที่มา (กิจกรรม/ร้านค้า)
    // ไม่งั้นผู้เล่นจะเห็นเป็นคนละไอเทม (เคสจริง: 'ฝุ่นเวท (สุสานเพลิง ชั้น 1)' คนละแถวกับ 'ฝุ่นเวท')
    await InventoryService.grant({
      userId: params.userId, itemType: 'CRAFTING_DUST',
      code: CRAFTING_DUST_CODE, nameTh: CRAFTING_DUST_NAME_TH, quantity: dustEarned,
      source: `DUNGEON:${dungeonCode}:F${floorNo}`,
    });
  }
  if (shardsEarned > 0) {
    await VeilShardService.credit({
      userId: params.userId, amount: shardsEarned, source: 'EVENT_QUEST',
      description: `รางวัลจากดัน ${dungeon!.nameTh} ชั้น ${floorNo}`,
    });
  }
  if (itemDropped) {
    const def = findItemDef(itemDropped);
    itemNameTh = def?.nameTh ?? itemDropped;
    const itemRow = await prisma.itemDefinition.findUnique({ where: { code: itemDropped } });
    if (itemRow) {
      // Phase 43: ของที่ดรอป = ของใหม่ → เข้ากอง +0
      await prisma.userItem.upsert({
        where: {
          userId_itemId_enhanceLevel: { userId: params.userId, itemId: itemRow.id, enhanceLevel: 0 },
        },
        create: { userId: params.userId, itemId: itemRow.id, quantity: 1, enhanceLevel: 0 },
        update: { quantity: { increment: 1 } },
      });
    }
  }
  if (won) {
    const prev = await prisma.dungeonProgress.findUnique({
      where: { userId_dungeonCode: { userId: params.userId, dungeonCode } },
    });
    await prisma.dungeonProgress.upsert({
      where: { userId_dungeonCode: { userId: params.userId, dungeonCode } },
      create: { userId: params.userId, dungeonCode, bestFloor: floorNo },
      update: { bestFloor: Math.max(prev?.bestFloor ?? 0, floorNo) },
    });
  }
  const saved = await prisma.dungeonRun.create({
    data: {
      runId, userId: params.userId, dungeonCode, floor: floorNo,
      deckId: params.deckId, won, roundsPlayed: result.roundsPlayed,
      teamHpRemaining: result.teamAHpRemaining, enemyHpRemaining: result.teamBHpRemaining,
      dustEarned, shardsEarned, itemDropped, itemNameTh, coinsSpent,
      // เก็บสิทธิ์รับรางวัลไว้ใน battleData → หน้า replay บอกผู้เล่นได้ว่า "รอบนี้เป็นรอบซ้อม"
      battleData: JSON.parse(JSON.stringify({ seed, log: result.log, teams: { A: teamA, B: teamB }, rewardEligible, dropChance })),
    },
  });
  if (rewardEligible) {
    // Phase 33: exp จากดัน — ยิ่งลึกยิ่งได้มาก · เฉพาะชั้นที่ยังไม่เคยผ่าน (กันปั๊มชั้นเดิม)
    try {
      await LevelService.addExp(
        params.userId,
        EXP_REWARD.dungeonBase + floorNo * EXP_REWARD.dungeonPerFloor
      );
    } catch (levelError) {
      console.error('Dungeon level hook error:', levelError);
    }
  }
  try {
    await QuestService.recordEvent(params.userId, 'BATTLE', 1);
    if (won) await QuestService.recordEvent(params.userId, 'BATTLE_WIN', 1);
  } catch (e) { console.error('Dungeon quest hook error:', e); }
  NotificationService.create(params.userId, {
    type: 'BATTLE_RESULT', titleKey: 'notif.dungeonTitle',
    // เลือกข้อความตามผล: รอบซ้อม (ชั้นผ่านแล้ว) / ไม่มีรางวัล / ได้รางวัล
    bodyKey: !rewardEligible
      ? 'notif.dungeonBodyReplay'
      : dustEarned > 0 ? 'notif.dungeonBody' : 'notif.dungeonBodyNoReward',
    vars: { dungeon: dungeon!.nameTh, floor: floorNo, result: won ? 'ชนะ' : 'แพ้', dust: dustEarned },
    href: '/dungeons', icon: dungeon!.icon,
  }).catch(() => undefined);
  return {
    runId: saved.runId, battleUrl: dungeonBattlePath(saved.runId), won, roundsPlayed: result.roundsPlayed,
    teamHpRemaining: result.teamAHpRemaining, enemyHpRemaining: result.teamBHpRemaining,
    dustEarned, shardsEarned, itemDropped, itemNameTh, coinsSpent, floor: floorNo,
    rewardEligible, dropChance, coinsRefunded,
    nextFloor: floorNo < dungeon!.floors.length ? floorNo + 1 : null,
    log: JSON.parse(JSON.stringify(result.log)),
  };
}
