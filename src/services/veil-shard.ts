// Veil Shard Service (Phase 25) — กระเป๋า Veil Shards ระดับผู้ใช้ + ledger
//
// ผู้ใช้สั่ง 2026-09-27: "ได้จากการขายการ์ดคืนร้าน จำนวนขึ้นกับความหายากของการ์ด บางส่วนก็ได้จากกิจกรรม"
// เดิม Veil Shards เก็บรวมกับ "ยอดของแต่ละกิจกรรม" (EventParticipation.currencyEarned/Spent)
// ⇒ ผู้เล่นที่ยังไม่มีกิจกรรมขายการ์ดแล้วไม่ได้อะไร
// ⇒ ย้าย "ยอดที่ใช้ได้จริง" มาเป็น User.veilShards (กระเป๋าเดียว ใช้ทั้งร้านช่าง/ร้านกิจกรรม/ค่าเข้า raid)
//    ส่วน EventParticipation ยังนับสถิติของอีเวนต์นั้นต่อ (earned/spent) เพื่อโชว์ความคืบหน้า
//
// กฎเดียวกับ WalletService: integer · ห้ามติดลบ · ledger เก็บ balanceBefore/After · idempotencyKey ได้
// ทุกฟังก์ชันรับ `db` ได้ ⇒ ใช้ร่วมกับ transaction ของผู้เรียก (คราฟต์/ซื้อ ต้องหักหลายอย่างพร้อมกัน)
import { prisma } from '@/lib/prisma';
import { Prisma, PrismaClient } from '@prisma/client';
import { VEIL_SHARD_SOURCES, type VeilShardSource } from '@/lib/veil-shards';

/** อะไรก็ได้ที่ query ได้ — prisma หรือ transaction client */
export type VeilShardDb = PrismaClient | Prisma.TransactionClient;

export interface VeilShardLedgerRecord {
  id: string;
  amount: number;
  type: string;
  source: string;
  description: string | null;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: Date;
}

export interface CreditParams {
  userId: string;
  amount: number;
  source: VeilShardSource;
  description?: string;
  idempotencyKey?: string;
}

export interface DebitParams extends CreditParams {}

function assertPositiveInteger(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('จำนวน Veil Shards ต้องเป็นจำนวนเต็มบวก');
  }
}

/** เพิ่ม Veil Shards บน client ที่ให้มา (ผู้เรียกคุม transaction เอง) */
export async function creditVeilShards(
  db: VeilShardDb,
  params: CreditParams
): Promise<{ balance: number; credited: boolean }> {
  assertPositiveInteger(params.amount);
  const amount = Math.trunc(params.amount);

  if (params.idempotencyKey) {
    const existing = await db.veilShardTransaction.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) return { balance: existing.balanceAfter, credited: false };
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: params.userId },
    select: { veilShards: true },
  });
  const before = Math.max(0, user.veilShards);
  const after = before + amount;

  await db.user.update({ where: { id: params.userId }, data: { veilShards: after } });
  await db.veilShardTransaction.create({
    data: {
      userId: params.userId,
      amount,
      type: 'REWARD',
      source: VEIL_SHARD_SOURCES[params.source],
      description: params.description ?? null,
      balanceBefore: before,
      balanceAfter: after,
      idempotencyKey: params.idempotencyKey ?? null,
    },
  });
  return { balance: after, credited: true };
}

/** ใช้ Veil Shards บน client ที่ให้มา — โยน error ถ้าไม่พอ (ข้อความเดียวกับที่ผู้เล่นเห็น) */
export async function debitVeilShards(
  db: VeilShardDb,
  params: DebitParams
): Promise<{ balance: number }> {
  assertPositiveInteger(params.amount);
  const amount = Math.trunc(params.amount);

  if (params.idempotencyKey) {
    const existing = await db.veilShardTransaction.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) return { balance: existing.balanceAfter };
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: params.userId },
    select: { veilShards: true },
  });
  const before = Math.max(0, user.veilShards);
  if (before < amount) {
    throw new Error(`Veil Shards ไม่พอ (ต้องใช้ ${amount} ชิ้น · มี ${before})`);
  }
  const after = before - amount;

  await db.user.update({ where: { id: params.userId }, data: { veilShards: after } });
  await db.veilShardTransaction.create({
    data: {
      userId: params.userId,
      amount: -amount,
      type: 'PURCHASE',
      source: VEIL_SHARD_SOURCES[params.source],
      description: params.description ?? null,
      balanceBefore: before,
      balanceAfter: after,
      idempotencyKey: params.idempotencyKey ?? null,
    },
  });
  return { balance: after };
}

export class VeilShardService {
  /** ยอดที่ใช้ได้จริง */
  static async balance(userId: string, db: VeilShardDb = prisma): Promise<number> {
    const user = await db.user.findUnique({ where: { id: userId }, select: { veilShards: true } });
    return Math.max(0, user?.veilShards ?? 0);
  }

  /** เพิ่ม Veil Shards (มี transaction ของตัวเอง) */
  static async credit(params: CreditParams): Promise<{ balance: number; credited: boolean }> {
    return prisma.$transaction((tx) => creditVeilShards(tx, params));
  }

  /** ใช้ Veil Shards (มี transaction ของตัวเอง) */
  static async debit(params: DebitParams): Promise<{ balance: number }> {
    return prisma.$transaction((tx) => debitVeilShards(tx, params));
  }

  /** ประวัติได้/ใช้ (ใหม่สุดก่อน) */
  static async history(userId: string, limit = 20): Promise<VeilShardLedgerRecord[]> {
    const rows = await prisma.veilShardTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, Math.trunc(limit))),
    });
    return rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      type: row.type,
      source: row.source,
      description: row.description,
      balanceBefore: row.balanceBefore,
      balanceAfter: row.balanceAfter,
      createdAt: row.createdAt,
    }));
  }
}
