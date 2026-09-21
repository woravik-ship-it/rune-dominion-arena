import { DiscoveryService } from '@/services/discovery';
import { prisma } from '@/lib/prisma';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    cardDefinition: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    discoveryLog: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    userCard: {
      create: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

describe('DiscoveryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // ค่าเริ่มต้น: ผู้เล่นยังไม่มีการ์ดใบนั้น (เทสต์ที่จะทดสอบใบซ้ำจะ set เอง)
    (prisma.userCard.findUnique as jest.Mock).mockResolvedValue(null);
  });

  describe('getEnergy', () => {
    it('should return user energy', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        discoveryEnergy: 3,
      });

      const result = await DiscoveryService.getEnergy('user-1');

      expect(result).toEqual({ remaining: 3, max: 5 });
    });

    it('should throw error if user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(DiscoveryService.getEnergy('invalid-user')).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('regenerateEnergy', () => {
    it('should reset energy to max', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await DiscoveryService.regenerateEnergy('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { discoveryEnergy: 5 },
      });
    });
  });

  describe('discover', () => {
    const mockUser = {
      id: 'user-1',
      discoveryEnergy: 5,
    };

    const mockCard = {
      id: 'card-1',
      name: 'Test Card',
      nameTh: 'การ์ดทดสอบ',
      description: 'Test description',
      descriptionTh: 'คำอธิบายทดสอบ',
      lore: 'Test lore',
      loreTh: 'เรื่องเล่าทดสอบ',
      element: 'EMBERBOUND',
      rarity: 'RARE',
      role: 'WARRIOR',
      atk: 100,
      def: 80,
      hp: 150,
      spd: 50,
      manaCost: 3,
      skill1Name: 'Skill 1',
      skill1Desc: 'Skill 1 Desc',
      skill1ManaCost: 2,
      skill2Name: 'Skill 2',
      skill2Desc: 'Skill 2 Desc',
      skill2ManaCost: 3,
    };

    it('should create new card on first discovery', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.discoveryLog.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.cardDefinition.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.cardDefinition.create as jest.Mock).mockResolvedValue(mockCard);
      (prisma.user.update as jest.Mock).mockResolvedValue({ discoveryEnergy: 4 });
      (prisma.discoveryLog.create as jest.Mock).mockResolvedValue({});
      (prisma.userCard.upsert as jest.Mock).mockResolvedValue({});

      const result = await DiscoveryService.discover('user-1', [1, 2, 3, 4, 5, 6, 7, 8]);

      expect(result.discovery.isFirstDiscovery).toBe(true);
      expect(result.card.name).toBe('Test Card');
      expect(prisma.cardDefinition.create).toHaveBeenCalled();
    });

    it('should return existing card on duplicate discovery', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.discoveryLog.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.cardDefinition.findUnique as jest.Mock).mockResolvedValue(mockCard);
      (prisma.cardDefinition.update as jest.Mock).mockResolvedValue({});
      (prisma.user.update as jest.Mock).mockResolvedValue({ discoveryEnergy: 4 });
      (prisma.discoveryLog.create as jest.Mock).mockResolvedValue({});
      (prisma.userCard.upsert as jest.Mock).mockResolvedValue({});

      const result = await DiscoveryService.discover('user-1', [1, 2, 3, 4, 5, 6, 7, 8]);

      expect(result.discovery.isFirstDiscovery).toBe(false);
      expect(prisma.cardDefinition.create).not.toHaveBeenCalled();
      expect(prisma.cardDefinition.update).toHaveBeenCalled();
    });

    // Phase 13: ใบซ้ำต้องนับเป็นอีกใบ (x2, x3, ...)
    it('ค้นพบใบซ้ำที่มีอยู่แล้ว → เพิ่ม quantity +1 และคืนยอดรวมใหม่', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.discoveryLog.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.cardDefinition.findUnique as jest.Mock).mockResolvedValue(mockCard);
      (prisma.cardDefinition.update as jest.Mock).mockResolvedValue({});
      (prisma.user.update as jest.Mock).mockResolvedValue({ discoveryEnergy: 4 });
      (prisma.discoveryLog.create as jest.Mock).mockResolvedValue({});
      (prisma.userCard.findUnique as jest.Mock).mockResolvedValue({ quantity: 2 });
      (prisma.userCard.upsert as jest.Mock).mockResolvedValue({});

      const result = await DiscoveryService.discover('user-1', [1, 2, 3, 4, 5, 6, 7, 8]);

      expect(result.discovery.isDuplicate).toBe(true);
      expect(result.owned.quantity).toBe(3);
      expect(prisma.userCard.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { quantity: { increment: 1 } },
        })
      );
    });

    it('ค้นพบใบใหม่ → สร้างใบแรกด้วย quantity 1 (ไม่ใช่ใบซ้ำ)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.discoveryLog.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.cardDefinition.findUnique as jest.Mock).mockResolvedValue(mockCard);
      (prisma.cardDefinition.update as jest.Mock).mockResolvedValue({});
      (prisma.user.update as jest.Mock).mockResolvedValue({ discoveryEnergy: 4 });
      (prisma.discoveryLog.create as jest.Mock).mockResolvedValue({});
      (prisma.userCard.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.userCard.upsert as jest.Mock).mockResolvedValue({});

      const result = await DiscoveryService.discover('user-1', [1, 2, 3, 4, 5, 6, 7, 8]);

      expect(result.discovery.isDuplicate).toBe(false);
      expect(result.owned.quantity).toBe(1);
      expect(prisma.userCard.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ quantity: 1 }),
        })
      );
    });

    it('idempotency key เดิม → ไม่หักพลังงานและไม่เพิ่มจำนวนใบ', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.discoveryLog.findUnique as jest.Mock).mockResolvedValue({ cardId: 'card-1' });
      (prisma.cardDefinition.findUnique as jest.Mock).mockResolvedValue(mockCard);
      (prisma.userCard.findUnique as jest.Mock).mockResolvedValue({ quantity: 2 });

      const result = await DiscoveryService.discover('user-1', [1, 2, 3, 4, 5, 6, 7, 8], 'key-1');

      expect(result.owned.quantity).toBe(2);
      expect(result.discovery.isDuplicate).toBe(false);
      expect(prisma.userCard.upsert).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    // Regression: เคยเกิด 500 (Unique constraint user_id+card_id) เมื่อค้นพบการ์ดซ้ำ
    // ที่ผู้เล่นมีการ์ดใบนั้นอยู่แล้ว — ต้อง idempotent ไม่ throw
    it('ค้นพบการ์ดซ้ำที่ผู้เล่นมีอยู่แล้ว → ไม่ throw และใช้ upsert', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.discoveryLog.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.cardDefinition.findUnique as jest.Mock).mockResolvedValue(mockCard);
      (prisma.cardDefinition.update as jest.Mock).mockResolvedValue({});
      (prisma.user.update as jest.Mock).mockResolvedValue({ discoveryEnergy: 4 });
      (prisma.discoveryLog.create as jest.Mock).mockResolvedValue({});
      (prisma.userCard.upsert as jest.Mock).mockResolvedValue({});

      await expect(
        DiscoveryService.discover('user-1', [1, 2, 3, 4, 5, 6, 7, 8])
      ).resolves.toBeDefined();

      expect(prisma.userCard.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_cardId: { userId: 'user-1', cardId: 'card-1' } },
          // Phase 13: ใบซ้ำ = ได้อีกใบ (quantity +1)
          update: { quantity: { increment: 1 } },
        })
      );
      expect(prisma.userCard.create).not.toHaveBeenCalled();
    });

    it('should throw error if energy is 0', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        discoveryEnergy: 0,
      });

      await expect(
        DiscoveryService.discover('user-1', [1, 2, 3, 4, 5, 6, 7, 8])
      ).rejects.toThrow('พลังค้นหาไม่เพียงพอ');
    });

    it('should return cached result for idempotent request', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.discoveryLog.findUnique as jest.Mock).mockResolvedValue({
        cardId: 'card-1',
      });
      (prisma.cardDefinition.findUnique as jest.Mock).mockResolvedValue(mockCard);

      const result = await DiscoveryService.discover(
        'user-1',
        [1, 2, 3, 4, 5, 6, 7, 8],
        'idem-key-123'
      );

      expect(result.discovery.isFirstDiscovery).toBe(false);
      expect(prisma.cardDefinition.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
