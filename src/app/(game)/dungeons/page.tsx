'use client';

// /dungeons — ดันเจี้ยนหาวัตถุดิบคราฟต์ (Phase 31 → ปรับ UI/ข้อความ Phase 31.1)
//
// ผู้ใช้สั่ง 2026-09-27: "ช่วยดูเรื่อง ui หน้าดันเจี้ยน และระยะเวลาเข้าดันเจี้ยนฟรีตามเวลา
//   ต้องบอกเข้าได้เป็นช่วง เวลาไหน ถึงเวลาไหน" + "ข้อความเทคนิคหลังบ้านไม่ต้องนำมาแสดง"
//  - เวลาฟรีแสดงเป็น "ช่วง" (12:00–14:00 และ 20:00–22:00) + สถานะเปิด/ปิด + นับถอยหลังถึงรอบถัดไป
//  - แสดงรางวัลของแต่ละชั้น (ฝุ่นเวท/Veil Shards/ไอเทมดรอป) และสถานะปลดล็อกชั้น
//  - ข้อความทั้งหมดเป็นภาษาเกม (ไม่มีรหัส/ศัพท์ระบบ)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { useAudio } from '@/components/providers/AudioProvider';
import {
  freeEntryStatusTh,
  formatFreeHourWindow,
  freeHourWindows,
} from '@/lib/dungeon-definitions';

interface FloorView {
  floor: number; nameTh: string; unlocked: boolean; cleared: boolean;
  /** Phase 37: ชั้นที่ N ของบล็อก (5 ชั้นต่อบล็อก) — จำนวนบอสเป็นหมุดหมายรายบล็อก */
  block?: number; blockFloor?: number;
  /** Phase 45.4: ความยากไล่ทุกชั้น — ดาว 1-10 (เทียบช่วงของดันนี้) · HP ศัตรูที่เพิ่มขึ้น · พลังรวมทีมศัตรู */
  difficulty?: number; difficultyStars?: number; hpBonus?: number; enemyPower?: number;
  /** Phase 45.6: ชั้นบอส 2 ตัวขึ้นไป — บอสมีสกิลพยุงทีม (ฟื้นฟู/โล่) */
  bossSkillTh?: string | null;
  dust: number; lossDust: number; shards: number;
  itemNameTh: string | null; itemDropChance: number;
  minions: number; bosses: number; enemyNameTh: string;
}
interface DungeonView {
  code: string; name: string; nameTh: string; descriptionTh: string; icon: string;
  entry: 'FREE_ALWAYS' | 'FREE_TIMED' | 'COIN'; entryTh: string;
  coinCost: number; freeHours: number[];
  freeWindowText: string; statusTh: string; waitTextTh: string;
  canEnterNow: boolean; coinBalance: number; canAfford: boolean;
  winOnlyReward: boolean;
  floors: number; floorInfo: FloorView[]; bestFloor: number;
}
interface DeckOption { id: string; name: string; }
interface RunResult {
  runId: string; battleUrl: string; won: boolean; roundsPlayed: number; floor: number; nextFloor: number | null;
  dustEarned: number; shardsEarned: number;
  itemDropped: string | null; itemNameTh: string | null;
  teamHpRemaining: number; enemyHpRemaining: number;
  /** false = ชั้นนี้เคยชนะแล้ว → รอบนี้เป็นรอบซ้อม ไม่มีรางวัล */
  rewardEligible: boolean;
}
/** ดันที่ผู้เล่นค้างไว้ไกลสุด (ผ่านชั้นมากสุด) — ใช้เป็นค่าเริ่มต้นของหน้า (ผู้ใช้สั่ง) */
function pickDungeonByProgress(list: DungeonView[]): DungeonView {
  return [...list].sort((a, b) => b.bestFloor - a.bestFloor || a.floors - b.floors)[0] ?? list[0];
}

/** ชั้นถัดไปที่ยังไม่ผ่าน (ชั้นที่ค้างไว้) — 1 ถ้ายังไม่เคยผ่านชั้นไหน */
function pendingFloor(dungeon: DungeonView): number {
  return Math.min(Math.max(1, dungeon.bestFloor + 1), Math.max(1, dungeon.floors));
}

