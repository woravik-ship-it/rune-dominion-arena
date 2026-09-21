#!/usr/bin/env node
// Audit ว่า checklist ใน DEVELOPMENT_PLAN ตรงกับโค้ดจริงหรือไม่ — Phase 12 งานเอกสาร
// ตรวจแบบ "มีหลักฐานจริงไหม" (ไฟล์/ฟังก์ชัน/route) ไม่ได้เชื่อ checkbox เดิม
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '..');
const SRC = join(APP, 'src');

const exists = (p) => existsSync(join(APP, p));
const read = (p) => readFileSync(join(APP, p), 'utf-8');
const readPkg = () => read('package.json');

function grepCount(pattern, dir = SRC) {
  let hits = 0;
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) {
        if (new RegExp(pattern).test(readFileSync(full, 'utf-8'))) hits += 1;
      }
    }
  };
  walk(dir);
  return hits;
}

const CHECKS = [];
const check = (label, fn) => CHECKS.push([label, fn]);
const hasDep = (name) => new RegExp(`"${name}"`).test(readPkg());

// ===== Phase 0 =====
check('P0 next app router + ts strict', () => exists('tsconfig.json') && /"strict"\s*:\s*true/.test(read('tsconfig.json')));
check('P0 prisma + postgres', () => exists('prisma/schema.prisma') && exists('.env.example'));
check('P0 redis/bullmq', () => hasDep('bullmq') || hasDep('ioredis'));
check('P0 auth (scrypt + session jwt)', () => exists('src/lib/password.ts') && exists('src/lib/session.ts'));
check('P0 docker compose', () => exists('docker-compose.yml'));
check('P0 middleware (logger/security headers)', () => exists('src/middleware.ts'));
check('P0 tailwind', () => exists('tailwind.config.ts'));
check('P0 shadcn/ui', () => hasDep('shadcn') || exists('components.json'));
check('P0 zustand', () => hasDep('zustand'));
check('P0 tanstack query', () => hasDep('@tanstack/react-query'));
check('P0 react-hook-form', () => hasDep('react-hook-form'));
check('P0 zod', () => hasDep('zod'));
check('P0 design tokens (CSS variables)', () => /--[a-z-]+:\s/.test(read('src/app/globals.css')) || /--color/.test(read('src/app/globals.css')));
check('P0 layout (AppShell + TopHeader + BottomNav)', () =>
  exists('src/components/layout/AppShell.tsx') && exists('src/components/layout/TopHeader.tsx') && exists('src/components/layout/BottomNavigation.tsx'));
check('P0 github actions', () => exists('.github/workflows/ci.yml'));
check('P0 auth guard + rate limiter ใน middleware', () => /rateLimitConfig|requireAuth/.test(read('src/middleware.ts')));

// ===== Phase 1 =====
const schema = () => read('prisma/schema.prisma');
check('P1 schema CardDefinition/UserCard/DiscoveryLog', () =>
  /model CardDefinition/.test(schema()) && /model UserCard/.test(schema()) && /model DiscoveryLog/.test(schema()));
check('P1 POST /api/discover', () => exists('src/app/api/discover/route.ts'));
check('P1 buildCanonicalString', () => grepCount('buildCanonicalString') >= 2);
check('P1 hashSeed + SERVER_PEPPER', () => grepCount('hashSeed') >= 2 && /SERVER_PEPPER/.test(schema() + read('src/services/seed.ts')));
check('P1 createCardFromSeed (deterministic PRNG)', () => grepCount('createCardFromSeed') >= 2);
check('P1 findCardByHash (canonicalSeedHash lookup)', () => /canonicalSeedHash/.test(read('src/services/discovery.ts')));
check('P1 unique constraint (race guard)', () => /@@unique\(\[userId, cardId\]\)/.test(schema()));
check('P1 idempotencyKey ต่อ discovery', () => grepCount('idempotencyKey') >= 5);
check('P1 unit test discovery + seed', () => exists('tests/unit/discovery.test.ts') && exists('tests/unit/seed.test.ts'));
check('P1 seed script 100 การ์ด', () => /cardCount\s*=\s*100/.test(read('prisma/seed.ts')));
check('P1 หน้า /discover + RuneCanvas (Canvas API)', () =>
  exists('src/app/discover/page.tsx') && /getContext\('2d'\)/.test(read('src/components/rune/RuneCanvas.tsx')));
