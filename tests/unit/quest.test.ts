import { prisma } from '@/lib/prisma';
import { WalletService } from '@/services/wallet';
import {
  QuestService,
  dailyPeriodKey,
  weeklyPeriodKey,
  periodKeyFor,
  nextResets,
} from '@/services/quest';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    quest: { findMany: jest.fn(), findUnique: jest.fn() },
    questProgress: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('@/services/wallet', () => ({
  WalletService: { credit: jest.fn(async () => ({})) },
}));

const mocked = prisma as unknown as {
  quest: { findMany: jest.Mock; findUnique: jest.Mock };
  questProgress: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
};
const creditMock = WalletService.credit as jest.Mock;

const USER = 'user-1';
const QUEST_DAILY = {
  id: 'q-daily', code: 'DAILY_DISCOVERY_3', name: 'Daily Discovery', nameTh: 'ค้นหารูนประจำวัน',
  descriptionTh: 'ค้นพบการ์ด 3 ครั้ง', type: 'DAILY', metric: 'DISCOVERY',
  targetValue: 3, rewardAmount: 30, isActive: true, startDate: null, endDate: null,
};
const QUEST_ACHV = {
  ...QUEST_DAILY, id: 'q-achv', code: 'ACHV_WIN_100', nameTh: 'ดาบไร้เทียมทาน',
  type: 'ACHIEVEMENT', metric: 'BATTLE_WIN', targetValue: 100, rewardAmount: 1000,
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('period keys (deterministic reset)', () => {
  test('dailyPeriodKey จัดรูปแบบ YYYY-MM-DD', () => {
    expect(dailyPeriodKey(new Date(2025, 8, 13, 14, 30))).toBe('2025-09-13');
    expect(dailyPeriodKey(new Date(2025, 0, 1))).toBe('2025-01-01');
  });

  test('weeklyPeriodKey เป็นมาตรฐาน ISO week (จันทร์เป็นวันเริ่ม)', () => {
    // 13 ก.ย. 2025 = วันเสาร์ อยู่สัปดาห์ที่ 37
    expect(weeklyPeriodKey(new Date(2025, 8, 13))).toBe('2025-W37');
    // 8 ก.ย. 2025 = วันจันทร์ สัปดาห์เดียวกัน
    expect(weeklyPeriodKey(new Date(2025, 8, 8))).toBe('2025-W37');
    // 7 ก.ย. 2025 = วันอาทิตย์ ยังอยู่สัปดาห์เดียวกันตาม ISO
    expect(weeklyPeriodKey(new Date(2025, 8, 7))).toBe('2025-W36');
  });

  test('weeklyPeriodKey ข้ามปีถูกต้อง', () => {
    // 1 ม.ค. 2025 = วันพุธ อยู่สัปดาห์ 1 ของปี 2025
    expect(weeklyPeriodKey(new Date(2025, 0, 1))).toBe('2025-W01');
    // 30 ธ.ค. 2024 = วันจันทร์ อยู่สัปดาห์ 1 ของปี 2025
    expect(weeklyPeriodKey(new Date(2024, 11, 30))).toBe('2025-W01');
    // 29 ธ.ค. 2025 (จันทร์ ที่พฤหัส 1 ม.ค. 2026) = สัปดาห์ 1 ของปี 2026
    expect(weeklyPeriodKey(new Date(2025, 11, 29))).toBe('2026-W01');
  });

  test('periodKeyFor ตามประเภทเควส', () => {
    const now = new Date(2025, 8, 13, 10, 0);
    expect(periodKeyFor('DAILY', now)).toBe('2025-09-13');
    expect(periodKeyFor('WEEKLY', now)).toBe('2025-W37');
    expect(periodKeyFor('ACHIEVEMENT', now)).toBe('ALL');
    expect(periodKeyFor('EVENT', now)).toBe('ALL');
  });

  test('nextResets คืนเที่ยงคืนถัดไปและวันจันทร์ถัดไป', () => {
    const resets = nextResets(new Date(2025, 8, 13, 15, 0)); // เสาร์
    expect(new Date(resets.dailyAt).getDate()).toBe(14);
    expect(new Date(resets.weeklyAt).getDay()).toBe(1);
    expect(new Date(resets.weeklyAt).getDate()).toBe(15); // จันทร์ 15 ก.ย.
  });
});

describe('QuestService.getBoard', () => {
  test('จัดกลุ่มตาม type และให้ progress เริ่มที่ 0 เมื่อยังไม่มีแถว', async () => {
    mocked.quest.findMany.mockResolvedValue([QUEST_DAILY, QUEST_ACHV]);
    mocked.questProgress.findMany.mockResolvedValue([]);

    const board = await QuestService.getBoard(USER, new Date(2025, 8, 13));

    expect(board.daily).toHaveLength(1);
    expect(board.achievement).toHaveLength(1);
    expect(board.daily[0]).toMatchObject({
      questId: 'q-daily',
      currentValue: 0,
      isCompleted: false,
      rewardClaimed: false,
      periodKey: '2025-09-13',
    });
    expect(board.achievement[0].periodKey).toBe('ALL');
    expect(mocked.questProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER, periodKey: { in: expect.arrayContaining(['2025-09-13', 'ALL']) } },
      })
    );
  });

  test('แสดง progress จริงเมื่อมีแถวอยู่แล้ว', async () => {
    mocked.quest.findMany.mockResolvedValue([QUEST_DAILY]);
    mocked.questProgress.findMany.mockResolvedValue([
      { questId: 'q-daily', currentValue: 2, isCompleted: false, rewardClaimed: false },
    ]);

    const board = await QuestService.getBoard(USER, new Date(2025, 8, 13));
    expect(board.daily[0]).toMatchObject({ currentValue: 2, isCompleted: false });
  });
});

