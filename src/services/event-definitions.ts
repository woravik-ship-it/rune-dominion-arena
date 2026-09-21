// Event Definitions — Phase 11 (GDD §13)
// ข้อมูลตั้งต้นของ event "Call of the Moonless Gate": milestones / shop / story
import {
  EventMilestoneScope,
  EventRewardType,
} from '@prisma/client';

export interface MilestoneDef {
  scope: EventMilestoneScope;
  tier: number;
  threshold: number;
  title: string;
  titleTh: string;
  rewardType: EventRewardType;
  rewardAmount: number;
  rewardLabel?: string;
}

// Personal Milestones (GDD §13.6)
export const PERSONAL_MILESTONES: MilestoneDef[] = [
  { scope: 'PERSONAL', tier: 1, threshold: 2_000, title: 'Veil Touched', titleTh: 'ผู้สัมผัสม่าน', rewardType: 'COIN', rewardAmount: 100 },
  { scope: 'PERSONAL', tier: 2, threshold: 5_000, title: 'Dust Gatherer', titleTh: 'นักรวบฝุ่นเวท', rewardType: 'CRAFTING_DUST', rewardAmount: 50 },
  { scope: 'PERSONAL', tier: 3, threshold: 10_000, title: 'Rift Observer', titleTh: 'ผู้สังเกตการณ์รอยแยก', rewardType: 'CARD', rewardAmount: 1, rewardLabel: 'ผู้สังเกตการณ์รอยแยก' },
  { scope: 'PERSONAL', tier: 4, threshold: 20_000, title: 'Moonless Frame', titleTh: 'กรอบม่านไร้จันทร์', rewardType: 'COSMETIC', rewardAmount: 1, rewardLabel: 'Avatar Frame: ม่านไร้จันทร์' },
  { scope: 'PERSONAL', tier: 5, threshold: 35_000, title: 'Shadow Variant', titleTh: 'ภาพเงาแห่งรอยแยก', rewardType: 'COSMETIC', rewardAmount: 1, rewardLabel: 'Shadow Card Art Variant' },
  { scope: 'PERSONAL', tier: 6, threshold: 50_000, title: 'Selene Sealer', titleTh: 'เซลิน ผู้ผนึกอรุณ', rewardType: 'CARD', rewardAmount: 1, rewardLabel: 'เซลิน ผู้ผนึกอรุณ' },
  { scope: 'PERSONAL', tier: 7, threshold: 75_000, title: 'Gate Conqueror', titleTh: 'ผู้พิชิตประตูไร้จันทร์', rewardType: 'TITLE', rewardAmount: 1, rewardLabel: 'ผู้พิชิตประตูไร้จันทร์' },
];

// Community Milestones (GDD §13.7)
export const COMMUNITY_MILESTONES: MilestoneDef[] = [
  { scope: 'COMMUNITY', tier: 1, threshold: 1_000_000, title: 'Story Chapter 2', titleTh: 'เนื้อเรื่องบทที่ 2', rewardType: 'STORY_CHAPTER', rewardAmount: 2 },
  { scope: 'COMMUNITY', tier: 2, threshold: 5_000_000, title: 'Veil Shards', titleTh: 'Veil Shards 30', rewardType: 'VEIL_SHARDS', rewardAmount: 30 },
  { scope: 'COMMUNITY', tier: 3, threshold: 10_000_000, title: 'Story Chapter 3 + Shop', titleTh: 'เนื้อเรื่องบทที่ 3 + ของร้านค้า', rewardType: 'STORY_CHAPTER', rewardAmount: 3 },
  { scope: 'COMMUNITY', tier: 4, threshold: 25_000_000, title: 'Cosmetic Banner', titleTh: 'แบนเนอร์ประดับ', rewardType: 'COSMETIC', rewardAmount: 1, rewardLabel: 'Cosmetic Banner' },
  { scope: 'COMMUNITY', tier: 5, threshold: 50_000_000, title: 'Chapter Finale', titleTh: 'บทส่งท้าย + Crafting Dust', rewardType: 'CRAFTING_DUST', rewardAmount: 100 },
];

export interface ShopItemDef {
  code: string;
  name: string;
  nameTh: string;
  descriptionTh: string;
  price: number;
  rewardType: EventRewardType;
  rewardAmount: number;
  perUserLimit: number;
}

