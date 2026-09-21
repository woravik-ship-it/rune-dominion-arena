#!/usr/bin/env node
// Load test — Phase 12: ทดสอบ 100+ concurrent users บน endpoint สาธารณะ
// ใช้ fetch ของ Node 20 (ไม่ต้องติดตั้ง artillery/k6)
//
// วิธีใช้:
//   node scripts/load-test.mjs --url http://localhost:3000 --users 120 --duration 20
//   node scripts/load-test.mjs --url http://192.168.1.57:3000 --users 200 --duration 30 --json
//
// หมายเหตุ: ยิงเฉพาะ endpoint ที่ไม่เขียนข้อมูล (health/อีเวนต์) เพื่อไม่ให้ปนกับการทดสอบฟีเจอร์

import { performance } from 'node:perf_hooks';

function parseArgs(argv) {
  const out = { url: 'http://localhost:3000', users: 100, duration: 20, json: false, timeout: 10000 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === '--url') { out.url = val.replace(/\/$/, ''); i += 1; }
    else if (key === '--users') { out.users = Number(val); i += 1; }
    else if (key === '--duration') { out.duration = Number(val); i += 1; }
    else if (key === '--timeout') { out.timeout = Number(val); i += 1; }
    else if (key === '--json') { out.json = true; }
  }
  return out;
}

const TARGETS = [
  { path: '/api/health', method: 'GET', weight: 3 },
  { path: '/api/events', method: 'GET', weight: 3 },
  { path: '/', method: 'GET', weight: 2 },
  { path: '/api/auth/me', method: 'GET', weight: 2 }, // 401 = คาดหมาย (ยังไม่ล็อกอิน)
];

/**
 * สถานะที่ถือว่า "ระบบทำงานถูกต้อง" (ไม่ใช่ failure)
 * - 200/204 = สำเร็จ
 * - 401 = คาดหมายสำหรับ /api/auth/me (ยังไม่ล็อกอิน)
 * - 429 = rate limit ทำงานถูกต้อง (ไม่ใช่บั๊ก) — รายงานแยก
 */
const EXPECTED_STATUSES = new Set([200, 204, 401]);
const RATE_LIMITED = 429;

/** เลือก target แบบถ่วงน้ำหนัก (deterministic ด้วย index) */
function pickTarget(seed) {
  const total = TARGETS.reduce((s, t) => s + t.weight, 0);
  let n = seed % total;
  for (const t of TARGETS) {
    if (n < t.weight) return t;
    n -= t.weight;
  }
  return TARGETS[0];
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function oneRequest(target, url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const start = performance.now();
  try {
    const res = await fetch(`${url}${target.path}`, {
      method: target.method,
      signal: controller.signal,
      headers: { Origin: url },
    });
    await res.arrayBuffer();
    return { ok: true, status: res.status, ms: performance.now() - start };
  } catch (error) {
    return { ok: false, status: 0, ms: performance.now() - start, error: error.name };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stats = {
    total: 0, ok: 0, rateLimited: 0, failed: 0,
    statuses: {}, errors: {}, durations: [],
  };
  const deadline = Date.now() + args.duration * 1000;

  console.log(`🔥 Load test: ${args.users} users × ${args.duration}s → ${args.url}`);
  console.log(`   targets: ${TARGETS.map((t) => `${t.method} ${t.path}`).join(', ')}\n`);

  let seq = 0;
  async function worker(id) {
    while (Date.now() < deadline) {
      const target = pickTarget(id * 31 + (seq += 1));
      const r = await oneRequest(target, args.url, args.timeout);
      stats.total += 1;
      if (r.status !== RATE_LIMITED) stats.durations.push(r.ms);
      if (r.ok && EXPECTED_STATUSES.has(r.status)) {
        stats.ok += 1;
        stats.statuses[r.status] = (stats.statuses[r.status] ?? 0) + 1;
      } else if (r.status === RATE_LIMITED) {
        // rate limit ทำงานถูกต้อง — นับแยก ไม่ถือเป็น failure
        stats.rateLimited += 1;
        stats.statuses[r.status] = (stats.statuses[r.status] ?? 0) + 1;
      } else {
        stats.failed += 1;
        const key = r.error ?? `status_${r.status}`;
        stats.errors[key] = (stats.errors[key] ?? 0) + 1;
      }
    }
  }

  const startedAt = performance.now();
  await Promise.all(Array.from({ length: args.users }, (_, i) => worker(i + 1)));
  const wallMs = performance.now() - startedAt;

  stats.durations.sort((a, b) => a - b);
  const served = stats.ok + stats.failed;
  const report = {
    url: args.url,
    concurrentUsers: args.users,
    durationSec: args.duration,
    requests: stats.total,
    rps: Number((stats.total / (wallMs / 1000)).toFixed(1)),
    servedRps: Number((served / (wallMs / 1000)).toFixed(1)),
    success: stats.ok,
    rateLimited: stats.rateLimited,
    failed: stats.failed,
    successRate: served > 0 ? Number(((stats.ok / served) * 100).toFixed(2)) : 0,
    latencyMs: {
      avg: Number((stats.durations.reduce((s, d) => s + d, 0) / Math.max(1, stats.durations.length)).toFixed(1)),
      p50: Number(percentile(stats.durations, 50).toFixed(1)),
      p95: Number(percentile(stats.durations, 95).toFixed(1)),
      p99: Number(percentile(stats.durations, 99).toFixed(1)),
      max: Number((stats.durations[stats.durations.length - 1] ?? 0).toFixed(1)),
    },
    statuses: stats.statuses,
    errors: stats.errors,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('📊 ผลการทดสอบ');
    console.log(`   คำขอทั้งหมด : ${report.requests} (${report.rps} req/s)`);
    console.log(`   ให้บริการ   : ${report.success} สำเร็จ · ${report.rateLimited} ถูก rate limit · ${report.failed} ล้มเหลว`);
    console.log(`   Throughput  : ${report.servedRps} req/s (ไม่นับ 429)`);
    console.log(`   Success rate: ${report.successRate}% (จากคำขอที่ให้บริการจริง)`);
    console.log(`   Latency     : avg ${report.latencyMs.avg}ms · p50 ${report.latencyMs.p50}ms · p95 ${report.latencyMs.p95}ms · p99 ${report.latencyMs.p99}ms · max ${report.latencyMs.max}ms`);
    console.log(`   Status      : ${JSON.stringify(report.statuses)}`);
    if (report.errors && Object.keys(report.errors).length) {
      console.log(`   Errors      : ${JSON.stringify(report.errors)}`);
    }
    const passed = report.successRate >= 99 && report.latencyMs.p95 < 1500 && report.failed === 0;
    console.log(`\n${passed ? '✅ ผ่านเกณฑ์ (สำเร็จ ≥99%, p95 < 1500ms, ไม่มี error)' : '⚠️ ยังไม่ผ่านเกณฑ์'}`);
    if (report.rateLimited > 0) {
      console.log('ℹ️  429 คือ rate limit ต่อ IP ที่ทำงานถูกต้อง (load test ยิงจาก IP เดียว)');
      console.log('    ทดสอบกับผู้ใช้จริงควรกระจาย IP หรือปรับ RATE_LIMIT_API_BURST_LIMIT');
    }
  }

  process.exit(report.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('load-test error:', e);
  process.exit(1);
});
