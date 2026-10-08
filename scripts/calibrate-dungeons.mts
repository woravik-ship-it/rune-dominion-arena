#!/usr/bin/env node
// scripts/calibrate-dungeons.mts — วัด "อัตราชนะจริง" ของดันเจี้ยนแต่ละชั้น (ใช้ปรับความยากไม่ให้เดา)
//
// ทำไมต้องมี: ผู้ใช้แจ้ง "ชั้นแรกๆ ให้มือใหม่ได้ชนะบ้าง และปรับให้ยากขึ้นทีละนิด"
//   ⇒ ต้องวัดว่ามือใหม่ (เด็คเริ่มต้นจริงจากคลังการ์ด) ชนะชั้นไหนกี่ % ก่อน แล้วค่อยขยับตัวเลข
//
// วิธีใช้: npx tsx scripts/calibrate-dungeons.mts [--battles 60]
//   - เด็คมือใหม่ = คัด 5 ใบจากคลังการ์ดด้วยกฎเดียวกับ StarterService (ต่อ seed = 1 ผู้เล่นสมมติ)
//   - เด็คกลาง/เด็คท็อป = คัดการ์ดตามคะแนนพลังที่ percentile ต่างๆ (แทนผู้เล่นที่เล่นมานาน)
//   - ต่อชั้นรันหลาย seed แล้วคิดเป็น % ชนะ (deterministic → รันซ้ำได้ตัวเลขเดิม)
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { buildBattleSeed, skillForElement, type CombatCard } from '../src/services/combat';
import { simulateBattle } from '../src/services/combat-engine';
import { DUNGEONS, scaleStats, type DungeonDef } from '../src/lib/dungeon-definitions';
import { dungeonEnemyInfo, dungeonEnemySlots } from '../src/lib/dungeon-art';
import { ITEM_CATALOG, applyItemStats } from '../src/lib/item-definitions';
import { MAX_SAME_ELEMENT } from '../src/lib/constants';

