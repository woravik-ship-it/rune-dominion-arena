/**
 * ข้อมูล "คู่มือผู้เล่นใหม่" (Phase 45.7)
 *
 * ผู้ใช้สั่ง 2026-10-08: *"ช่วยทำ Game guide สำหรับผู้เล่นใหม่ เอาไว้กดดูได้จากเมนูในหน้าแรก"*
 *
 * ทำไมแยกข้อมูลออกมาเป็นโมดูลบริสุทธิ์ (ไม่ฝังใน JSX):
 *  - เทสต์ตรวจได้ว่าคีย์ i18n ของทุกบรรทัด/ทุกข้อมีอยู่จริงทั้ง 2 ภาษา (dict-th + dict-en)
 *    ⇒ หน้าเว็บไม่มีทางโชว์คีย์ดิบ (`guide.start.b1`) ให้ผู้เล่นเห็น
 *  - ลำดับหัวข้อ/แผน 7 วัน/FAQ คงที่ ⇒ สคริปต์ตรวจบนเบราว์เซอร์เทียบจำนวนได้แน่นอน
 */
export interface GuideLink {
  href: string;
  labelKey: string;
}

export interface GuideSection {
  /** ใช้เป็น id ของหัวข้อ (anchor) ด้วย ⇒ ลิงก์ในสารบัญกดแล้วเลื่อนไปถูก */
  id: string;
  icon: string;
  titleKey: string;
  /** คีย์ i18n ของแต่ละบรรทัดในหัวข้อ */
  bullets: string[];
  links?: GuideLink[];
}

export interface GuideFaq {
  qKey: string;
  aKey: string;
}

export interface GuidePlanStep {
  dayKey: string;
  labelKey: string;
  href: string;
}

/** คู่มือฉบับเต็ม (ไฟล์ HTML 117 หน้าในซับโมดูลนี้) — เปิดอ่านเป็นเว็บ/สั่งพิมพ์เป็น PDF ได้ */
export const GUIDE_FULL_MANUAL_URL =
  'https://github.com/woravik-ship-it/rune-dominion-arena/blob/master/docs/manual/index.html';

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'start',
    icon: '🚀',
    titleKey: 'guide.start.title',
    bullets: ['guide.start.b1', 'guide.start.b2', 'guide.start.b3', 'guide.start.b4'],
    links: [
      { href: '/discover', labelKey: 'guide.start.l1' },
      { href: '/decks', labelKey: 'guide.start.l2' },
      { href: '/battle', labelKey: 'guide.start.l3' },
    ],
  },
  {
    id: 'battle',
    icon: '⚔️',
    titleKey: 'guide.battle.title',
    bullets: ['guide.battle.b1', 'guide.battle.b2', 'guide.battle.b3', 'guide.battle.b4', 'guide.battle.b5'],
  },
  {
    id: 'items',
    icon: '🛠️',
    titleKey: 'guide.items.title',
    bullets: ['guide.items.b1', 'guide.items.b2', 'guide.items.b3', 'guide.items.b4'],
    links: [{ href: '/items', labelKey: 'guide.items.l1' }],
  },
  {
    id: 'dungeon',
    icon: '🏰',
    titleKey: 'guide.dungeon.title',
    bullets: ['guide.dungeon.b1', 'guide.dungeon.b2', 'guide.dungeon.b3', 'guide.dungeon.b4'],
    links: [{ href: '/dungeons', labelKey: 'guide.dungeon.l1' }],
  },
  {
    id: 'map',
    icon: '🗺️',
    titleKey: 'guide.map.title',
    bullets: ['guide.map.b1', 'guide.map.b2', 'guide.map.b3', 'guide.map.b4'],
    links: [{ href: '/map', labelKey: 'guide.map.l1' }],
  },
  {
    id: 'economy',
    icon: '💰',
    titleKey: 'guide.economy.title',
    bullets: ['guide.economy.b1', 'guide.economy.b2', 'guide.economy.b3', 'guide.economy.b4'],
  },
  {
    id: 'modes',
    icon: '🏆',
    titleKey: 'guide.modes.title',
    bullets: ['guide.modes.b1', 'guide.modes.b2', 'guide.modes.b3', 'guide.modes.b4'],
    links: [
      { href: '/arena', labelKey: 'guide.modes.l1' },
      { href: '/quests', labelKey: 'guide.modes.l2' },
      { href: '/events', labelKey: 'guide.modes.l3' },
    ],
  },
];

/** แผน 7 วันแรก — ช่องทำเครื่องหมายเก็บไว้ใน localStorage (ดู GuidePlanChecklist ในหน้า /guide) */
export const GUIDE_PLAN: GuidePlanStep[] = [
  { dayKey: 'guide.plan.day1', labelKey: 'guide.plan.s1', href: '/discover' },
  { dayKey: 'guide.plan.day1', labelKey: 'guide.plan.s2', href: '/quests' },
  { dayKey: 'guide.plan.day2', labelKey: 'guide.plan.s3', href: '/dungeons' },
  { dayKey: 'guide.plan.day3', labelKey: 'guide.plan.s4', href: '/items' },
  { dayKey: 'guide.plan.day4', labelKey: 'guide.plan.s5', href: '/map' },
  { dayKey: 'guide.plan.day5', labelKey: 'guide.plan.s6', href: '/items' },
  { dayKey: 'guide.plan.day6', labelKey: 'guide.plan.s7', href: '/arena' },
];

export const GUIDE_FAQ: GuideFaq[] = [
  { qKey: 'guide.faq.q1', aKey: 'guide.faq.a1' },
  { qKey: 'guide.faq.q2', aKey: 'guide.faq.a2' },
  { qKey: 'guide.faq.q3', aKey: 'guide.faq.a3' },
  { qKey: 'guide.faq.q4', aKey: 'guide.faq.a4' },
  { qKey: 'guide.faq.q5', aKey: 'guide.faq.a5' },
  { qKey: 'guide.faq.q6', aKey: 'guide.faq.a6' },
];

/** คีย์ทั้งหมดที่หน้านี้ใช้ (ให้เทสต์ไล่ตรวจว่ามีในพจนานุกรมทั้ง 2 ภาษา) */
export function guideI18nKeys(): string[] {
  const keys = ['guide.title', 'guide.subtitle', 'guide.toc', 'guide.planTitle', 'guide.planHint', 'guide.faqTitle', 'guide.fullTitle', 'guide.fullDesc', 'guide.fullLink', 'guide.backHome', 'guide.tipTitle', 'guide.tipBody'];
  for (const section of GUIDE_SECTIONS) {
    keys.push(section.titleKey, ...section.bullets, ...(section.links ?? []).map((l) => l.labelKey));
  }
  for (const step of GUIDE_PLAN) keys.push(step.dayKey, step.labelKey);
  for (const faq of GUIDE_FAQ) keys.push(faq.qKey, faq.aKey);
  return keys;
}
