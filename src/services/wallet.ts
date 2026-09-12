// Wallet Service — Phase 5 (Coin Ledger ปลอดภัย)
// Rules: Integer เท่านั้น / balance ห้ามติดลบ / ACID + Idempotency
import { prisma } from '@/lib/prisma';
import { STARTING_COIN } from '@/lib/constants';

export const DAILY_REWARD_CAP = 1000;

export type WalletTxType = 'EARN' | 'SPEND' | 'REWARD' | 'PURCHASE';

export interface WalletInfo {
  balance: number;
  totalEarned: number;
  totalSpent: number;
}

export interface WalletTxRecord {
  id: string;
  amount: number;
  type: WalletTxType;
  referenceId: string | null;
  referenceType: string | null;
  description: string | null;
  balanceBefore: number;
  balanceAfter: number;
  idempotencyKey: string | null;
  createdAt: Date;
}

function assertIntegerAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('จำนวน Coin ต้องเป็นจำนวนเต็มบวก');
  }
}

type TxRow = Omit<WalletTxRecord, 'createdAt'> & { createdAt: Date };

function mapTx(tx: TxRow): WalletTxRecord {
  return { ...tx };
}

async function getOrCreateWallet(userId: string) {
  let wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: { userId, balance: STARTING_COIN, totalEarned: STARTING_COIN, totalSpent: 0 },
    });
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: STARTING_COIN,
        type: 'REWARD',
        referenceType: 'SIGNUP_BONUS',
        description: 'โบนัสเริ่มต้น',
        balanceBefore: 0,
        balanceAfter: STARTING_COIN,
      },
    });
    wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new Error('สร้างกระเป๋าไม่สำเร็จ');
  }
  return wallet;
}


export class WalletService {
  static async getWallet(userId: string): Promise<WalletInfo> {
    const wallet = await getOrCreateWallet(userId);
    return {
      balance: wallet.balance,
      totalEarned: wallet.totalEarned,
      totalSpent: wallet.totalSpent,
    };
  }

  static async credit(
    userId: string,
    amount: number,
    type: WalletTxType,
    referenceId?: string,
    referenceType?: string,
    description?: string,
    idempotencyKey?: string
  ): Promise<WalletTxRecord> {
    assertIntegerAmount(amount);
    if (idempotencyKey) {
      const existing = await prisma.walletTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) return mapTx(existing as TxRow);
    }
    return prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const retry = await tx.walletTransaction.findUnique({
          where: { idempotencyKey },
        });
        if (retry) return mapTx(retry as TxRow);
      }
      const wallet = await getOrCreateWallet(userId);
      const current = await tx.wallet.findFirstOrThrow({ where: { id: wallet.id } });
      const before = current.balance;
      const after = before + amount;
      try {
        const record = await tx.walletTransaction.create({
          data: {
            walletId: current.id,
            amount, type,
            referenceId: referenceId ?? null,
            referenceType: referenceType ?? null,
            description: description ?? null,
            balanceBefore: before,
            balanceAfter: after,
            idempotencyKey: idempotencyKey ?? null,
          },
        });
        await tx.wallet.update({
          where: { id: current.id },
          data: { balance: after, totalEarned: { increment: amount } },
        });
        return mapTx(record as TxRow);
      } catch (e) {
        if (idempotencyKey) {
          const dup = await tx.walletTransaction.findUnique({
            where: { idempotencyKey },
          });
          if (dup) return mapTx(dup as TxRow);
        }
        throw e;
      }
    });
  }

  static async debit(
    userId: string,
    amount: number,
    type: WalletTxType,
    referenceId?: string,
    referenceType?: string,
    description?: string,
    idempotencyKey?: string
  ): Promise<WalletTxRecord> {
    assertIntegerAmount(amount);
    if (idempotencyKey) {
      const existing = await prisma.walletTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) return mapTx(existing as TxRow);
    }
    return prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const retry = await tx.walletTransaction.findUnique({
          where: { idempotencyKey },
        });
        if (retry) return mapTx(retry as TxRow);
      }
      const wallet = await getOrCreateWallet(userId);
      const current = await tx.wallet.findFirstOrThrow({ where: { id: wallet.id } });
      if (current.balance < amount) throw new Error('ยอด Coin ไม่เพียงพอ');
      const after = current.balance - amount;
      try {
        const record = await tx.walletTransaction.create({
          data: {
            walletId: current.id,
            amount: -Math.trunc(amount),
            type,
            referenceId: referenceId ?? null,
            referenceType: referenceType ?? null,
            description: description ?? null,
            balanceBefore: current.balance,
            balanceAfter: after,
            idempotencyKey: idempotencyKey ?? null,
          },
        });
        await tx.wallet.update({
          where: { id: current.id },
          data: { balance: after, totalSpent: { increment: amount } },
        });
        return mapTx(record as TxRow);
      } catch (e) {
        if (idempotencyKey) {
          const dup = await tx.walletTransaction.findUnique({
            where: { idempotencyKey },
          });
          if (dup) return mapTx(dup as TxRow);
        }
        throw e;
      }
    });
  }

  static async getTransactions(
    userId: string,
    opts?: { page?: number; limit?: number; filter?: 'ALL' | 'IN' | 'OUT' }
  ): Promise<{ data: WalletTxRecord[]; total: number; page: number; limit: number }> {
    const wallet = await getOrCreateWallet(userId);
    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts?.limit ?? 20));
    const filter = opts?.filter ?? 'ALL';
    const where: { walletId: string; amount?: { gt: number } | { lt: number } } = {
      walletId: wallet.id,
    };
    if (filter === 'IN') where.amount = { gt: 0 };
    if (filter === 'OUT') where.amount = { lt: 0 };
    const [rows, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.walletTransaction.count({ where }),
    ]);
    return { data: rows.map((r) => mapTx(r as TxRow)), total, page, limit };
  }

  static async dailyRewardTotal(userId: string, since: Date): Promise<number> {
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!wallet) return 0;
    const agg = await prisma.walletTransaction.aggregate({
      where: {
        walletId: wallet.id,
        type: 'REWARD',
        amount: { gt: 0 },
        createdAt: { gte: since },
      },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }
}
