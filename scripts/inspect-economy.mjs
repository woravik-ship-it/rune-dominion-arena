#!/usr/bin/env node
// inspect-economy.mjs — ตรวจ "เศรษฐกิจในเกม" (Phase 37: เน้นสมดุล · กันเงินเฟ้อ)
//
// ผู้ใช้สั่ง 2026-09-27: "ดูปรับไม่ให้เกิดเงินเฟ้อ ในเกมด้วย · เน้นเรื่องสมดุล ตรวจสอบและตั้งให้ดี"
//
// รายงาน: ยอดเงินรวม · แหล่งเงิน (faucet) vs จุดใช้เงิน (sink) แยกตามประเภท/ที่มา ·
//          Veil Shards · ฝุ่นเวท · EXP · ความคืบหน้าดันเจี้ยน · สถิติการลุย
// วิธีใช้: node scripts/inspect-economy.mjs
import { readFileSync } from 'node:fs';
const envText = readFileSync('/home/woravik/E2_Lab/Game_Card/rune-dominion-arena/.env','utf8');
for (const rawLine of envText.split('\n')) { const l=rawLine.trim(); if(!l||l.startsWith('#'))continue; const m=/^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if(m&&!process.env[m[1]])process.env[m[1]]=m[2]; }
const { PrismaClient } = await import('/home/woravik/E2_Lab/Game_Card/rune-dominion-arena/node_modules/@prisma/client/default.js');
const prisma = new PrismaClient();
const wallets = await prisma.wallet.aggregate({ _sum: { balance: true, totalEarned: true, totalSpent: true }, _count: { _all: true } });
console.log('กระเป๋าทั้งหมด:', JSON.stringify(wallets));
const byType = await prisma.walletTransaction.groupBy({ by: ['type','referenceType'], _sum: { amount: true }, _count: { _all: true } });
console.log('รายการเงิน (type/reference):');
for (const row of byType.sort((a,b)=>(b._sum.amount??0)-(a._sum.amount??0))) console.log(` ${row.type}/${row.referenceType ?? '-'}: sum=${row._sum.amount} n=${row._count._all}`);
const shards = await prisma.user.aggregate({ _sum: { veilShards: true }, _count: { _all: true } });
const dust = await prisma.userInventoryItem.groupBy({ by:['itemType'], where:{ itemType:'CRAFTING_DUST' }, _sum:{ quantity:true }, _count:{_all:true} });
const exp = await prisma.user.aggregate({ _sum: { exp: true }, _max: { exp: true } });
const dp = await prisma.dungeonProgress.aggregate({ _sum: { bestFloor: true }, _max: { bestFloor: true }, _count: { _all: true } });
const runs = await prisma.dungeonRun.groupBy({ by:['dungeonCode'], _count:{_all:true}, _sum:{ dustEarned:true, shardsEarned:true, coinsSpent:true } });
console.log('Veil Shards:', JSON.stringify(shards));
console.log('ฝุ่นเวท:', JSON.stringify(dust));
console.log('EXP:', JSON.stringify(exp));
console.log('ความคืบหน้าดัน:', JSON.stringify(dp));
console.log('สถิติดันเจี้ยน:', JSON.stringify(runs));
await prisma.$disconnect();
