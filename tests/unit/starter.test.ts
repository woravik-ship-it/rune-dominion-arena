import { StarterService } from '@/services/starter';
import { prisma } from '@/lib/prisma';
import { validateDeck } from '@/services/deck';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    cardDefinition: { findMany: jest.fn(), upsert: jest.fn() },
    userCard: { findMany: jest.fn(), createMany: jest.fn() },
  },
}));

const mocked = prisma as unknown as {
  cardDefinition: { findMany: jest.Mock; upsert: jest.Mock };
  userCard: { findMany: jest.Mock; createMany: jest.Mock };
};

const mkCard = (id: string, element: string) => ({
  id,
  name: `Card ${id}`,
  nameTh: `การ์ด ${id}`,
  element,
  rarity: 'COMMON',
  atk: 50,
  def: 40,
  hp: 100,
  spd: 20,
});

const POOL = [
  mkCard('c1', 'EMBERBOUND'),
  mkCard('c2', 'EMBERBOUND'),
  mkCard('c3', 'TIDEBORN'),
  mkCard('c4', 'SKYRIVEN'),
  mkCard('c5', 'ROOTFORGED'),
  mkCard('c6', 'DAWNSWORN'),
  mkCard('c7', 'VEILMARKED'),
  mkCard('c8', 'TIDEBORN'),
  mkCard('c9', 'SKYRIVEN'),
  mkCard('c10', 'ROOTFORGED'),
  mkCard('c11', 'DAWNSWORN'),
  mkCard('c12', 'VEILMARKED'),
];

beforeEach(() => {
  jest.clearAllMocks();
  // เผื่อกรณีคลังการ์ดน้อยกว่าเกณฑ์ — ให้ upsert สร้างการ์ดปลอมคืนได้
  mocked.cardDefinition.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
    id: `gen-${String(create.canonicalSeedHash).slice(0, 8)}`,
    name: create.name,
    nameTh: create.nameTh,
    element: create.element,
    rarity: create.rarity,
  }));
});

describe('StarterService.pickStarterCards', () => {
  it('ผู้เล่นใหม่ได้ 5 ใบ', () => {
    expect(StarterService.pickStarterCards(POOL, 'starter:user-1')).toHaveLength(5);
  });

  it('ไม่ซ้ำใบเดิม', () => {
    const picked = StarterService.pickStarterCards(POOL, 'starter:user-1');
    expect(new Set(picked.map((c) => c.id)).size).toBe(5);
  });

  it('ธาตุเดียวกันไม่เกิน 3 ใบ → จัดทีมได้ทันที', () => {
    const picked = StarterService.pickStarterCards(POOL, 'starter:user-1');
    const team = picked.map((c) => ({
      cardId: c.id,
      element: c.element,
      atk: c.atk,
      def: c.def,
      hp: c.hp,
      spd: c.spd,
    }));
    expect(validateDeck(team).valid).toBe(true);
  });

  it('deterministic — ผู้ใช้เดิมได้ชุดเดิมเสมอ', () => {
    const a = StarterService.pickStarterCards(POOL, 'starter:user-1').map((c) => c.id);
    const b = StarterService.pickStarterCards(POOL, 'starter:user-1').map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('ผู้ใช้ต่างกันได้ชุดต่างกัน (อย่างน้อยบางคู่)', () => {
    const sets = new Set(
      ['user-1', 'user-2', 'user-3', 'user-4', 'user-5', 'user-6'].map((u) =>
        StarterService.pickStarterCards(POOL, `starter:${u}`).map((c) => c.id).join(',')
      )
    );
    expect(sets.size).toBeGreaterThan(1);
  });

  it('คลังมีธาตุเดียว → ยังได้ครบ 5 ใบ (fallback ไม่ค้าง)', () => {
    const single = Array.from({ length: 6 }, (_, i) => mkCard(`s${i}`, 'EMBERBOUND'));
    expect(StarterService.pickStarterCards(single, 'starter:user-1')).toHaveLength(5);
  });

  it('คลังมีไม่ถึง 5 ใบ → ได้เท่าที่มี', () => {
    expect(StarterService.pickStarterCards(POOL.slice(0, 3), 'starter:user-1')).toHaveLength(3);
  });
});

describe('StarterService.grantStarterCards', () => {
  it('มอบ 5 ใบด้วย obtainedMethod STARTER และข้ามใบที่มีอยู่แล้ว', async () => {
    mocked.cardDefinition.findMany.mockResolvedValue(POOL);
    mocked.userCard.findMany.mockResolvedValue([{ cardId: 'c1' }]);
    mocked.userCard.createMany.mockResolvedValue({ count: 5 });

    const granted = await StarterService.grantStarterCards('user-1');

    expect(granted).toHaveLength(5);
    expect(granted.some((c) => c.cardId === 'c1')).toBe(false);

    const args = mocked.userCard.createMany.mock.calls[0][0];
    expect(args.data).toHaveLength(5);
    for (const row of args.data) {
      expect(row).toMatchObject({ userId: 'user-1', obtainedMethod: 'STARTER', quantity: 1 });
    }
  });

  it('ผู้เล่นที่มีการ์ดอยู่แล้วบางส่วน → ยังได้รวมอย่างน้อย 5 ใบ', async () => {
    mocked.cardDefinition.findMany.mockResolvedValue(POOL);
    mocked.userCard.findMany.mockResolvedValue([{ cardId: 'c1' }, { cardId: 'c2' }]);
    mocked.userCard.createMany.mockResolvedValue({ count: 5 });

    const granted = await StarterService.grantStarterCards('user-1');

    expect(granted).toHaveLength(5);
    expect(granted.some((c) => c.cardId === 'c1' || c.cardId === 'c2')).toBe(false);
  });
});