describe('QuestService.recordEvent', () => {
  test('สร้างแถวใหม่และเสร็จสิ้นเมื่อครบเป้า', async () => {
    mocked.quest.findMany.mockResolvedValue([QUEST_DAILY]); // target 3
    mocked.questProgress.findUnique.mockResolvedValueOnce(null);
    mocked.questProgress.create.mockResolvedValueOnce({
      questId: 'q-daily', currentValue: 1, isCompleted: false, rewardClaimed: false,
    });

    await QuestService.recordEvent(USER, 'DISCOVERY', 1, new Date(2025, 8, 13));

    expect(mocked.questProgress.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        questId: 'q-daily', userId: USER, periodKey: '2025-09-13',
        currentValue: 1, isCompleted: false, completedAt: null,
      }),
    });
    expect(mocked.questProgress.update).not.toHaveBeenCalled();
  });

  test('สะสมครบเป้า → ตั้ง isCompleted + completedAt', async () => {
    mocked.quest.findMany.mockResolvedValue([QUEST_DAILY]); // target 3
    mocked.questProgress.findUnique.mockResolvedValueOnce({
      id: 'p1', questId: 'q-daily', currentValue: 2, isCompleted: false, rewardClaimed: false,
    });
    mocked.questProgress.update.mockResolvedValueOnce({
      id: 'p1', currentValue: 3, isCompleted: true, rewardClaimed: false,
    });

    const now = new Date(2025, 8, 13);
    await QuestService.recordEvent(USER, 'DISCOVERY', 1, now);

    expect(mocked.questProgress.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { currentValue: 3, isCompleted: true, completedAt: now },
    });
  });

  test('ทำเกินเป้าแล้วไม่นับเพิ่ม (หยุดที่ isCompleted)', async () => {
    mocked.quest.findMany.mockResolvedValue([QUEST_DAILY]);
    mocked.questProgress.findUnique.mockResolvedValueOnce({
      id: 'p1', currentValue: 3, isCompleted: true, rewardClaimed: true,
    });

    await QuestService.recordEvent(USER, 'DISCOVERY', 1);

    expect(mocked.questProgress.update).not.toHaveBeenCalled();
    expect(mocked.questProgress.create).not.toHaveBeenCalled();
  });

  test('แยกงวดใหม่หลังรีเซ็ต (periodKey ต่างกัน)', async () => {
    mocked.quest.findMany.mockResolvedValue([QUEST_DAILY]);
    mocked.questProgress.findUnique
      .mockResolvedValueOnce({ id: 'p1', currentValue: 3, isCompleted: true, rewardClaimed: true })
      .mockResolvedValueOnce(null);
    mocked.questProgress.create.mockResolvedValueOnce({ currentValue: 1, isCompleted: false });

    await QuestService.recordEvent(USER, 'DISCOVERY', 1, new Date(2025, 8, 13));
    await QuestService.recordEvent(USER, 'DISCOVERY', 1, new Date(2025, 8, 14));

    expect(mocked.questProgress.findUnique).toHaveBeenLastCalledWith({
      where: { questId_userId_periodKey: { questId: 'q-daily', userId: USER, periodKey: '2025-09-14' } },
    });
    expect(mocked.questProgress.create).toHaveBeenCalledTimes(1);
  });

  test('เมธริกไม่ตรง → ไม่นับ', async () => {
    // จำลองการกรอง metric ฝั่งฐานข้อมูล
    mocked.quest.findMany.mockImplementation((args: { where: { metric: string } }) =>
      Promise.resolve(args.where.metric === 'DISCOVERY' ? [QUEST_DAILY] : [])
    );
    await QuestService.recordEvent(USER, 'ARENA_WIN', 1);
    expect(mocked.questProgress.create).not.toHaveBeenCalled();
    expect(mocked.questProgress.update).not.toHaveBeenCalled();
  });

  test('amount ไม่ใช่จำนวนเต็มบวก → ข้าม', async () => {
    await QuestService.recordEvent(USER, 'DISCOVERY', 0);
    await QuestService.recordEvent(USER, 'DISCOVERY', -1);
    await QuestService.recordEvent(USER, 'DISCOVERY', 1.5);
    expect(mocked.quest.findMany).not.toHaveBeenCalled();
  });
});