check('P1 เลือกรูน 8–16 + แสดง sequence', () => /minRunes.*8|maxRunes.*16/.test(read('src/app/discover/page.tsx')));
check('P1 ปุ่มถอดรหัสรูน + loading state', () => /ถอดรหัสรูน/.test(read('src/app/discover/page.tsx')) && /กำลังอ่านบันทึกแห่งรูน/.test(read('src/app/discover/page.tsx')));
check('P1 Card Reveal Modal', () => exists('src/components/cards/CardRevealModal.tsx'));
check('P1 badge ผู้ค้นพบคนแรก/ถูกค้นพบแล้ว', () => grepCount('isFirstDiscovery') >= 3);
check('P1 reduced motion', () => grepCount('prefers-reduced-motion|reduceMotion|reduceIntense') >= 1);

// ===== Phase 2 =====
check('P2 GET /api/cards (pagination + filter)', () =>
  exists('src/app/api/cards/route.ts') && /page|limit/.test(read('src/app/api/cards/route.ts')) && /element/.test(read('src/app/api/cards/route.ts')));
check('P2 GET /api/cards/[id]', () => exists('src/app/api/cards/[id]/route.ts'));
check('P2 POST /api/cards/favorite', () => exists('src/app/api/cards/favorite/route.ts'));
check('P2 filter element/rarity/search', () => {
  const s = read('src/app/api/cards/route.ts');
  return /element/.test(s) && /rarity/.test(s) && /search/.test(s);
});
check('P2 GET /api/cards/[id]/owners', () => exists('src/app/api/cards/[id]/owners/route.ts'));
check('P2 หน้า /cards (grid) + filters ใน UI', () => {
  const s = read('src/app/(game)/cards/page.tsx');
  return /ELEMENTS/.test(s) && /RARITIES/.test(s) && /search/.test(s);
});
check('P2 หน้า /cards/[id] (detail + stats + skills)', () => {
  const s = read('src/app/(game)/cards/[id]/page.tsx');
  return /atk/.test(s) && /manaCost/.test(s) && /skills/.test(s);
});
check('P2 CardThumbnail + rarity glow', () => exists('src/components/cards/CardThumbnail.tsx'));
check('P2 Placeholder/AI image ในหน้าการ์ด', () => /api\/cards\/.*\/image/.test(read('src/components/cards/CardThumbnail.tsx')));
check('P2 ปุ่มเพิ่ม/ลบออกจากทีม', () => grepCount('เพิ่มลงทีม|addToDeck|ลบออกจากทีม') >= 1);

// ===== Phase 3 =====
check('P3 deck API (list + create)', () => exists('src/app/api/decks/route.ts'));
check('P3 deck detail/update/delete', () => exists('src/app/api/decks/[id]/route.ts'));
check('P3 deck service (validate + teamPower)', () =>
  exists('src/services/deck.ts') && /calculateTeamPower/.test(read('src/services/deck.ts')));
check('P3 ต้องมีการ์ด 5 ใบ (positions 0-4)', () => /validatePositions/.test(read('src/app/api/decks/route.ts')));
check('P3 หน้า /decks + /decks/[id]', () => exists('src/app/(game)/decks/page.tsx') && exists('src/app/(game)/decks/[id]/page.tsx'));
check('P3 unit test deck', () => exists('tests/unit/deck.test.ts'));

// ===== Phase 4 =====
check('P4 combat engine (simulateBattle)', () => exists('src/services/combat-engine.ts'));
check('P4 elemental skills + mana', () => /skillForElement|manaCost|mana/i.test(read('src/services/combat.ts')));
check('P4 POST /api/battle/simulate', () => exists('src/app/api/battle/simulate/route.ts'));
check('P4 GET battle log', () => exists('src/app/api/battle/[id]/log/route.ts'));
check('P4 GET battle replay (verification)', () => exists('src/app/api/battle/[id]/replay/route.ts') && exists('src/services/battle-verify.ts'));
check('P4 deterministic seed (buildBattleSeed)', () => grepCount('buildBattleSeed') >= 2);
check('P4 หน้า /battle + /battle/[id]', () => exists('src/app/(game)/battle/page.tsx') && exists('src/app/(game)/battle/[id]/page.tsx'));
check('P4 unit test combat + verify', () => exists('tests/unit/combat.test.ts') && exists('tests/unit/battle-verify.test.ts'));