for (const rawLine of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const arg = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const BATTLES = Math.max(5, Number(arg('--battles', '60')));

interface PoolCard {
  id: string; name: string; nameTh: string | null; element: string;
  atk: number; def: number; hp: number; spd: number;
}

/** คะแนนพลังหยาบ ๆ ใช้เรียงการ์ด (สะท้อนผลจริง: โจมตี/HP/ความเร็วสำคัญ) */
function powerScore(c: PoolCard): number {
  return c.atk * 2 + c.def * 1.2 + c.hp * 0.35 + c.spd * 1.8;
}

/** จัดลำดับการ์ดแบบ deterministic จาก seed */
function rankBy(seed: string, cards: PoolCard[]): PoolCard[] {
  return cards
    .map((card, index) => ({ card, index, rank: createHash('sha256').update(`${seed}|${card.id}`).digest('hex') }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.index - b.index))
    .map((entry) => entry.card);
}

/** เลือก 5 ใบโดยไม่ให้ธาตุเดียวกันเกินเพดาน (แล้วเติมให้ครบถ้าคลังแคบ) */
function chooseFive(ranked: PoolCard[], count = 5): PoolCard[] {
  const chosen: PoolCard[] = [];
  const elementCount: Record<string, number> = {};
  for (const card of ranked) {
    if (chosen.length >= count) break;
    const used = elementCount[card.element] ?? 0;
    if (used >= MAX_SAME_ELEMENT) continue;
    chosen.push(card);
    elementCount[card.element] = used + 1;
  }
  for (const card of ranked) {
    if (chosen.length >= count) break;
    if (!chosen.some((c) => c.id === card.id)) chosen.push(card);
  }
  return chosen;
}

/** คัด 5 ใบแบบเดียวกับ StarterService (sha256 rank + เพดานธาตุ) */
function pickDeck(pool: PoolCard[], seed: string, count = 5): PoolCard[] {
  return chooseFive(rankBy(seed, pool), count);
}

/** เด็คตามช่วงพลัง: weak/mid/top = แทนผู้เล่นใหม่จริง/กลาง/ท็อปของเซิร์ฟเวอร์ */
function pickByPercentile(pool: PoolCard[], label: 'weak' | 'mid' | 'top', count = 5): PoolCard[] {
  const sorted = [...pool].sort((a, b) => powerScore(a) - powerScore(b));
  const band: Record<string, [number, number]> = { weak: [0.15, 0.35], mid: [0.55, 0.75], top: [0.9, 1] };
  const [from, to] = band[label];
  const slice = sorted.slice(Math.floor(sorted.length * from), Math.floor(sorted.length * to));
  return chooseFive(rankBy(`calib|${label}`, slice), count);
}

/** ใส่ Item 3 ช่องให้ทุกใบ (แทนผู้เล่นที่ตีบวกของแล้ว) — legendary = ดรอปจากดันกลาง · mythic = ดันสูงสุด */
function equipDeck(deck: CombatCard[], loadout: 'legendary' | 'mythic'): CombatCard[] {
  const codes = loadout === 'legendary'
    ? ['ATK_RIFTRENDER', 'DEF_VEILGUARD', 'SUP_SELENE_SIGIL']
    : ['ATK_STORMFANG', 'DEF_TITANHEART', 'SUP_WORLDSEED'];
  const stats = codes
    .map((code) => ITEM_CATALOG.find((item) => item.code === code))
    .filter((item): item is (typeof ITEM_CATALOG)[number] => Boolean(item))
    .map((item) => ({ atk: item.atk, def: item.def, hp: item.hp, spd: item.spd }));
  const bonus = stats.reduce(
    (total, s) => ({ atk: total.atk + s.atk, def: total.def + s.def, hp: total.hp + s.hp, spd: total.spd + s.spd }),
    { atk: 0, def: 0, hp: 0, spd: 0 }
  );
  return deck.map((card) => ({ ...card, ...applyItemStats({ atk: card.atk, def: card.def, hp: card.hp, spd: card.spd }, bonus) }));
}
function toCombat(cards: PoolCard[]): CombatCard[] {
  return cards.map((c) => ({
    cardId: c.id, name: c.name, nameTh: c.nameTh, element: c.element,
    atk: c.atk, def: c.def, hp: c.hp, spd: c.spd,
  }));
}

/** ทีมศัตรูของชั้น (ใช้ตัวสร้างเดียวกับตอนสู้จริง) */
function enemyTeam(dungeon: DungeonDef, floorNo: number): CombatCard[] {
  const floor = dungeon.floors.find((f) => f.floor === floorNo);
  if (!floor) return [];
  const out: CombatCard[] = [];
  for (const slot of dungeonEnemySlots(floor)) {
    const info = dungeonEnemyInfo(dungeon, {
      dungeonCode: dungeon.code, floor: floorNo, kind: slot.kind, index: slot.index,
    });
    if (!info) continue;
    out.push({
      cardId: info.cardId, name: info.name, nameTh: info.nameTh, element: info.element,
      atk: info.stats.atk, def: info.stats.def, hp: info.stats.hp, spd: info.stats.spd,
    });
  }
  return out;
}

/** คูณ status ศัตรูด้วยตัวคูณเดียว (ใช้หาว่าตัวคูณไหนให้ % ชนะตามเป้า) */
function scaleEnemy(enemy: CombatCard[], factor: number): CombatCard[] {
  return enemy.map((c) => ({
    ...c,
    atk: Math.max(1, Math.round(c.atk * factor)),
    def: Math.max(0, Math.round(c.def * factor)),
    hp: Math.max(1, Math.round(c.hp * factor)),
  }));
}

/** % ชนะของเด็คหนึ่งชุดในชั้นหนึ่ง (รันหลาย seed) */
function winRate(deck: CombatCard[], enemy: CombatCard[], key: string): number {
  let wins = 0;
  for (let i = 0; i < BATTLES; i += 1) {
    const seed = buildBattleSeed(`${key}:${i}`, deck.map((c) => c.cardId), enemy.map((c) => c.cardId), 'calib');
    if (simulateBattle(deck, enemy, seed).winner === 'A') wins += 1;
  }
  return Math.round((wins / BATTLES) * 100);
}

const prisma = new PrismaClient();
try {
  const pool = (await prisma.cardDefinition.findMany({
    select: { id: true, name: true, nameTh: true, element: true, atk: true, def: true, hp: true, spd: true },
    orderBy: { canonicalSeedHash: 'asc' },
  })) as PoolCard[];

  const beginnerDecks = Array.from({ length: 12 }, (_, i) => toCombat(pickDeck(pool, `starter:calib-${i}`)));
  const midDeck = toCombat(pickByPercentile(pool, 'mid'));
  const topDeck = toCombat(pickByPercentile(pool, 'top'));
  const topLegendary = equipDeck(topDeck, 'legendary');
  const topMythic = equipDeck(topDeck, 'mythic');

  // --scan <code>:<floor> --deck <beginner|top|legendary|mythic>
  //   → หาว่าควรคูณ status ศัตรูกี่เท่าเพื่อให้ได้ % ชนะตามเป้า (ใช้ตั้งเลขฐานของแต่ละดัน)
  let scanned = false;
  if (process.argv.includes('--scan')) {
    const index = process.argv.indexOf('--scan');
    const [code, floorRaw] = (process.argv[index + 1] ?? 'EMBER_CRYPT:1').split(':');
    const dungeon = DUNGEONS.find((d) => d.code === code);
    const deckLabel = arg('--deck', 'beginner');
    const deck = deckLabel === 'top' ? topDeck
      : deckLabel === 'legendary' ? topLegendary
        : deckLabel === 'mythic' ? topMythic
          : midDeck;
    if (dungeon) {
      console.log(`\nสแกน ${code} f${floorRaw} ด้วยเด็ค "${deckLabel}" (${BATTLES} ศึก/จุด)`);
      const factors = (arg('--factors', '0.5,0.7,0.85,1.0,1.15,1.3,1.5,1.7,2.0,2.4'))
        .split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value));
      for (const factor of factors) {
        const enemy = scaleEnemy(enemyTeam(dungeon, Number(floorRaw)), factor);
        const rates = deckLabel === 'beginner'
          ? beginnerDecks.map((d) => winRate(d, enemy, `scan:${code}:${floorRaw}:${factor}`))
          : [winRate(deck, enemy, `scan:${code}:${floorRaw}:${factor}`)];
        const avg = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
        console.log(`  ×${factor.toFixed(2)} → ${String(avg).padStart(3)}% (${Math.min(...rates)}-${Math.max(...rates)})`);
      }
      console.log('');
      scanned = true;
    }
  }

  if (process.argv.includes('--boss-weights')) {
    // Phase 45.5 (2026-10-08): วัด "น้ำหนักจำนวนบอส" ที่ถูกต้องจริง (ผู้ใช้สั่ง "ทำข้อ 2")
    // ที่มา: bossWeight(2)=1.4 / (3)=1.7 ถูกตั้งจากรอบก่อน แต่ผลวัดพบว่าชั้นบอส 2-3 ตัว "ง่ายกว่า"
    //   ชั้นบอส 1 ตัวที่งบเท่ากัน (มือใหม่ชนะ 100% ที่ชั้น 15/20/25 เทียบ 93% ที่ชั้น 5)
    // วิธี: สร้างทีมศัตรูที่ scale เดียวกันแต่จำนวนบอสต่างกัน → หา scale ที่ให้ % ชนะเท่ากัน
    //   อัตราส่วน scale นั้น = น้ำหนักที่แท้จริง (ต้องหาร scale ด้วย 1/น้ำหนัก เมื่อจะให้ความยากเท่ากัน)
    const codeArg = arg('--code', 'EMBER_CRYPT');
    const dungeon = DUNGEONS.find((d) => d.code === codeArg);
    const deckLabel = arg('--deck', '');
    const decks: Array<[string, CombatCard[]]> = deckLabel === 'mid' ? [['กลาง', midDeck]]
      : deckLabel === 'top' ? [['ท็อปดิบ', topDeck]]
        : deckLabel === 'geared' ? [['ท็อป+ของ', topLegendary]]
          : deckLabel === 'mythic' ? [['mythic', topMythic]]
            : [['มือใหม่', beginnerDecks[5]], ['กลาง', midDeck], ['ท็อปดิบ', topDeck]];
    if (!dungeon) {
      console.error(`ไม่พบดัน ${codeArg}`);
    } else {
      const scaled = (base: { atk: number; def: number; hp: number; spd: number }, scale: number) =>
        scaleStats(base, scale);
      /** ทีมศัตรูที่ scale ที่กำหนด (บอส N + ลูกน้อง 5-N) — ไม่ผ่าน floor.scale เพื่อแยกตัวแปร */
      const teamAtScale = (bosses: number, scale: number): CombatCard[] => {
        const out: CombatCard[] = [];
        for (let i = 1; i <= bosses; i += 1) {
          const s = scaled(dungeon.bossBase, scale);
          out.push({ cardId: `${dungeon.code}-b${i}`, name: 'Boss', nameTh: 'บอส', element: 'FIRE', ...s });
        }
        for (let i = 1; i <= 5 - bosses; i += 1) {
          const s = scaled(dungeon.minionBase, scale);
          out.push({ cardId: `${dungeon.code}-m${i}`, name: 'Minion', nameTh: 'ลูกน้อง', element: 'WATER', ...s });
        }
        return out;
      };
      const rate = (deck: CombatCard[], enemy: CombatCard[], key: string) => winRate(deck, enemy, key);

      console.log(`\nวัดน้ำหนักจำนวนบอส · ดัน ${dungeon.nameTh} (${codeArg}) · ${BATTLES} ศึก/จุด`);
      console.log('เด็ค'.padEnd(10), 'scale ที่ให้ 50%', 'บอส 2 ตัว', 'บอส 3 ตัว', '(น้ำหนักที่ควรใช้ = ตัวคูณ scale ที่ให้ผลเท่าบอส 1 ตัว)');
      for (const [label, deck] of decks) {
        // 1) หา scale ที่ทีม "บอส 1 + ลูกน้อง 4" ให้ ~50% ชนะ (ไล่จากง่าย → ยาก แล้วหาจุดตัด)
        const probe: Array<{ scale: number; rate: number }> = [];
        for (let scale = 0.2; scale <= 3.01; scale += 0.15) {
          const s = Number(scale.toFixed(2));
          probe.push({ scale: s, rate: rate(deck, teamAtScale(1, s), `bw:${codeArg}:ref:${label}:${s}`) });
          if (probe[probe.length - 1].rate < 30) break; // ผ่านจุดตัด 50% แล้ว → พอ
        }
        /** scale ที่ให้ % ชนะ = target (ประมาณเชิงเส้นระหว่างจุดวัด) */
        const scaleFor = (target: number): number => {
          for (let i = 1; i < probe.length; i += 1) {
            const a = probe[i - 1];
            const b = probe[i];
            if ((a.rate - target) * (b.rate - target) <= 0 && a.rate !== b.rate) {
              const t = (a.rate - target) / (a.rate - b.rate);
              return Number((a.scale + (b.scale - a.scale) * t).toFixed(3));
            }
          }
          return NaN;
        };
        const refScale = scaleFor(50);
        if (Number.isNaN(refScale)) {
          console.log(`${label}`.padEnd(10), `— หาจุดตัด 50% ไม่ได้ (วัด ${probe.length} จุด: ${probe.map((p) => p.rate).join('/')}%)`);
          continue;
        }
        // 2) เส้นโค้งอ้างอิง: บอส 1 ตัว ที่ scale ref×factor → % ชนะ
        const curve: Array<{ factor: number; rate: number }> = [];
        for (const factor of [0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4, 1.6, 1.9, 2.2, 2.6, 3.0]) {
          curve.push({ factor, rate: rate(deck, teamAtScale(1, refScale * factor), `bw:${codeArg}:1:${label}:${factor}`) });
        }
        /** factor บนเส้นโค้งอ้างอิงที่ให้ % ชนะ = target (น้ำหนักที่แท้จริงของทีมบอส N ตัว) */
        const factorFor = (target: number): number => {
          for (let i = 1; i < curve.length; i += 1) {
            const a = curve[i - 1];
            const b = curve[i];
            if ((a.rate - target) * (b.rate - target) <= 0 && a.rate !== b.rate) {
              const t = (a.rate - target) / (a.rate - b.rate);
              return Number((a.factor + (b.factor - a.factor) * t).toFixed(2));
            }
          }
          return NaN;
        };
        const rate2 = rate(deck, teamAtScale(2, refScale), `bw:${codeArg}:2:${label}`);
        const rate3 = rate(deck, teamAtScale(3, refScale), `bw:${codeArg}:3:${label}`);
        const w2 = factorFor(rate2);
        const w3 = factorFor(rate3);
        console.log(
          `${label}`.padEnd(10),
          `scale ${refScale}`.padEnd(16),
          `${Number.isNaN(w2) ? `>${curve[curve.length - 1].factor} (${rate2}%)` : `×${w2}`}`.padEnd(16),
          `${Number.isNaN(w3) ? `>${curve[curve.length - 1].factor} (${rate3}%)` : `×${w3}`}`
        );
      }
      console.log('');
      scanned = true;
    }
  }

  if (process.argv.includes('--profiles')) {
    // Phase 45.5 (2026-10-08): หา "รูปร่างความยาก" ที่ทำให้เกิดระดับกลาง ไม่ใช่ 0%→100%
    // ที่มา: ดันยอดหอพายุ ชั้นลึก ท็อปดิบชนะ 0% ทุกชั้น / ท็อป+ของชนะ 100% ทุกชั้น (ไม่มีช่วงกลาง)
    // วิธี: คง "งบความแข็งแกร่ง" รวมไว้ แต่เปลี่ยนการกระจาย → ลดความอันตราย (atk/def) แล้วเพิ่ม HP
    //   ถ้าต่อสู้ยาวขึ้น = ผลลัพธ์มีช่วงกลาง (เด็คกลาง ๆ ชนะบ้าง) ⇒ รู้สึกว่าไล่ระดับได้
    const index = process.argv.indexOf('--profiles');
    const [code, floorRaw] = (process.argv[index + 1] ?? 'STORMREACH_SPIRE:40').split(':');
    const dungeon = DUNGEONS.find((d) => d.code === code);
    const deckLabel = arg('--deck', '');
    const deckRows: Array<[string, CombatCard[]]> = deckLabel === 'top' ? [['ท็อปดิบ', topDeck]]
      : deckLabel === 'geared' ? [['ท็อป+ของ', topLegendary]]
        : deckLabel === 'mythic' ? [['mythic', topMythic]]
          : [['ท็อปดิบ', topDeck], ['ท็อป+ของ', topLegendary], ['mythic', topMythic]];
    if (dungeon) {
      const base = enemyTeam(dungeon, Number(floorRaw));
      console.log(`\nทดสอบรูปร่างความยาก · ${dungeon.code} f${floorRaw} · ${BATTLES} ศึก/จุด`);
      console.log('โปรไฟล์'.padEnd(26), deckRows.map(([label]) => label.padEnd(10)).join(''));
      for (const [profile, lethality, hpFactor] of [
        ['ปัจจุบัน ( lethality 1.00 )', 1.0, 1.0],
        ['อึดขึ้น ×1.6 / เบาลง 0.85', 0.85, 1.6],
        ['อึดขึ้น ×2.2 / เบาลง 0.75', 0.75, 2.2],
        ['อึดขึ้น ×3.0 / เบาลง 0.60', 0.6, 3.0],
      ] as const) {
        const enemy = base.map((c) => ({
          ...c,
          atk: Math.max(1, Math.round(c.atk * lethality)),
          def: Math.max(0, Math.round(c.def * lethality)),
          spd: Math.max(1, Math.round(c.spd * lethality)),
          hp: Math.max(1, Math.round(c.hp * hpFactor)),
        }));
        const cells = deckRows.map(([label, deck]) =>
          `${String(winRate(deck, enemy, `prof:${code}:${floorRaw}:${label}:${lethality}x${hpFactor}`)).padStart(3)}%`.padEnd(10)
        );
        console.log(profile.padEnd(26), cells.join(''));
      }
      console.log('');
      scanned = true;
    }
  }

  if (process.argv.includes('--element-probe')) {
    // Phase 45.5 (2026-10-08): วัดว่า "เปลี่ยนธาตุศัตรู (= เปลี่ยนสกิลที่ใช้: BURN/SHIELD/HEAL/HASTE/WEAKEN)"
    // ทำให้เกิดระดับกลางได้จริงไหม (ผู้ใช้สั่ง "ทำข้อ 3" — หา "กลไกอื่น" ให้ดันสูงสุดไล่ระดับได้)
    // ถ้าตัวเลข 0%/100% ยังไม่ขยับ ⇒ บอกได้เลยว่าปัญหาอยู่ที่สมการต่อสู้ ไม่ใช่ที่ตัวเลข status
    const index = process.argv.indexOf('--element-probe');
    const [code, floorRaw] = (process.argv[index + 1] ?? 'STORMREACH_SPIRE:21').split(':');
    const dungeon = DUNGEONS.find((d) => d.code === code);
    if (dungeon) {
      const base = enemyTeam(dungeon, Number(floorRaw));
      const deckRows: Array<[string, CombatCard[]]> = [
        ['ท็อปดิบ', topDeck], ['ท็อป+ของ', topLegendary], ['mythic', topMythic],
      ];
      console.log(`\nทดสอบธาตุ/สกิลศัตรู · ${dungeon.code} f${floorRaw} (ธาตุเดิม: enemies[${dungeon.elements.join(',')}]) · ${BATTLES} ศึก/จุด`);
      console.log('ธาตุศัตรู'.padEnd(18), 'สกิล'.padEnd(10), deckRows.map(([label]) => label.padEnd(10)).join(''));
      for (const element of ['SKYRIVEN', 'VEILMARKED', 'TIDEBORN', 'EMBERBOUND', 'ROOTFORGED']) {
        const enemy = base.map((c) => ({ ...c, element }));
        const cells = deckRows.map(([label, deck]) =>
          `${String(winRate(deck, enemy, `elem:${code}:${floorRaw}:${label}:${element}`)).padStart(3)}%`.padEnd(10)
        );
        console.log(element.padEnd(18), skillForElement(element).status.padEnd(10), cells.join(''));
      }
      console.log('');
      scanned = true;
    }
  }

  if (process.argv.includes('--decks')) {
    const show = (label: string, deck: CombatCard[]) => {
      const sum = (key: 'atk' | 'def' | 'hp' | 'spd') => deck.reduce((total, c) => total + c[key], 0);
      console.log(
        `${label}: ATK ${sum('atk')} · DEF ${sum('def')} · HP ${sum('hp')} · SPD ${sum('spd')} | ` +
        deck.map((c) => `${c.nameTh || c.name}(${c.element.slice(0, 4)} ${c.atk}/${c.hp})`).join(', ')
      );
    };
    beginnerDecks.forEach((deck, i) => show(`มือใหม่ #${i + 1}`, deck));
    show('กลาง', midDeck);
    show('ท็อป', topDeck);
    console.log('');
  }

  if (process.argv.includes('--debug')) {
    const index = process.argv.indexOf('--debug');
    const target = process.argv[index + 1] ?? 'TIDAL_SANCTUM:1';
    const [code, floorRaw] = target.split(':');
    const dungeon = DUNGEONS.find((d) => d.code === code);
    const battles = Number(arg('--debug-battles', '3'));
    if (dungeon) {
      const enemy = enemyTeam(dungeon, Number(floorRaw));
      for (const [label, deck] of [['ท็อป', topDeck], ['มือใหม่#5', beginnerDecks[4]], ['มือใหม่#1', beginnerDecks[0]]] as const) {
        const outcomes: string[] = [];
        for (let i = 0; i < battles; i += 1) {
          const seed = buildBattleSeed(`debug:${code}:${floorRaw}:${i}`, deck.map((c) => c.cardId), enemy.map((c) => c.cardId), 'calib');
          const result = simulateBattle(deck, enemy, seed);
          outcomes.push(`${result.winner}(r${result.roundsPlayed} A=${result.teamAHpRemaining} B=${result.teamBHpRemaining})`);
        }
        console.log(`[${label}] ${code} f${floorRaw}: ${outcomes.join(' · ')}`);
      }
      console.log('');
    }
  }

  if (!scanned) {
    console.log(`การ์ดในคลัง ${pool.length} ใบ · รัน ${BATTLES} ศึก/ช่อง`);
    console.log('ดันเจี้ยน'.padEnd(18), 'ชั้น   ', 'scale ', 'มือใหม่ (12 คน)', 'ท็อปดิบ', 'ท็อป+ของ');
    const onlyFloors = arg('--floors', '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value !== '')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    const keepFloor = (floorNo: number, total: number): boolean => {
      if (onlyFloors.length > 0) return onlyFloors.includes(floorNo);
      if (process.argv.includes('--all-floors')) return true;
      return floorNo <= 5 || floorNo === total || floorNo % 5 === 0;
    };
    for (const dungeon of DUNGEONS) {
      for (const floor of dungeon.floors) {
        if (!keepFloor(floor.floor, dungeon.floors.length)) continue;
        const enemy = enemyTeam(dungeon, floor.floor);
        const rates = beginnerDecks.map((deck) => winRate(deck, enemy, `${dungeon.code}:f${floor.floor}`));
        const avg = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
        const min = Math.min(...rates);
        const max = Math.max(...rates);
        const top = winRate(topDeck, enemy, `top:${dungeon.code}:f${floor.floor}`);
        const geared = winRate(topLegendary, enemy, `geared:${dungeon.code}:f${floor.floor}`);
        const mythic = winRate(topMythic, enemy, `mythic:${dungeon.code}:f${floor.floor}`);
        console.log(
          `${dungeon.icon} ${dungeon.code}`.padEnd(18),
          `f${floor.floor}${floor.bosses && floor.bosses > 1 ? `*${floor.bosses}` : '  '}`,
          String(floor.scale).padEnd(6),
          `${String(avg).padStart(3)}% (${min}-${max})`.padEnd(16),
          `${String(top).padStart(3)}%`.padEnd(8),
          `${String(geared).padStart(3)}% / mythic ${String(mythic).padStart(3)}%`
        );
      }
    }
  }
} catch (error) {
  console.error('❌', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => undefined);
}

