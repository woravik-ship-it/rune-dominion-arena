import { WalletService } from '@/services/wallet';
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/prisma', () => {
  const txOps = {
    wallet: {
      findUnique: jest.fn(),
      findFirstOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    walletTransaction: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
  };
  return {
    prisma: {
      wallet: { findUnique: jest.fn(), create: jest.fn() },
      walletTransaction: {
        findUnique: jest.fn(), create: jest.fn(),
        findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn(),
      },
      $transaction: jest.fn((fn: (t: typeof txOps) => unknown) => fn(txOps)),
      __tx: txOps,
    },
  };
});

const mocked = prisma as unknown as {
  wallet: { findUnique: jest.Mock; create: jest.Mock };
  walletTransaction: {
    findUnique: jest.Mock; create: jest.Mock; findMany: jest.Mock;
    count: jest.Mock; aggregate: jest.Mock;
  };
  $transaction: jest.Mock;
  __tx: {
    wallet: { findFirstOrThrow: jest.Mock; update: jest.Mock };
    walletTransaction: { findUnique: jest.Mock; create: jest.Mock };
  };
};

describe('WalletService', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('reject จำนวนไม่เป็น integer (credit/debit)', async () => {
    await expect(WalletService.credit('u1', 10.5, 'EARN')).rejects.toThrow('จำนวนเต็ม');
    await expect(WalletService.credit('u1', 0, 'EARN')).rejects.toThrow('จำนวนเต็ม');
    await expect(WalletService.debit('u1', 1.5, 'SPEND')).rejects.toThrow('จำนวนเต็ม');
  });

  it('credit เพิ่มยอด + ledger before/after ถูกต้อง', async () => {
    mocked.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 100 });
    mocked.__tx.wallet.findFirstOrThrow.mockResolvedValue({ id: 'w1', balance: 100 });
    mocked.walletTransaction.findUnique.mockResolvedValue(null);
    mocked.__tx.walletTransaction.findUnique.mockResolvedValue(null);
    mocked.__tx.walletTransaction.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        id: 'tx1', createdAt: new Date(), ...args.data,
      })
    );
    mocked.__tx.wallet.update.mockResolvedValue({});

    const r = await WalletService.credit('u1', 50, 'REWARD', 'ref1', 'QUEST', 'เควส');

    expect(r.balanceBefore).toBe(100);
    expect(r.balanceAfter).toBe(150);
    expect(r.amount).toBe(50);
    expect(mocked.__tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { balance: 150, totalEarned: { increment: 50 } },
    });
  });

  it('idempotency credit ซ้ำคืน record เดิม ไม่ทำซ้ำ', async () => {
    const existing = {
      id: 'tx-old', amount: 50, type: 'REWARD', balanceBefore: 100, balanceAfter: 150,
    };
    mocked.walletTransaction.findUnique.mockResolvedValue(existing);

    const r = await WalletService.credit('u1', 50, 'REWARD', undefined, undefined, undefined, 'key-1');

    expect(r).toEqual(existing);
    expect(mocked.$transaction).not.toHaveBeenCalled();
  });


  it('debit ยอดไม่พอ throw', async () => {
    mocked.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 10 });
    mocked.__tx.wallet.findFirstOrThrow.mockResolvedValue({ id: 'w1', balance: 10 });
    mocked.walletTransaction.findUnique.mockResolvedValue(null);
    mocked.__tx.walletTransaction.findUnique.mockResolvedValue(null);

    await expect(WalletService.debit('u1', 30, 'SPEND')).rejects.toThrow('ไม่เพียงพอ');
  });

  it('debit ลดยอด บันทึก amount ติดลบ', async () => {
    mocked.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 100 });
    mocked.__tx.wallet.findFirstOrThrow.mockResolvedValue({ id: 'w1', balance: 100 });
    mocked.walletTransaction.findUnique.mockResolvedValue(null);
    mocked.__tx.walletTransaction.findUnique.mockResolvedValue(null);
    mocked.__tx.walletTransaction.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        id: 'tx2', createdAt: new Date(), ...args.data,
      })
    );
    mocked.__tx.wallet.update.mockResolvedValue({});

    const r = await WalletService.debit('u1', 30, 'SPEND', 'arena1', 'ARENA_JOIN', 'เข้า arena');

    expect(r.amount).toBe(-30);
    expect(r.balanceBefore).toBe(100);
    expect(r.balanceAfter).toBe(70);
  });

  it('idempotency debit ซ้ำไม่หักซ้ำ', async () => {
    const existing = {
      id: 'tx-old', amount: -30, type: 'SPEND', balanceBefore: 100, balanceAfter: 70,
    };
    mocked.walletTransaction.findUnique.mockResolvedValue(existing);

    const r = await WalletService.debit('u1', 30, 'SPEND', undefined, undefined, undefined, 'key-2');

    expect(r).toEqual(existing);
    expect(mocked.$transaction).not.toHaveBeenCalled();
  });

  it('filter IN/OUT ส่ง where ถูกต้อง', async () => {
    mocked.wallet.findUnique.mockResolvedValue({ id: 'w1', balance: 0 });
    mocked.walletTransaction.findMany.mockResolvedValue([]);
    mocked.walletTransaction.count.mockResolvedValue(0);

    await WalletService.getTransactions('u1', { filter: 'IN' });
    expect(mocked.walletTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { walletId: 'w1', amount: { gt: 0 } } })
    );

    await WalletService.getTransactions('u1', { filter: 'OUT' });
    expect(mocked.walletTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { walletId: 'w1', amount: { lt: 0 } } })
    );
  });
});