export default function DungeonsPage() {
  const { setMusicTrack } = useAudio();
  const [dungeons, setDungeons] = useState<DungeonView[]>([]);
  const [decks, setDecks] = useState<DeckOption[]>([]);
  const [selected, setSelected] = useState('');
  const [floor, setFloor] = useState(1);
  const [deckId, setDeckId] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  /** Phase 33: โบนัสโอกาสดรอป Item จากเลเวลผู้เล่น */
  const [levelInfo, setLevelInfo] = useState<{ level: number; dropBonusPercent: number } | null>(null);
  /** เวลาปัจจุบัน (อัปเดตเป็นระยะ) → สถานะเปิด/ปิดและเวลาถอยหลังตรงกับเวลาจริงเสมอ */
  const [now, setNow] = useState(() => new Date());
  /** ตั้งค่าครั้งแรกครั้งเดียว (เลือกดันที่ค้างไว้ + ชั้นถัดไป) */
  const initializedRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(timer);
  }, []);

  // Phase 35: ฟังเพลงประจำดันเจี้ยนระหว่างอยู่หน้านี้ แล้วคืนเพลงธีมเมื่อออก
  useEffect(() => {
    setMusicTrack('dungeon');
    return () => setMusicTrack('main');
  }, [setMusicTrack]);

  const load = useCallback(async () => {
    try {
      const [dRes, deckRes] = await Promise.all([apiFetch('/api/dungeons'), apiFetch('/api/decks')]);
      const dJson = await dRes.json().catch(() => null);
      const deckJson = await deckRes.json().catch(() => null);
      if (dRes.ok && dJson?.success) {
        const list = (dJson.data?.dungeons ?? []) as DungeonView[];
        setDungeons(list);
        if (dJson.data?.level) {
          setLevelInfo({ level: dJson.data.level.level, dropBonusPercent: dJson.data.level.dropBonusPercent });
        }
        if (list.length > 0 && !initializedRef.current) {
          // ผู้ใช้สั่ง: "ปุ่มลุย ตอนเข้ามาใหม่ให้แสดงชั้นสูงสุดที่ค้างไว้ก่อน"
          // ⇒ เลือกดันที่เล่นค้างไว้ไกลสุด แล้วตั้งชั้น = ชั้นถัดไปที่ยังไม่ผ่าน (ทำครั้งแรกครั้งเดียว)
          initializedRef.current = true;
          const initial = pickDungeonByProgress(list);
          setSelected(initial.code);
          // Phase 45.6: เปิดลิงก์ตรงมาที่ชั้นได้ เช่น /dungeons?floor=15 (ใช้ทำภาพคู่มือ/แชร์ลิงก์)
          // อ่านจาก window.location เอง (ไม่ใช้ useSearchParams ⇒ ไม่ต้องมี Suspense boundary ตอน build)
          // และใช้เฉพาะเมื่อชั้นนั้น "ปลดล็อกแล้ว" เท่านั้น ⇒ ลิงก์เก่า/ชั้นที่ยังล็อกไม่ทำให้หน้าพัง
          const wanted = Number(new URLSearchParams(window.location.search).get('floor'));
          const unlocked = Number.isFinite(wanted) && wanted >= 1 && wanted <= initial.floors
            && (wanted === 1 || initial.bestFloor >= wanted - 1);
          setFloor(unlocked ? wanted : pendingFloor(initial));
        }
      } else {
        setError(dJson?.error ?? 'โหลดดันเจี้ยนไม่สำเร็จ');
      }
      if (deckRes.ok && deckJson?.success) {
        const dl = (deckJson.data?.decks ?? deckJson.data ?? []) as DeckOption[];
        setDecks(Array.isArray(dl) ? dl : []);
        if (dl.length > 0) setDeckId((v) => v || dl[0].id);
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการโหลด');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const current = dungeons.find((d) => d.code === selected);
  /** สถานะสดจากเวลาปัจจุบัน (ใช้สูตรเดียวกับฝั่งเซิร์ฟเวอร์) */
  const currentStatus = useMemo(
    () => (current ? freeEntryStatusTh(current, now) : null),
    [current, now]
  );
  const canRun = Boolean(
    current && currentStatus?.open && (current.entry !== 'COIN' || current.canAfford) && deckId && !busy
  );
  const floors = current?.floorInfo ?? [];
  const selectedFloor = floors.find((f) => f.floor === floor) ?? floors[0] ?? null;

  /** เลือกดัน → ไปชั้นแรกที่ยังไม่ผ่าน */
  const pickDungeon = (d: DungeonView) => {
    setSelected(d.code);
    setFloor(pendingFloor(d));
    setResult(null);
    setMessage('');
    setError('');
  };

  const run = async () => {
    if (!current || !deckId) { setError('เลือกดันเจี้ยนและเด็คก่อน'); return; }
    if (!currentStatus?.open) {
      setError(`${current.nameTh} ปิดอยู่ — เข้าฟรี ${current.freeWindowText}${currentStatus?.waitTextTh ? ` (${currentStatus.waitTextTh})` : ''}`);
      return;
    }
    if (current.entry === 'COIN' && !current.canAfford) {
      setError(`Coin ไม่พอ — ต้องใช้ ${current.coinCost} Coin (มี ${current.coinBalance})`);
      return;
    }
    setBusy(true); setError(''); setMessage(''); setResult(null);
    try {
      const res = await apiFetch('/api/dungeons/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dungeonCode: current.code, floor, deckId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) { setError(json?.error ?? 'ลุยดันไม่สำเร็จ'); return; }
      const r = json.data as RunResult;
      // เข้าสนามรบจริง (ดูการต่อสู้แบบเต็ม) — จบแล้วกลับมาที่หน้านี้ได้
      if (r.battleUrl) { window.location.href = r.battleUrl; return; }
      setResult(r);
      setMessage(
        !r.rewardEligible
          ? `${r.won ? 'ชนะ' : 'แพ้'}ชั้น ${r.floor} — รอบซ้อม (ชั้นนี้ผ่านแล้ว ไม่มีรางวัล)`
          : r.won
            ? `ชนะชั้น ${r.floor}! ได้ ✨ ฝุ่นเวท ${r.dustEarned} · 💠 ${r.shardsEarned}${r.itemDropped ? ` · 🎁 ${r.itemNameTh}` : ''}`
            : current.winOnlyReward
              ? `แพ้ชั้น ${r.floor} — ยังไม่ได้รางวัล (ชนะเท่านั้นถึงจะได้)`
              : `แพ้ชั้น ${r.floor} — ยังได้ ✨ ฝุ่นเวท ${r.dustEarned}`
      );
      void load();
    } catch {
      setError('เกิดข้อผิดพลาด');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <main className="mx-auto max-w-3xl p-4"><p className="text-gray-400">กำลังโหลดดันเจี้ยน…</p></main>;
  return (
    <main className="mx-auto max-w-3xl p-4 pb-24">
      <h1 className="text-xl font-bold text-white">🏰 ดันเจี้ยนหาวัตถุดิบ</h1>
      <p className="mt-1 text-sm text-gray-400">
        ชนะแล้วได้ ✨ ฝุ่นเวท · 💠 Veil Shards · 🎁 ไอเทมช่างไว้คราฟต์ —
        ดันฟรีได้รางวัลเมื่อชนะเท่านั้น · <b className="text-gray-300">ชั้นที่ผ่านแล้วลุยซ้ำได้แต่ไม่ได้รางวัลอีก</b>
        (ดันเหรียญจ่าย Coin แล้ว แพ้ยังได้ฝุ่นเวทเล็กน้อย)
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-500/10 p-2 text-sm text-red-300">{error}</p>}
      {message && <p className="mt-3 rounded-lg bg-emerald-500/10 p-2 text-sm text-emerald-300">{message}</p>}

      {/* เลือกดันเจี้ยน — บอกชัดว่าเปิดช่วงไหน และอีกนานเท่าไรถึงจะเปิด */}
      <div className="mt-4 grid gap-3">
        {dungeons.map((d) => {
          const status = freeEntryStatusTh(d, now);
          const windows = freeHourWindows(d);
          const enterable = status.open && (d.entry !== 'COIN' || d.canAfford);
          return (
            <button
              key={d.code} type="button" data-dungeon={d.code}
              data-dungeon-status={enterable ? 'open' : 'closed'}
              onClick={() => pickDungeon(d)}
              className={`rounded-xl border p-3 text-left ${selected === d.code ? 'border-amber-400 bg-amber-500/10' : 'border-gray-700 bg-gray-900/70'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-white">{d.icon} {d.nameTh}</p>
                <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-gray-300">{d.entryTh}</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">{d.descriptionTh}</p>
              <p className={`mt-1 text-xs ${enterable ? 'text-emerald-300' : 'text-red-300'}`}>
                {enterable ? '🟢' : status.open ? '🪙' : '🔴'} {status.labelTh}
                {!d.canAfford && ` — มี ${d.coinBalance} Coin`}
              </p>
              {windows.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {windows.map((w) => {
                    const from = w.startHour % 24;
                    const to = w.endHour % 24;
                    const openNow = status.open && now.getHours() >= from && now.getHours() < to;
                    return (
                      <span
                        key={`${w.startHour}-${w.endHour}`}
                        data-dungeon-window={`${w.startHour}-${w.endHour}`}
                        className={`rounded-full px-2 py-0.5 text-[11px] ${openNow ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-gray-300'}`}
                      >
                        ⏰ {formatFreeHourWindow(w)}
                      </span>
                    );
                  })}
                </div>
              )}
              <p className="mt-1 text-[11px] text-gray-500">
                {d.floors} ชั้น · ผ่านสูงสุดชั้น {d.bestFloor}
                {d.winOnlyReward ? ' · ได้รางวัลเมื่อชนะเท่านั้น' : ' · แพ้ยังได้ฝุ่นเวทเล็กน้อย'}
                {!status.open && status.waitTextTh ? ` · ${status.waitTextTh}` : ''}
              </p>
            </button>
          );
        })}
      </div>
      {/* รายละเอียดดันที่เลือก */}
      {current && (
        <section className="mt-4 rounded-xl border border-gray-700 bg-gray-900/70 p-3">
          <p className="text-sm font-bold text-white">ลุย: {current.icon} {current.nameTh}</p>
          {/* Phase 33: โบนัสโอกาสดรอป Item จากเลเวล (สูงสุด +20%) */}
          {levelInfo && levelInfo.dropBonusPercent > 0 && (
            <p className="mt-1 text-xs text-emerald-300" data-dungeon-drop-bonus>
              🎁 โบนัสโอกาสดรอป Item จากเลเวล {levelInfo.level}: +{levelInfo.dropBonusPercent}%
            </p>
          )}
          {current.freeWindowText && (
            <p className="mt-1 text-xs text-gray-300">
              เข้าฟรีช่วง {current.freeWindowText}
              {currentStatus && !currentStatus.open && currentStatus.waitTextTh ? ` · ${currentStatus.waitTextTh}` : ''}
            </p>
          )}

          {/* เลือกชั้น — ดันมี 25-40 ชั้น จึงใช้ "ความคืบหน้า + ตัวเลือกชั้น" แทนการไล่ลิสต์ทั้งหมด */}
          <div className="mt-2 rounded-lg bg-gray-800/60 p-2">
            <div className="flex items-center justify-between gap-2 text-xs text-gray-300">
              <span>
                ความคืบหน้า: ผ่านสูงสุด <b className="text-emerald-300">ชั้น {current.bestFloor}</b> / {current.floors}
              </span>
              <span className="text-gray-400">
                {current.floors - current.bestFloor > 0
                  ? `เหลืออีก ${current.floors - current.bestFloor} ชั้น`
                  : 'ผ่านครบทุกชั้นแล้ว 🏆'}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
                style={{ width: `${current.floors > 0 ? Math.round((current.bestFloor / current.floors) * 100) : 0}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <label className="text-gray-400">เลือกชั้น
                <select
                  value={selectedFloor?.floor ?? floor}
                  onChange={(e) => setFloor(Number(e.target.value))}
                  className="ml-2 rounded-lg bg-gray-900 px-2 py-1 text-white"
                  data-dungeon-floor-select="true"
                >
                  {floors.map((f) => (
                    <option key={f.floor} value={f.floor} disabled={!f.unlocked}>
                      ชั้น {f.floor} · {f.nameTh}
                      {f.difficultyStars ? ` · ${'⭐'.repeat(Math.min(5, Math.ceil(f.difficultyStars / 2)))}` : ''}
                      {f.cleared ? ' ✅' : ''}{f.bosses > 1 ? ` 👑×${f.bosses}` : ''}{f.block ? ` · ระดับ ${f.block}` : ''}{f.unlocked ? '' : ' 🔒'}
                    </option>
                  ))}
                </select>
              </label>
              {/* ระดับความยากของชั้นที่เลือก — ให้เห็นว่าแต่ละชั้นต่างกันจริง (ผู้ใช้สั่ง 2026-10-07)
                  ⭐ = ระดับ 1-10 เทียบกับช่วงของดันนี้ · HP +N% = ศัตรูอึดขึ้นต่อชั้น */}
              {selectedFloor && (
                <span
                  className="rounded-lg border border-gray-700 bg-gray-900/70 px-2 py-1 text-[11px] text-gray-300"
                  data-dungeon-floor-difficulty={selectedFloor.floor}
                >
                  <span data-dungeon-floor-stars={selectedFloor.difficultyStars ?? 0} className="text-amber-300">
                    {'⭐'.repeat(Math.max(1, Math.min(10, selectedFloor.difficultyStars ?? 1)))}
                  </span>
                  <span className="ml-1 text-gray-400">
                    ระดับ {selectedFloor.difficultyStars ?? 1}/10
                  </span>
                  {typeof selectedFloor.enemyPower === 'number' && (
                    <span className="ml-2 text-gray-300">
                      · พลังศัตรู <span data-dungeon-floor-enemy-power={selectedFloor.enemyPower}>{selectedFloor.enemyPower.toLocaleString('th-TH')}</span>
                    </span>
                  )}
                  {selectedFloor.hpBonus && selectedFloor.hpBonus > 1 && (
                    <span className="ml-2 text-emerald-300" data-dungeon-floor-hp-bonus={selectedFloor.hpBonus}>
                      · HP ศัตรู +{Math.round((selectedFloor.hpBonus - 1) * 100)}%
                    </span>
                  )}
                  {selectedFloor.bossSkillTh && (
                    <span className="ml-2 text-sky-300" data-dungeon-floor-boss-skill>
                      · {selectedFloor.bossSkillTh}
                    </span>
                  )}
                </span>
              )}
              {(() => {
                const next = floors.find((f) => !f.cleared && f.unlocked) ?? null;
                return next && next.floor !== (selectedFloor?.floor ?? floor) ? (
                  <button
                    type="button"
                    onClick={() => setFloor(next.floor)}
                    className="rounded-lg bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
                  >
                    ไปชั้นที่ยังไม่ผ่าน: {next.floor} →
                  </button>
                ) : null;
              })()}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <label className="text-gray-400">เด็ค
              <select value={deckId} onChange={(e) => setDeckId(e.target.value)} className="ml-2 rounded-lg bg-gray-800 px-2 py-1 text-white">
                {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <button
              type="button" data-dungeon-run="true" onClick={run} disabled={!canRun}
              className="rounded-lg bg-amber-500/90 px-4 py-1.5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-40"
            >
              {busy
                ? 'กำลังเข้าดัน…'
                : selectedFloor?.cleared
                  ? `ลุยซ้ำ ชั้น ${selectedFloor.floor} (ไม่มีรางวัล)`
                  : current.entry === 'COIN'
                    ? `ลุยเลย (${current.coinCost} Coin)`
                    : `ลุยชั้น ${selectedFloor?.floor ?? floor} ฟรี`}
              {selectedFloor && !selectedFloor.cleared && selectedFloor.floor === pendingFloor(current) && (
                <span className="ml-1 text-[11px] font-normal">(ชั้นที่ค้างไว้ {selectedFloor.floor})</span>
              )}
            </button>
          </div>

          {decks.length === 0 && (
            <p className="mt-2 text-xs text-amber-300">
              ยังไม่มีเด็ค — <Link href="/decks" className="underline">จัดทีม 5 ใบก่อน</Link>
            </p>
          )}
          {!currentStatus?.open && (
            <p className="mt-2 text-xs text-red-300">
              ตอนนี้ยังเข้าไม่ได้ — เปิดอีกครั้ง {current.freeWindowText}
              {currentStatus?.waitTextTh ? ` (${currentStatus.waitTextTh})` : ''}
            </p>
          )}
          {current.entry === 'COIN' && !current.canAfford && (
            <p className="mt-2 text-xs text-amber-300">
              ต้องใช้ {current.coinCost} Coin ต่อครั้ง — ตอนนี้มี {current.coinBalance} Coin
            </p>
          )}
          {selectedFloor && (
            <div className="mt-3 rounded-lg bg-white/5 p-2 text-xs text-gray-300">
              <p className="font-bold text-white">
                ชั้น {selectedFloor.floor} · {selectedFloor.nameTh}
                {selectedFloor.cleared && <span className="ml-1 text-emerald-300">✅ ผ่านแล้ว</span>}
              </p>
              <p className="mt-1">ศัตรู: {selectedFloor.enemyNameTh}</p>
              {selectedFloor.cleared ? (
                <p className="mt-1 text-amber-300">
                  ชั้นนี้คุณชนะมาแล้ว — ลุยซ้ำได้เพื่อซ้อม แต่จะไม่ได้ ✨ ฝุ่นเวท · 💠 Veil Shards · 🎁 ไอเทมอีก
                </p>
              ) : (
                <>
                  <p className="mt-1">
                    ชนะได้ ✨ ฝุ่นเวท {selectedFloor.dust} · 💠 {selectedFloor.shards}
                    {selectedFloor.itemNameTh ? ` · 🎁 ${selectedFloor.itemNameTh} (โอกาส ${selectedFloor.itemDropChance}%)` : ''}
                  </p>
                  <p className="mt-1 text-gray-400">
                    {selectedFloor.lossDust > 0
                      ? `แพ้ยังได้ ✨ ฝุ่นเวท ${selectedFloor.lossDust}`
                      : 'แพ้ไม่ได้รางวัล — ต้องชนะเท่านั้น'}
                  </p>
                </>
              )}
              <p className="mt-1 text-gray-400">
                🎁 ไอเทมดรอปได้เมื่อชนะครั้งแรกของชั้นเท่านั้น · เอา ✨ ฝุ่นเวท ไปคราฟต์ได้ที่{' '}
                <Link href="/items" className="text-amber-300 underline">ร้านช่าง</Link>
              </p>
            </div>
          )}

          {result && (
            <div className="mt-3 rounded-lg bg-white/5 p-2 text-sm">
              <p className={result.won ? 'text-emerald-300' : 'text-red-300'}>
                {result.won ? '🎉 ชนะ' : '💀 แพ้'} · {result.roundsPlayed} รอบ · ทีมเหลือ {result.teamHpRemaining} HP · ศัตรูเหลือ {result.enemyHpRemaining} HP
              </p>
              <p className="mt-1 text-gray-300">
                {!result.rewardEligible
                  ? 'ชั้นนี้ผ่านแล้ว — รอบนี้เป็นรอบซ้อม ไม่มีรางวัล'
                  : result.dustEarned > 0
                    ? `✨ ฝุ่นเวท +${result.dustEarned} · 💠 +${result.shardsEarned}${result.itemDropped ? ` · 🎁 ${result.itemNameTh}` : ''}`
                    : 'รอบนี้ยังไม่ได้รางวัล — ดันนี้ให้รางวัลเมื่อชนะเท่านั้น'}
              </p>
              {result.nextFloor && result.won && (
                <button type="button" onClick={() => setFloor(result.nextFloor!)} className="mt-2 rounded-lg bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20">
                  ไปชั้น {result.nextFloor} →
                </button>
              )}
            </div>
          )}
        </section>
      )}

      <p className="mt-3 text-[11px] text-gray-500">
        กดลุยแล้วจะพาไปดูการต่อสู้แบบเต็ม · จบแล้วกลับมาที่นี่เพื่อลุยชั้นถัดไป
      </p>
    </main>
  );
}