// ===== Phase 5 =====
check('P5 wallet API + transactions', () => exists('src/app/api/wallet/route.ts') && exists('src/app/api/wallet/transactions/route.ts'));
check('P5 wallet service (ledger)', () => exists('src/services/wallet.ts'));
check('P5 integer เท่านั้น (assertIntegerAmount)', () => /assertIntegerAmount/.test(read('src/services/wallet.ts')));
check('P5 audit balanceBefore/After', () => /balanceBefore/.test(read('src/services/wallet.ts')));
check('P5 idempotent credit/debit', () => /idempotencyKey/.test(read('src/services/wallet.ts')));
check('P5 หน้า /wallet', () => exists('src/app/(game)/wallet/page.tsx'));
check('P5 unit test wallet', () => exists('tests/unit/wallet.test.ts'));

// ===== Phase 6 =====
check('P6 arena create/join/challenge/settle', () =>
  ['create', '[id]/join', '[id]/challenge', 'settle'].every((f) => exists(`src/app/api/arena/${f}/route.ts`)));
check('P6 ห้อง 24 ชม. (expiry)', () => /arenaExpiryFrom|ARENA_DURATION/.test(read('src/services/arena.ts')));
check('P6 รางวัล min(100 + n×5, 500)', () => /calculateArenaReward/.test(read('src/services/arena.ts')));
check('P6 daily join cap', () => /countTodayJoins|ARENA_JOIN_DAILY_LIMIT/.test(read('src/app/api/arena/[id]/join/route.ts')));
check('P6 กันคำหยาบในชื่อห้อง', () => /PROFANITY|validateRoomName/.test(read('src/services/arena.ts')));
check('P6 หน้า /arena + /arena/[id] + /arena/create', () =>
  exists('src/app/(game)/arena/page.tsx') && exists('src/app/(game)/arena/[id]/page.tsx') && exists('src/app/(game)/arena/create/page.tsx'));
check('P6 unit test arena', () => exists('tests/unit/arena.test.ts'));

// ===== Phase 8 (ข้อที่ค้าง) =====
check('P8 image queue + worker + retry', () =>
  exists('src/services/image.ts') && /backoffDelayMs/.test(read('src/services/image.ts')));
check('P8 webhook แจ้งเมื่อภาพพร้อม', () => grepCount('webhook') >= 1);

// ===== Runner =====
let done = 0;
const missing = [];
const byDesign = new Set([
  'P0 redis/bullmq',
  'P0 shadcn/ui',
  'P0 zustand',
  'P0 tanstack query',
  'P0 react-hook-form',
]);

for (const [label, fn] of CHECKS) {
  let ok = false;
  try { ok = Boolean(fn()); } catch { ok = false; }
  if (ok) { done += 1; console.log(`✅ ${label}`); }
  else if (byDesign.has(label)) { console.log(`➖ ${label} (ไม่ใช้โดยเจตนา — ดูเหตุผลใน DEVELOPMENT_PLAN)`); }
  else { missing.push(label); console.log(`❌ ${label}`); }
}
console.log(`\nสรุป: มีหลักฐานจริง ${done}/${CHECKS.length} ข้อ` +
  (byDesign.size ? ` (+${byDesign.size} ข้อที่เลือกใช้ทางอื่นโดยเจตนา)` : ''));
if (missing.length) {
  console.log('\nยังไม่มีหลักฐาน (งานจริงที่ต้องทำ):');
  for (const m of missing) console.log(`  - ${m}`);
} else {
  console.log('\n🎉 ทุกข้อมีหลักฐานจริงหรือมีเหตุผลที่ระบุไว้แล้ว');
}
process.exit(0);



