import crypto from 'crypto';
import { Element, Rarity, CardRole } from '@/types';

const ELEMENTS: Element[] = ['EMBERBOUND', 'TIDEBORN', 'SKYRIVEN', 'ROOTFORGED', 'DAWNSWORN', 'VEILMARKED'];
const RARITIES: Rarity[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
const ROLES: CardRole[] = ['WARRIOR', 'MAGE', 'HEALER', 'TANK', 'ASSASSIN', 'SUPPORT'];

const ELEMENT_NAMES: Record<Element, { th: string; en: string }> = {
  EMBERBOUND: { th: 'เพลิง', en: 'Emberbound' },
  TIDEBORN: { th: 'น้ำ', en: 'Tideborn' },
  SKYRIVEN: { th: 'ลม', en: 'Skyriven' },
  ROOTFORGED: { th: 'ดิน', en: 'Rootforged' },
  DAWNSWORN: { th: 'แสง', en: 'Dawnsworn' },
  VEILMARKED: { th: 'เงา', en: 'Veilmarked' },
};

const ROLE_NAMES: Record<CardRole, { th: string; en: string }> = {
  WARRIOR: { th: 'นักรบ', en: 'Warrior' },
  MAGE: { th: 'จอมเวท', en: 'Mage' },
  HEALER: { th: 'ผู้รักษา', en: 'Healer' },
  TANK: { th: 'ผู้พิทักษ์', en: 'Tank' },
  ASSASSIN: { th: 'นักฆ่า', en: 'Assassin' },
  SUPPORT: { th: 'ผู้สนับสนุน', en: 'Support' },
};

// ===== คลังคำ (ธีม Aetherra ตาม GDD §2 / §10.4) =====
// ทุกอย่าง deterministic: เลือกด้วย index ที่มาจาก hash เท่านั้น (ห้าม Math.random)

/** สกิลประจำธาตุ — 6 แบบต่อธาตุ (ชื่อ/คำอธิบายตามทิศทางศิลป์ของ GDD) */
const ELEMENT_SKILLS: Record<Element, Array<{ th: string; en: string; desc: string }>> = {
  EMBERBOUND: [
    { th: 'คมดาบเถ้าร้อน', en: 'Ashen Edge', desc: 'ฟันกว้างและติด Burn 2 รอบ' },
    { th: 'ระเบิดถ่านไฟ', en: 'Cinder Burst', desc: 'ระเบิดเถ้าถ่านใส่แนวหน้าเป็นวง' },
    { th: 'ลมหายใจภูเขาไฟ', en: 'Volcanic Breath', desc: 'พ่นเปลวไฟยาว โจมตีสองเป้าหมาย' },
    { th: 'เกราะหินหลอม', en: 'Molten Plate', desc: 'หลอมหินเป็นโล่ ลดดาเมจที่ได้รับ' },
    { th: 'ตราสาบานเพลิง', en: 'Ember Oath', desc: 'สาบานกับเปลวไฟ เพิ่ม ATK ให้ตัวเอง' },
    { th: 'งานศพแห่งเปลวเพลิง', en: 'Pyre Rite', desc: 'เผาผลาญ HP ตัวเองเพื่อดาเมจมหาศาล' },
  ],
  TIDEBORN: [
    { th: 'วังวนแห่งความทรงจำ', en: 'Maelstrom of Memory', desc: 'ฟื้นฟูหลายเป้าหมายและล้าง Weaken' },
    { th: 'คลื่นเงียบสงบ', en: 'Still Tide', desc: 'ทำให้ศัตรูสูญเสียความเร็วชั่วคราว' },
    { th: 'น้ำตาแห่งสายหมอก', en: 'Mistfall Tears', desc: 'รักษา HP ต่ำสุดของทีม' },
    { th: 'คริสตัลน้ำแข็ง', en: 'Frost Crystal', desc: 'แช่แข็งเป้าหมาย 1 เทิร์น' },
    { th: 'โล่เกลียวคลื่น', en: 'Tidal Aegis', desc: 'สร้างโล่ให้แนวหน้าและล้าง debuff' },
    { th: 'คำสัญญาที่น้ำจำได้', en: 'Vowed Current', desc: 'ชุบพันธมิตรที่หมดสภาพ 1 ครั้ง' },
  ],
  SKYRIVEN: [
    { th: 'ขนนกพายุ', en: 'Stormplume', desc: 'เพิ่มความเร็วให้ทีม 2 เทิร์น' },
    { th: 'ลมตัดผ่าน', en: 'Cutting Gale', desc: 'โจมตีแนวกลางและหลังพร้อมกัน' },
    { th: 'ก้าวเงาลม', en: 'Windstep', desc: 'หลบการโจมตีครั้งถัดไปทั้งหมด' },
    { th: 'เสียงข่าวจากฟ้า', en: 'Skyborne Word', desc: 'เปิดเผยสถานะศัตรูทั้งหมด' },
    { th: 'พายุหมุนเกลียว', en: 'Vortex Spiral', desc: 'ดึงศัตรูแนวหลังออกมาแนวหน้า' },
    { th: 'ลมหายใจแรกของอรุณ', en: 'First Wind', desc: 'เทิร์นแรกโจมตีสองครั้ง' },
  ],
  ROOTFORGED: [
    { th: 'ป้อมปราการรากลึก', en: 'Deeproot Bastion', desc: 'สร้าง Shield ทั้งทีมและดึงการโจมตี' },
    { th: 'กำปั้นศิลา', en: 'Stonefist', desc: 'โจมตีหนักทำให้ศัตรูติด Stun' },
    { th: 'รากพันธนาการ', en: 'Binding Roots', desc: 'ล็อกศัตรูไม่ให้เปลี่ยนแนว' },
    { th: 'ผลึกโบราณ', en: 'Ancient Crystal', desc: 'เพิ่ม DEF ให้ทีมทั้งทีม' },
    { th: 'ภูเขาล้ม', en: 'Mountainfall', desc: 'สลัดดาเมจวงกว้างลงพื้นสนาม' },
    { th: 'คำสาบานแห่งเหมืองลึก', en: "Deepmine Oath", desc: 'ฟื้น HP ตามค่า DEF ของตัวเอง' },
  ],
  DAWNSWORN: [
    { th: 'โคมอรุณนิรันดร์', en: 'Eternal Dawn Lamp', desc: 'รักษาเป้าหมายที่ HP ต่ำสุดและให้ Shield' },
    { th: 'รัศมีคำมั่น', en: 'Oathlight', desc: 'เพิ่มพลังป้องกันให้พันธมิตรทุกแนว' },
    { th: 'แสงศักดิ์สิทธิ์', en: 'Holy Radiance', desc: 'สร้างดาเมจแก่ Veilmarked เป็นพิเศษ' },
    { th: 'รูนเรขาคณิต', en: 'Geometric Rune', desc: 'วาดรูนบนพื้นเพื่อเพิ่มพลังแนวหน้า' },
    { th: 'อรุณแรกของวัน', en: 'First Light', desc: 'ล้าง debuff ให้ทั้งทีม' },
    { th: 'ดวงดาวนำทาง', en: 'Guiding Star', desc: 'เพิ่มความแม่นยำและอัตราคริติคอล' },
  ],
  VEILMARKED: [
    { th: 'ประตูไร้จันทร์', en: 'Moonless Gate', desc: 'เปิดประตูเงา ลด DEF ศัตรูทั้งทีม' },
    { th: 'หมอกกลืนนาม', en: 'Nameless Veil', desc: 'ทำให้ศัตรูใช้สกิลไม่ได้ 1 เทิร์น' },
    { th: 'รอยแยกเงา', en: 'Shadow Rift', desc: 'ฉีกช่องว่าง โจมตีทะลุแนวป้องกัน' },
    { th: 'คำสาปจันทรา', en: 'Lunar Curse', desc: 'สาปให้ศัตรูเสีย HP ทุกเทิร์น' },
    { th: 'สายตาผู้สังเกต', en: "Watcher's Eye", desc: 'เห็นการกระทำถัดไปของศัตรู' },
    { th: 'สัญญาแห่งความลับ', en: 'Pact of Secrets', desc: 'แลก HP เป็นดาเมจที่หลบไม่ได้' },
  ],
};

/** คำเปิด lore ตามธาตุ (ไทย) — ใช้กับ "อักษรแรกเริ่ม" ตาม GDD §2.1 */
const LORE_OPENING_TH: Record<Element, string[]> = {
  EMBERBOUND: ['อักษรแรกเริ่มถูกเผาไว้บนเถ้าถ่านว่า', 'ในเตาหลอมที่ไม่มีวันดับ', 'เมื่อเปลวไฟสุดท้ายยังไม่มอด'],
  TIDEBORN: ['สายน้ำใน Aetherra จดจำเรื่องนี้ไว้ว่า', 'ที่ก้นบึงแห่งความทรงจำ', 'ใต้กระแสน้ำที่ไหลย้อนเวลา'],
  SKYRIVEN: ['ลมส่งข่าวนี้มาไกลว่า', 'บนยอดเขาที่เมฆไม่เคยแตะ', 'เมื่อพายุพัดผ่านชายแดนโลก'],
  ROOTFORGED: ['ศิลาโบราณสลักไว้เป็นพยานว่า', 'ใต้รากไม้ที่หยั่งถึงแก่นโลก', 'ในเหมืองลึกที่แสงไม่เคยส่องถึง'],
  DAWNSWORN: ['แสงอรุณสาบานไว้กับผู้คนว่า', 'ในวันที่ฟ้ายังไม่สว่าง', 'บนหอคอยที่จับดวงดาวเป็นแผนที่'],
  VEILMARKED: ['เงาในประตูไร้จันทร์กระซิบว่า', 'ที่ซึ่งแผนที่สิ้นสุดลง', 'เมื่อดวงจันทร์ถูกซ่อนจากฟ้า'],
};

/** คำปิด lore ตามธาตุ (ไทย) */
const LORE_CLOSING_TH: Record<Element, string[]> = {
  EMBERBOUND: ['จนกว่าเปลวไฟสุดท้ายจะดับลง', 'และเถ้าถ่านยังอุ่นอยู่เสมอ', 'รอวันที่เตาหลอมถูกจุดอีกครั้ง'],
  TIDEBORN: ['แม้แต่คำสัญญาที่เจ้าของพยายามลืม', 'น้ำยังคงจดจำได้ทุกหยด', 'จนกระแสน้ำพัดความจริงกลับคืนมา'],
  SKYRIVEN: ['เพราะลมไม่เคยถูกขังไว้ที่ใด', 'และข่าวนี้จะไปถึงผู้ที่ควรรู้', 'ก่อนพายุลูกถัดไปจะมาถึง'],
  ROOTFORGED: ['รากยังหยั่งลึกลงทุกคืน', 'และภูเขาจดจำทุกก้าวที่ผ่านมา', 'จนกว่าแผ่นดินจะสิ้นความอดทน'],
  DAWNSWORN: ['คำสาบานนั้นไม่เคยเสื่อมสลาย', 'แสงจะกลับมาเสมอเมื่อถึงเวลา', 'และความหวังยังไม่เคยหมดไป'],
  VEILMARKED: ['ความจริงที่ซ่อนอยู่ยังคงรออยู่', 'และทุกความลับมีราคาที่ต้องจ่าย', 'จนกว่าจะมีผู้กล้าเปิดประตูนั้น'],
};

/** คำเปิด lore ตามธาตุ (อังกฤษ) */
const LORE_OPENING_EN: Record<Element, string[]> = {
  EMBERBOUND: ['Scorched into the first script:', 'Forged where the furnaces never sleep:', 'While the last flame still smouldered,'],
  TIDEBORN: ['The rivers of Aetherra remember that', 'Beneath the marsh of memory,', 'Where the current runs against time,'],
  SKYRIVEN: ['The wind carried word that', 'Above the peaks the clouds never touch,', "When the storm crossed the world's edge,"],
  ROOTFORGED: ['Ancient stone carved witness that', "Under roots that reach the world's core,", 'In mines where light never fell,'],
  DAWNSWORN: ['Dawnlight swore to the people that', 'On the morning the sky stayed dark,', 'From towers that chart the stars,'],
  VEILMARKED: ['The shadow at the Moonless Gate whispers that', 'Where the maps simply end,', 'When the moon was hidden from the sky,'],
};

/** คำปิด lore ตามธาตุ (อังกฤษ) */
const LORE_CLOSING_EN: Record<Element, string[]> = {
  EMBERBOUND: ['until the final flame goes dark', 'and the ashes stay warm forever', 'waiting for the forge to be lit again'],
  TIDEBORN: ['even the promise its owner tried to forget', 'the water still holds every drop', 'until the current brings the truth back'],
  SKYRIVEN: ['because wind was never meant to be caged', 'and the word will reach those who should hear it', 'before the next storm arrives'],
  ROOTFORGED: ['the roots still reach deeper every night', 'and the mountain remembers every step', 'until the land runs out of patience'],
  DAWNSWORN: ['that oath has never been broken', 'light always returns in time', 'and hope has never run out'],
  VEILMARKED: ['the hidden truth is still waiting', 'and every secret carries its price', 'until someone brave opens that gate'],
};

// ===== คลังชื่อการ์ด (ธีม Aetherra) =====
// ชื่อไทย = "<ชื่อเฉพาะ> <ฉายาบทบาท+ธาตุ>" เช่น "เคล ผู้พิทักษ์เถ้าถ่าน"
// ชื่ออังกฤษ = "<Name>, <Element Epithet> <Role Title>" เช่น "Kael, Ashen Vanguard"

/** ชื่อเฉพาะไทย: พยางค์หน้า + พยางค์ท้าย ต่อธาตุ (8×8 = 64 ชื่อ/ธาตุ) */
const TH_NAME_PARTS: Record<Element, { head: string[]; tail: string[] }> = {
  EMBERBOUND: {
    head: ['เคล', 'บรัน', 'อัค', 'ซัล', 'อิก', 'เพล', 'วีร', 'ถ่าน'],
    tail: ['นี', 'รัน', 'นาร์', 'ไฟ', 'ธา', 'กาญจน์', 'รมณ์', 'เศียร'],
  },
  TIDEBORN: {
    head: ['เนริส', 'ทา', 'มรกต', 'วารี', 'ธารา', 'อา', 'โล', 'มีนา'],
    tail: ['ซา', 'รินทร์', 'นที', 'วาร', 'ธาร', 'คลา', 'รุณ', 'สมุทร'],
  },
  SKYRIVEN: {
    head: ['ไซ', 'ลัน', 'อร', 'พายุ', 'เวหา', 'นก', 'ริ', 'เศวต'],
    tail: ['รัน', 'ญา', 'นภา', 'เมฆ', 'ลม', 'หทัย', 'รีย์', 'อนันต์'],
  },
  ROOTFORGED: {
    head: ['บรอมม์', 'ศิลา', 'ธรณี', 'ราก', 'คีรี', 'ป่า', 'อัม', 'ดิน'],
    tail: ['ม์', 'ธานี', 'คราม', 'ภัณฑ์', 'ภู', 'วดี', 'รัน', 'ธร'],
  },
  DAWNSWORN: {
    head: ['ออเร', 'อรุ', 'สุร', 'ทิว', 'ประ', 'อัมพร', 'ไอร', 'อรุณ'],
    tail: ['เลีย', 'ณี', 'ยันต์', 'แสง', 'ภา', 'รีย์', 'วดี', 'ศรี'],
  },
  VEILMARKED: {
    head: ['มอร์', 'วี', 'นิล', 'อสูร', 'เงา', 'จัน', 'อาภา', 'ราตรี'],
    tail: ['โรว์', 'เศวต', 'กาล', 'พราง', 'จันทร์', 'ธานี', 'ณี', 'นิล'],
  },
};

/** ชื่อเฉพาะอังกฤษ (invented) ต่อธาตุ */
const EN_NAMES: Record<Element, string[]> = {
  EMBERBOUND: ['Kael', 'Brenn', 'Ashra', 'Ignis', 'Pyrrhus', 'Emberly', 'Sindri', 'Calder'],
  TIDEBORN: ['Nerissa', 'Tavian', 'Maren', 'Thalos', 'Oceane', 'Brinn', 'Lysander', 'Cirrus'],
  SKYRIVEN: ['Zephyra', 'Lanan', 'Auren', 'Skye', 'Riven', 'Nimbe', 'Talon', 'Halcyon'],
  ROOTFORGED: ['Bromm', 'Thorne', 'Galen', 'Mossgard', 'Cairn', 'Oren', 'Silva', 'Bastion'],
  DAWNSWORN: ['Aurelia', 'Soleil', 'Dawna', 'Lumen', 'Orin', 'Seraphine', 'Aubin', 'Radiant'],
  VEILMARKED: ['Morrow', 'Vesper', 'Nocturne', 'Umbra', 'Sable', 'Lyra', 'Eclipse', 'Sablethorn'],
};

/** ฉายาตามบทบาท (ไทย) — ใช้ร่วมกับวลีธาตุ */
const TH_ROLE_TITLES: Record<CardRole, string[]> = {
  WARRIOR: ['นักรบ', 'ผู้ถือดาบ', 'วีรชน', 'ทหารกล้า', 'ผู้ไม่ถอย', 'ดาบนำทาง'],
  MAGE: ['จอมเวท', 'ผู้ร่ายรูน', 'นักปราชญ์', 'ผู้ครองคาถา', 'นักอ่านอักษร', 'ผู้เปิดประตู'],
  HEALER: ['ผู้รักษา', 'ผู้เยียวยา', 'มือหาญ', 'ผู้ปลุกชีพ', 'ผู้บรรเทา', 'ธาราแห่งชีวิต'],
  TANK: ['ผู้พิทักษ์', 'ปราการ', 'โล่มีชีวิต', 'ผู้ยืนหยัด', 'กำแพงศิลา', 'ผู้กั้นภัย'],
  ASSASSIN: ['นักฆ่า', 'เงาฉับไว', 'ผู้ลอบเร้น', 'คมเงา', 'นักล่าเงา', 'ผู้ไร้เสียง'],
  SUPPORT: ['ผู้สนับสนุน', 'ผู้เก็บรักษา', 'ผู้ส่งสาร', 'ผู้ประสาน', 'ผู้แบกรับคำสาบาน', 'ผู้ค้ำจุน'],
};

/** วลีธาตุ (ไทย) — ต่อท้ายฉายาบทบาท */
const TH_ELEMENT_PHRASES: Record<Element, string[]> = {
  EMBERBOUND: ['เถ้าถ่าน', 'เปลวเพลิง', 'เตาหลอม', 'ถ่านแดง', 'ภูเขาไฟ', 'ประกายไฟ'],
  TIDEBORN: ['กระแสน้ำ', 'ความทรงจำ', 'วังวนลึก', 'คลื่นเงียบ', 'คริสตัลน้ำ', 'สายหมอก'],
  SKYRIVEN: ['ลมพายุ', 'ท้องฟ้า', 'ขนนก', 'เมฆาวก', 'ข่าวจากฟ้า', 'เสรีภาพ'],
  ROOTFORGED: ['รากลึก', 'ศิลาโบราณ', 'เหมืองลึก', 'ภูผา', 'ผลึกดิน', 'ความอดทน'],
  DAWNSWORN: ['อรุณ', 'คำสาบาน', 'แสงทอง', 'ดวงดาว', 'รัศมี', 'ความหวัง'],
  VEILMARKED: ['ประตูไร้จันทร์', 'เงามืด', 'ความลับ', 'จันทรา', 'หมอกเงา', 'รอยแยก'],
};

/** คำคุณศัพท์ธาตุ (อังกฤษ) — ต่อหน้าฉายาบทบาท */
const EN_ELEMENT_EPITHETS: Record<Element, string[]> = {
  EMBERBOUND: ['Ashen', 'Cindersworn', 'Emberbound', 'Molten', 'Pyre', 'Scorched'],
  TIDEBORN: ['Tidewrought', 'Mistbound', 'Deepwater', 'Tideless', 'Undertow', 'Saltworn'],
  SKYRIVEN: ['Galeborne', 'Skyriven', 'Stormfast', 'Featherlight', 'Windcut', 'Thunderkin'],
  ROOTFORGED: ['Rootbound', 'Stonewrought', 'Deepmine', 'Mossgrown', 'Ironroot', 'Cairnsworn'],
  DAWNSWORN: ['Dawnsworn', 'Sunlit', 'Oathbound', 'Starbright', 'Golden', 'Radiant'],
  VEILMARKED: ['Veilmarked', 'Moonless', 'Shadowbound', 'Nameless', 'Nightwrought', 'Silent'],
};

/** ฉายาบทบาท (อังกฤษ) */
const EN_ROLE_TITLES: Record<CardRole, string[]> = {
  WARRIOR: ['Vanguard', 'Bladebearer', 'Warblade', 'Frontliner', 'Duellist', 'Swordwarden'],
  MAGE: ['Runecaster', 'Archmage', 'Spellwright', 'Seer', 'Gatemaker', 'Scrollkeeper'],
  HEALER: ['Lifebinder', 'Mender', 'Waterspeaker', 'Restorer', 'Vitalist', 'Dawnwhisper'],
  TANK: ['Colossus', 'Bulwark', 'Shieldwall', 'Bastion', 'Steadfast', 'Warden'],
  ASSASSIN: ['Shade', 'Nightblade', 'Stalker', 'Silentfang', 'Ghoststep', 'Quickcut'],
  SUPPORT: ['Keeper', 'Herald', 'Oathkeeper', 'Beacon', 'Conduit', 'Bannerman'],
};

/** คำนำหน้าตามระดับความหายาก (ไทย) — เพิ่มความขลังในการ์ดสูง */
const TH_RARITY_PREFIX: Record<Rarity, string[]> = {
  COMMON: [''],
  UNCOMMON: [''],
  RARE: [''],
  EPIC: ['แกรนด์', 'สูงส่ง'],
  LEGENDARY: ['มหา', 'ราชัน', 'วีร'],
  MYTHIC: ['เทวะ', 'อมตะ', 'ปฐม'],
};

/** คำนำหน้าตามระดับความหายาก (อังกฤษ) */
const EN_RARITY_PREFIX: Record<Rarity, string[]> = {
  COMMON: [''],
  UNCOMMON: [''],
  RARE: [''],
  EPIC: ['High', 'Sovereign'],
  LEGENDARY: ['Grand', 'Royal', 'Arch'],
  MYTHIC: ['Elder', 'Primeval', 'Ascended'],
};


export function buildCanonicalString(runes: number[]): string {
  const sorted = [...runes].sort((a, b) => a - b);
  const padded = sorted.map(r => r.toString().padStart(4, '0'));
  return `version=1|runes=${padded.join(',')}`;
}

/**
 * Hash seed with SHA-256 + Server Pepper
 */
export function hashSeed(canonicalString: string): string {
  const pepper = process.env.SERVER_PEPPER || 'default-pepper-change-me';
  return crypto.createHash('sha256').update(canonicalString + pepper).digest('hex');
}

/**
 * Deterministic PRNG from hash
 */
function seededRandom(seed: string, index: number): number {
  const hash = crypto.createHash('sha256').update(seed + index).digest('hex');
  const value = parseInt(hash.substring(0, 8), 16);
  return value / 0xFFFFFFFF;
}

/**
 * Pick deterministic value from array
 */
function pickFromArray<T>(hash: string, index: number, array: T[]): T {
  const random = seededRandom(hash, index);
  return array[Math.floor(random * array.length)];
}

/**
 * Generate card stats deterministically from hash
 */
function generateStats(hash: string, rarity: Rarity): { atk: number; def: number; hp: number; spd: number; manaCost: number } {
  const rarityMultiplier: Record<Rarity, number> = {
    COMMON: 1.0,
    UNCOMMON: 1.2,
    RARE: 1.5,
    EPIC: 1.8,
    LEGENDARY: 2.2,
    MYTHIC: 2.8,
  };

  const multiplier = rarityMultiplier[rarity];
  const baseAtk = Math.floor(seededRandom(hash, 100) * 50 + 20);
  const baseDef = Math.floor(seededRandom(hash, 101) * 40 + 15);
  const baseHp = Math.floor(seededRandom(hash, 102) * 100 + 50);
  const baseSpd = Math.floor(seededRandom(hash, 103) * 30 + 10);
  const manaCost = Math.floor(seededRandom(hash, 104) * 8 + 2);

  return {
    atk: Math.floor(baseAtk * multiplier),
    def: Math.floor(baseDef * multiplier),
    hp: Math.floor(baseHp * multiplier),
    spd: baseSpd,
    manaCost,
  };
}

/**
 * Generate skills deterministically from hash
 */
function generateSkills(hash: string, element: Element): { name: string; nameEn: string; description: string; manaCost: number }[] {
  const pool = ELEMENT_SKILLS[element] ?? ELEMENT_SKILLS.VEILMARKED;
  const numSkills = Math.floor(seededRandom(hash, 200) * 2) + 1; // 1–2 สกิล

  const pickSkill = (index: number, avoid?: string) => {
    let picked = pool[Math.floor(seededRandom(hash, index) * pool.length) % pool.length];
    if (avoid && picked.th === avoid) {
      // ใบเดียวไม่ควรมีสกิลซ้ำกัน → เลื่อนไปตัวถัดไปในคลังของธาตุนั้น
      const at = pool.findIndex((s) => s.th === picked.th);
      picked = pool[(at + 1) % pool.length];
    }
    return picked;
  };

  const skills: { name: string; nameEn: string; description: string; manaCost: number }[] = [];
  for (let i = 0; i < numSkills; i++) {
    const skill = pickSkill(210 + i, i > 0 ? skills[i - 1].name : undefined);
    skills.push({
      name: skill.th,
      nameEn: skill.en,
      description: skill.desc,
      manaCost: Math.floor(seededRandom(hash, 202 + i) * 5 + 2),
    });
  }

  return skills;
}

/**
 * Generate card name deterministically
 */
function generateName(hash: string, element: Element, role: CardRole, rarity: Rarity): { name: string; nameTh: string } {
  const pick = <T,>(list: T[], index: number): T =>
    list[Math.floor(seededRandom(hash, index) * list.length) % list.length];

  /** ตรวจว่าคำซ้ำกันเองหรือไม่ (เช่น "กำแพงศิลา" + "ศิลาโบราณ" → "ศิลาศิลา") */
  const hasRepeatedChunk = (text: string, window = 3): boolean => {
    const seen = new Set<string>();
    for (let i = 0; i + window <= text.length; i += 1) {
      const chunk = text.slice(i, i + window);
      if (seen.has(chunk)) return true;
      seen.add(chunk);
    }
    return false;
  };

  const thParts = TH_NAME_PARTS[element] ?? TH_NAME_PARTS.VEILMARKED;
  const thHead = pick(thParts.head, 300);
  const thTail = pick(thParts.tail, 301);
  const thTitle = pick(TH_ROLE_TITLES[role] ?? TH_ROLE_TITLES.SUPPORT, 302);
  const thPrefix = pick(TH_RARITY_PREFIX[rarity] ?? [''], 304);

  // เลือกวลีธาตุแบบเลี่ยงคำซ้ำกับฉายาบทบาท
  const phrases = TH_ELEMENT_PHRASES[element] ?? TH_ELEMENT_PHRASES.VEILMARKED;
  const phraseIndex = Math.floor(seededRandom(hash, 303) * phrases.length) % phrases.length;
  let thPhrase = phrases[phraseIndex];
  for (let attempt = 1; attempt < phrases.length && hasRepeatedChunk(`${thTitle}${thPhrase}`); attempt += 1) {
    thPhrase = phrases[(phraseIndex + attempt) % phrases.length];
  }

  const enName = pick(EN_NAMES[element] ?? EN_NAMES.VEILMARKED, 305);
  const enEpithet = pick(EN_ELEMENT_EPITHETS[element] ?? EN_ELEMENT_EPITHETS.VEILMARKED, 306);
  const enTitle = pick(EN_ROLE_TITLES[role] ?? EN_ROLE_TITLES.SUPPORT, 307);
  const enPrefix = pick(EN_RARITY_PREFIX[rarity] ?? [''], 308);

  const enFull = `${enName}, ${enEpithet} ${enTitle}`;

  return {
    name: enPrefix ? `${enPrefix} ${enFull}` : enFull,
    nameTh: `${thPrefix}${thHead}${thTail} ${thTitle}${thPhrase}`,
  };
}

/**
 * Generate lore text deterministically (สองภาษา — ไทย/อังกฤษ)
 */
function generateLore(
  hash: string,
  element: Element,
  nameTh: string,
  name: string
): { lore: string; loreTh: string } {
  const pick = (list: string[], index: number): string =>
    list[Math.floor(seededRandom(hash, index) * list.length) % list.length];

  const openTh = pick(LORE_OPENING_TH[element] ?? LORE_OPENING_TH.VEILMARKED, 400);
  const closeTh = pick(LORE_CLOSING_TH[element] ?? LORE_CLOSING_TH.VEILMARKED, 401);
  const openEn = pick(LORE_OPENING_EN[element] ?? LORE_OPENING_EN.VEILMARKED, 402);
  const closeEn = pick(LORE_CLOSING_EN[element] ?? LORE_CLOSING_EN.VEILMARKED, 403);

  return {
    loreTh: `${openTh} ${nameTh} ${closeTh}`,
    lore: `${openEn} ${name} ${closeEn}`,
  };
}

/** ชื่อดินแดนตามธาตุ — ใช้ในคำอธิบายการ์ด */
const ELEMENT_DOMAIN: Record<Element, { th: string; en: string }> = {
  EMBERBOUND: { th: 'ดินแดนเถ้าถ่าน', en: 'the Ashen Reach' },
  TIDEBORN: { th: 'ห้วงน้ำแห่งความทรงจำ', en: 'the Memory Deeps' },
  SKYRIVEN: { th: 'ยอดเขาลมกว้าง', en: 'the Skyriven Steppe' },
  ROOTFORGED: { th: 'เหมืองใต้รากโลก', en: 'the Rootforge Deeps' },
  DAWNSWORN: { th: 'หออรุณแห่งคำสาบาน', en: 'the Dawnspire' },
  VEILMARKED: { th: 'ประตูไร้จันทร์', en: 'the Moonless Gate' },
};

/**
 * Create card definition from seed hash
 */
export function createCardFromSeed(hash: string): {
  name: string;
  nameTh: string;
  description: string;
  descriptionTh: string;
  lore: string;
  loreTh: string;
  element: Element;
  rarity: Rarity;
  role: CardRole;
  atk: number;
  def: number;
  hp: number;
  spd: number;
  manaCost: number;
  skills: { name: string; nameEn: string; description: string; manaCost: number }[];
  canonicalSeedHash: string;
} {
  // Determine rarity (weighted)
  const rarityRoll = seededRandom(hash, 1);
  let rarity: Rarity;
  if (rarityRoll < 0.40) rarity = 'COMMON';
  else if (rarityRoll < 0.70) rarity = 'UNCOMMON';
  else if (rarityRoll < 0.85) rarity = 'RARE';
  else if (rarityRoll < 0.94) rarity = 'EPIC';
  else if (rarityRoll < 0.98) rarity = 'LEGENDARY';
  else rarity = 'MYTHIC';

  // Determine element
  const element = pickFromArray(hash, 2, ELEMENTS);

  // Determine role
  const role = pickFromArray(hash, 3, ROLES);

  // Generate name (ธีม: "<ชื่อเฉพาะ> <ฉายาบทบาท+ธาตุ>")
  const { name, nameTh } = generateName(hash, element, role, rarity);

  // Generate stats
  const stats = generateStats(hash, rarity);

  // Generate skills
  const skills = generateSkills(hash, element);

  // Generate lore (สองภาษา — อ้างชื่อการ์ดเพื่อให้อ่านเป็นเรื่องเดียวกัน)
  const { lore, loreTh } = generateLore(hash, element, nameTh, name);

  return {
    name,
    nameTh,
    description: `A ${role.toLowerCase()} bound to ${ELEMENT_DOMAIN[element].en}.`,
    descriptionTh: `${ROLE_NAMES[role].th}จาก${ELEMENT_DOMAIN[element].th}`,
    lore,
    loreTh,
    element,
    rarity,
    role,
    ...stats,
    skills,
    canonicalSeedHash: hash,
  };
}

/**
 * Validate rune sequence
 */
export function validateRuneSequence(runes: number[]): { valid: boolean; error?: string } {
  if (!Array.isArray(runes)) {
    return { valid: false, error: 'Rune sequence must be an array' };
  }

  if (runes.length < 8 || runes.length > 16) {
    return { valid: false, error: 'Rune sequence must contain 8-16 runes' };
  }

  for (const rune of runes) {
    if (!Number.isInteger(rune) || rune < 0 || rune > 9999) {
      return { valid: false, error: 'Each rune must be an integer between 0 and 9999' };
    }
  }

  return { valid: true };
}