// Event Shop — ซื้อด้วย Veil Shards
export const SHOP_ITEMS: ShopItemDef[] = [
  { code: 'SHARD_BUNDLE_COIN', name: 'Coin Cache', nameTh: 'ถุง Coin', descriptionTh: 'แลก Veil Shards เป็น Coin ภายในเกม', price: 15, rewardType: 'COIN', rewardAmount: 150, perUserLimit: 5 },
  { code: 'SHARD_CRAFTING_DUST', name: 'Crafting Dust', nameTh: 'ฝุ่นเวท', descriptionTh: 'วัตถุดิบสำหรับงานคราฟต์', price: 20, rewardType: 'CRAFTING_DUST', rewardAmount: 25, perUserLimit: 5 },
  { code: 'SHARD_COSMETIC_VEIL', name: 'Veil Cosmetic', nameTh: 'เครื่องประดับม่าน', descriptionTh: 'ของประดับธีมม่านไร้จันทร์', price: 60, rewardType: 'COSMETIC', rewardAmount: 1, perUserLimit: 1 },
  { code: 'SHARD_TITLE_RIFT', name: 'Title: Rift Walker', nameTh: 'ฉายา: ผู้เดินรอยแยก', descriptionTh: 'ฉายาเฉพาะกิจกรรม', price: 100, rewardType: 'TITLE', rewardAmount: 1, perUserLimit: 1 },
];

export interface StoryChapterDef {
  chapterNo: number;
  title: string;
  titleTh: string;
  bodyTh: string;
  unlockAtDamage: number;
}

// Story Chapters — ปลดล็อกตาม Community Damage (GDD §13.7)
export const STORY_CHAPTERS: StoryChapterDef[] = [
  {
    chapterNo: 1, title: 'The Rift Opens', titleTh: 'รอยแยกเปิดออก', unlockAtDamage: 0,
    bodyTh: 'เมื่อจันทร์ดับลง รอยแยกแห่งเงาก็ปรากฏขึ้นกลางนคร Aetherra ผู้กล้าจากทุกธาตุถูกเรียกตัวเพื่อยืนหยัดที่หน้าประตูไร้จันทร์',
  },
  {
    chapterNo: 2, title: 'The Reflected Knight', titleTh: 'อัศวินสะท้อนเงา', unlockAtDamage: 1_000_000,
    bodyTh: 'อัศวินในกระจกก้าวออกมาจากรอยแยก เขาสะท้อนทุกการโจมตีกลับ ทีมต้องเรียนรู้ที่จะไม่ตีตามจังหวะของเขา',
  },
  {
    chapterNo: 3, title: 'Moonless Veil', titleTh: 'ม่านไร้จันทร์', unlockAtDamage: 10_000_000,
    bodyTh: 'ม่านหนาทึบปกคลุมสนามรบ แสงสลายลงทุกครั้งที่สัมผัสม่าน ผู้กล้าต้องรวมธาตุให้ครบเพื่อเจาะทะลุม่าน',
  },
  {
    chapterNo: 4, title: 'Echo of Morrow', titleTh: 'เสียงสะท้อนแห่งรุ่งอรุณ', unlockAtDamage: 50_000_000,
    bodyTh: 'เมื่อ HP ของประตูเหลือน้อยกว่า 25% เสียงสะท้อนแห่งรุ่งอรุณก็ดังขึ้น — เป็นเสียงของวันพรุ่งนี้ที่ยังไม่มาถึง และเป็นโอกาสสุดท้ายของผู้กล้า',
  },
];

export interface EventQuestDef {
  name: string;
  nameTh: string;
  descriptionTh: string;
  type: 'DAILY' | 'WEEKLY' | 'MILESTONE' | 'COMMUNITY';
  targetValue: number;
  rewardAmount: number;
  currencyReward: number;
}

// Event Quests — ทำแล้วได้ Veil Shards (GDD §13.2)
export const EVENT_QUESTS: EventQuestDef[] = [
  { name: 'Rift Scout', nameTh: 'สำรวจรอยแยก', descriptionTh: 'เข้าร่วม Raid 3 ครั้ง', type: 'DAILY', targetValue: 3, rewardAmount: 30, currencyReward: 5 },
  { name: 'Shard Collector', nameTh: 'นักสะสมเศษม่าน', descriptionTh: 'สะสม Veil Shards 50 ชิ้น', type: 'WEEKLY', targetValue: 50, rewardAmount: 100, currencyReward: 10 },
  { name: 'Gate Breaker', nameTh: 'ผู้ทลายประตู', descriptionTh: 'สร้างดาเมจรวม 50,000', type: 'MILESTONE', targetValue: 50_000, rewardAmount: 300, currencyReward: 25 },
];