describe('QuestService.claim', () => {
  const now = new Date(2025, 8, 13);

  test('ยังไม่เสร็จ → ปฏิเสธและไม่เครดิตเงิน', async () => {
    mocked.quest.findUnique.mockResolvedValueOnce(QUEST_DAILY);
    mocked.questProgress.findUnique.mockResolvedValueOnce({
      id: 'p1', currentValue: 1, isCompleted: false, rewardClaimed: false,
    });

    const result = await QuestService.claim(USER, 'q-daily', now);

    expect(result.claimed).toBe(false);
    expect(creditMock).not.toHaveBeenCalled();
    expect(mocked.questProgress.updateMany).not.toHaveBeenCalled();
  });

  test('เคลมสำเร็จ → เครดิตเงินด้วย idempotencyKey ที่ถูกต้อง', async () => {
    mocked.quest.findUnique.mockResolvedValueOnce(QUEST_DAILY);
    mocked.questProgress.findUnique.mockResolvedValueOnce({
      id: 'p1', currentValue: 3, isCompleted: true, rewardClaimed: false,
    });
    mocked.questProgress.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await QuestService.claim(USER, 'q-daily', now);

    expect(result.claimed).toBe(true);
    expect(result.rewardAmount).toBe(30);
    expect(mocked.questProgress.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', rewardClaimed: false },
      data: { rewardClaimed: true },
    });
    expect(creditMock).toHaveBeenCalledWith(
      USER, 30, 'REWARD', 'q-daily', 'QUEST_REWARD',
      expect.stringContaining('ค้นหารูนประจำวัน'),
      'quest-claim:q-daily:user-1:2025-09-13'
    );
  });

  test('เคลมซ้ำ (idempotent) → ปฏิเสธโดยไม่เครดิตซ้ำ', async () => {
    mocked.quest.findUnique.mockResolvedValueOnce(QUEST_DAILY);
    mocked.questProgress.findUnique.mockResolvedValueOnce({
      id: 'p1', currentValue: 3, isCompleted: true, rewardClaimed: true,
    });

    const result = await QuestService.claim(USER, 'q-daily', now);

    expect(result.claimed).toBe(false);
    expect(result.message).toBe('รับรางวัลนี้ไปแล้ว');
    expect(creditMock).not.toHaveBeenCalled();
  });

  test('แข่งกันเคลม (race) — คนที่อัปเดตไม่สำเร็จจะไม่ได้เงิน', async () => {
    mocked.quest.findUnique.mockResolvedValueOnce(QUEST_DAILY);
    mocked.questProgress.findUnique.mockResolvedValueOnce({
      id: 'p1', currentValue: 3, isCompleted: true, rewardClaimed: false,
    });
    mocked.questProgress.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await QuestService.claim(USER, 'q-daily', now);

    expect(result.claimed).toBe(false);
    expect(result.message).toBe('รับรางวัลนี้ไปแล้ว');
    expect(creditMock).not.toHaveBeenCalled();
  });

  test('ไม่พบภารกิจ → ปฏิเสธ', async () => {
    mocked.quest.findUnique.mockResolvedValueOnce(null);
    const result = await QuestService.claim(USER, 'nope', now);
    expect(result.claimed).toBe(false);
    expect(creditMock).not.toHaveBeenCalled();
  });
});

