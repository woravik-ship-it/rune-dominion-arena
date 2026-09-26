'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/components/providers/LocaleProvider';
import {
  RUNE_GRID_SIZE,
  RUNE_VIEW_SIZE,
  runeIndexAt,
  wrapRuneOffset,
} from '@/lib/rune-grid';

interface RuneCanvasProps {
  onSelectionChange: (selectedRunes: number[]) => void;
  minRunes?: number;
  maxRunes?: number;
  /**
   * เปลี่ยนค่านี้เมื่อไร = ล้างรูนที่เลือกไว้ทันที
   * (ใช้หลังถอดรหัสสำเร็จ เพื่อไม่ให้รูนชุดเดิมค้างอยู่บนกระดาน)
   */
  resetSignal?: number;
}

const GRID_SIZE = RUNE_GRID_SIZE;
const VIEW = RUNE_VIEW_SIZE;
/**
 * ขนาดช่อง (px) — ปรับตามจอจริง (ผู้ใช้สั่ง 2026-09-20: "ปรับขนาดให้เหมาะสมกับจอ")
 * เดิมตรึงไว้ 36px เท่ากันทุกจอ ⇒ บนจอใหญ่ตารางดูเล็ก และบนมือถือล้น/ถูกย่อจนกดยาก
 */
const CELL_MAX_PX = 60;
const CELL_MIN_PX = 20;
/** ความกว้างที่กันไว้ให้คอลัมน์ปุ่มลูกศรสองข้าง (รวมช่องว่าง) */
const NAV_COLUMN_PX = 42;
/**
 * เลื่อนมุมมองแบบ "วนไม่สิ้นสุด" — ไม่มีขอบตัน จึงไม่มีค่า MAX offset ที่ต้องเช็ค
 * (ดู `wrapRuneOffset` ใน `src/lib/rune-grid.ts`)
 */
const DRAG_THRESHOLD_PX = 6;

function hashPos(i: number): number {
  let x = (i * 2654435761) % 4294967296;
  x ^= x >> 15;
  x = (x * 2246822519) % 4294967296;
  x ^= x >> 13;
  return (x % 1000) / 1000;
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), hi);

const GLYPH_ALPHA_MIN = 0.38;
const GLYPH_ALPHA_MAX = 0.95;

// ===== อักขระรูนของแต่ละช่อง (วาดเอง — ไม่ซ้ำกันทั้งกระดาน) =====
//
// เหตุผลที่เปลี่ยน (ผู้ใช้สั่ง 2026-09-26: "แก้ไขรูนให้มีอักขระ ไม่ซ้ำกัน"):
// เดิมใช้ตัวอักษร 24 ตัววนซ้ำ (`GLYPHS[index % 24]`) → ทั้งกระดานเห็นอักขระเดิม ๆ
// ซ้ำเป็นแพตเทิร์นชัดเจน ดูเป็นตารางตัวอักษร ไม่ใช่กระดานรูน
//
// วิธีใหม่ = วาดอักขระเองแบบกำหนดผลได้ และ **ไม่ซ้ำกันจริง** ด้วยการเข้ารหัสเลข index:
//   index ของช่อง (0–9999) มี 4 หลักฐานสิบ → แต่ละหลักเลือก "รอย" 1 จาก 10 แบบ
//   แล้ววาดรอยนั้นลงในช่องของตัวเอง (บน/ขวา/ล่าง/ซ้าย)
//   ⇒ (หลักที่ 1..4, รอยที่เลือก) ต่างกันทุกช่อง = ไม่มีช่องไหนได้อักขระซ้ำกันเลย
type RuneMark = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => void;

const RUNE_MARKS: readonly RuneMark[] = [
  // 0 · ขีดตั้ง
  (c, x, y, s) => { c.moveTo(x, y - s); c.lineTo(x, y + s); },
  // 1 · ขีดนอน
  (c, x, y, s) => { c.moveTo(x - s, y); c.lineTo(x + s, y); },
  // 2 · เฉียง ↘
  (c, x, y, s) => { c.moveTo(x - s, y - s); c.lineTo(x + s, y + s); },
  // 3 · เฉียง ↗
  (c, x, y, s) => { c.moveTo(x - s, y + s); c.lineTo(x + s, y - s); },
  // 4 · จุดกลม
  (c, x, y, s) => { c.moveTo(x + s * 0.32, y); c.arc(x, y, s * 0.32, 0, Math.PI * 2); },
  // 5 · หลังคา ⌃
  (c, x, y, s) => { c.moveTo(x - s, y + s * 0.6); c.lineTo(x, y - s * 0.6); c.lineTo(x + s, y + s * 0.6); },
  // 6 · รางน้ำ ∨
  (c, x, y, s) => { c.moveTo(x - s, y - s * 0.6); c.lineTo(x, y + s * 0.6); c.lineTo(x + s, y - s * 0.6); },
  // 7 · สามเหลี่ยม
  (c, x, y, s) => {
    c.moveTo(x - s * 0.85, y + s * 0.7); c.lineTo(x, y - s * 0.8); c.lineTo(x + s * 0.85, y + s * 0.7);
    c.closePath();
  },
  // 8 · ตะขอ
  (c, x, y, s) => { c.moveTo(x, y - s); c.lineTo(x, y + s * 0.5); c.lineTo(x + s * 0.8, y + s * 0.5); },
  // 9 · ข้าวหลามตัด
  (c, x, y, s) => {
    c.moveTo(x, y - s * 0.85); c.lineTo(x + s * 0.8, y); c.lineTo(x, y + s * 0.85); c.lineTo(x - s * 0.8, y);
    c.closePath();
  },
];

/** ตำแหน่งรอยทั้ง 4 ของอักขระ: บน · ขวา · ล่าง · ซ้าย */
const RUNE_SLOTS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * วาดอักขระรูนประจำช่อง index (0–9999) — deterministic + ไม่ซ้ำกัน
 * ต้องเรียก ctx.beginPath() มาก่อน (ฟังก์ชันนี้ต่อ path ให้) แล้วค่อย ctx.stroke()
 */
function traceRuneGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, index: number): void {
  const digits = [
    Math.floor(index / 1000) % 10,
    Math.floor(index / 100) % 10,
    Math.floor(index / 10) % 10,
    index % 10,
  ];
  const markSize = size * 0.30;
  const slotRadius = size * 0.26;
  for (let k = 0; k < 4; k++) {
    const [ux, uy] = RUNE_SLOTS[k];
    RUNE_MARKS[digits[k]](ctx, cx + ux * slotRadius, cy + uy * slotRadius, markSize);
  }
}

interface PanState {
  startX: number;
  startY: number;
  moved: boolean;
  baseX: number;
  baseY: number;
}

export default function RuneCanvas({
  onSelectionChange,
  minRunes = 8,
  maxRunes = 16,
  resetSignal
}: RuneCanvasProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef<PanState | null>(null);
  const [selectedRunes, setSelectedRunes] = useState<number[]>([]);
  const [viewX, setViewX] = useState((GRID_SIZE - VIEW) / 2);
  const [viewY, setViewY] = useState((GRID_SIZE - VIEW) / 2);
  /** ขนาดช่องที่พอดีกับจอปัจจุบัน (คำนวณใหม่เมื่อหมุนจอ/เปลี่ยนขนาดหน้าต่าง) */
  const [cellPx, setCellPx] = useState(CELL_MAX_PX);
  const sizePx = VIEW * cellPx;

  // ปรับขนาดตารางให้พอดีจอ: วัดระยะเหนือตารางจริง (หัวเว็บ/หัวข้อ) แล้วกันที่ว่างใต้ตารางไว้
  useEffect(() => {
    /** ที่ว่างใต้ตารางที่ต้องกัน: ▼ + แถวปุ่มสุ่ม/ล้าง (+ ระยะห่าง) */
    const BELOW_CONTROLS_PX = 112;
    const fitToScreen = () => {
      const canvas = canvasRef.current;
      // ระยะจากบนเอกสารถึงขอบบนของตาราง (ไม่ขึ้นกับ scroll และไม่ขึ้นกับขนาดตารางเอง)
      const topDoc = (canvas?.getBoundingClientRect().top ?? 340) + window.scrollY;
      // แถบเมนูล่างเป็น fixed — ต้องกันความสูงจริง ไม่งั้นปุ่มล่างจะถูกบัง
      const bottomNav = document.querySelector<HTMLElement>('[data-bottom-nav="true"]');
      const bottomNavPx = bottomNav?.getBoundingClientRect().height ?? 64;
      const availW = window.innerWidth - 32 /* padding ของหน้า (p-4) */ - NAV_COLUMN_PX * 2;
      const availH = window.innerHeight + window.scrollY - topDoc - BELOW_CONTROLS_PX - bottomNavPx;
      const fitted = Math.floor(Math.min(availW, Math.max(availH, 240)) / VIEW);
      setCellPx(clamp(fitted, CELL_MIN_PX, CELL_MAX_PX));
    };
    fitToScreen();
    window.addEventListener('resize', fitToScreen);
    window.addEventListener('orientationchange', fitToScreen);
    return () => {
      window.removeEventListener('resize', fitToScreen);
      window.removeEventListener('orientationchange', fitToScreen);
    };
  }, []);

  // ล้างรูนที่เลือกเมื่อ parent สั่ง (หลังถอดรหัส) — ข้ามรอบแรกตอน mount
  const lastResetRef = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === undefined || lastResetRef.current === resetSignal) return;
    lastResetRef.current = resetSignal;
    setSelectedRunes([]);
    onSelectionChange([]);
  }, [resetSignal, onSelectionChange]);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, sizePx, sizePx);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let vx = 0; vx < VIEW; vx++) {
      for (let vy = 0; vy < VIEW; vy++) {
        const gx = viewX + vx;
        const gy = viewY + vy;
        const index = gy * GRID_SIZE + gx;
        const isSelected = selectedRunes.includes(index);
        const h = hashPos(index);
        ctx.fillStyle = isSelected ? '#f59e0b' : '#2d2d44';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = isSelected ? 12 : 0;
        const pad = Math.max(1.5, cellPx * 0.055);
        const cx = vx * cellPx + cellPx / 2;
        const cy = vy * cellPx + cellPx / 2;
        ctx.beginPath();
        ctx.roundRect(vx * cellPx + pad, vy * cellPx + pad, cellPx - pad * 2, cellPx - pad * 2, cellPx * 0.22);
        ctx.fill();
        ctx.shadowBlur = 0;
        // อักขระรูนของช่องนี้ (วาดเอง ไม่ซ้ำกันทั้งกระดาน — ดู traceRuneGlyph)
        // + ความสว่างต่างกันเล็กน้อยตามตำแหน่ง เพื่อให้กระดานดูมีมิติ
        const alpha = GLYPH_ALPHA_MIN + h * (GLYPH_ALPHA_MAX - GLYPH_ALPHA_MIN);
        ctx.strokeStyle = isSelected ? '#1a1a2e' : `rgba(245,158,11,${alpha.toFixed(2)})`;
        ctx.lineWidth = isSelected ? 2 : Math.max(1.2, cellPx * 0.045);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        traceRuneGlyph(ctx, cx, cy, cellPx * 0.6, index);
        ctx.stroke();
      }
    }
  }, [selectedRunes, viewX, viewY, sizePx, cellPx]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawGrid(ctx);
  }, [drawGrid]);

  const posFromClient = (clientX: number, clientY: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const vx = Math.floor(((clientX - rect.left) * scaleX) / cellPx);
    const vy = Math.floor(((clientY - rect.top) * scaleY) / cellPx);
    if (vx < 0 || vx >= VIEW || vy < 0 || vy >= VIEW) return -1;
    return runeIndexAt(viewX, viewY, vx, vy);
  };

  const toggleRune = (index: number) => {
    setSelectedRunes(prev => {
      if (prev.includes(index)) {
        const next = prev.filter(i => i !== index);
        onSelectionChange(next);
        return next;
      }
      if (prev.length >= maxRunes) return prev;
      const next = [...prev, index];
      onSelectionChange(next);
      return next;
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      try { canvas.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    }
    panRef.current = { startX: e.clientX, startY: e.clientY, moved: false, baseX: viewX, baseY: viewY };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pan = panRef.current;
    if (!pan) return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    if (!pan.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    pan.moved = true;
    // ลากเลยขอบ = วนไปอีกฝั่ง (ไม่มีการหยุดที่ขอบ)
    const nextX = wrapRuneOffset(pan.baseX - Math.round(dx / cellPx));
    const nextY = wrapRuneOffset(pan.baseY - Math.round(dy / cellPx));
    if (nextX !== viewX) setViewX(nextX);
    if (nextY !== viewY) setViewY(nextY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pan = panRef.current;
    panRef.current = null;
    if (!pan) return;
    try { canvasRef.current?.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    if (!pan.moved) {
      const index = posFromClient(e.clientX, e.clientY);
      if (index >= 0) toggleRune(index);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    panRef.current = null;
    try { canvasRef.current?.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };

  const panView = (dx: number, dy: number) => {
    // ใช้ฟังก์ชันอัปเดตแบบ functional ⇒ กดรัว ๆ ติดกันไม่ตกหล่น และวนไม่สิ้นสุด
    setViewX((prev) => wrapRuneOffset(prev + dx));
    setViewY((prev) => wrapRuneOffset(prev + dy));
  };

  const clearSelection = () => {
    setSelectedRunes([]);
    onSelectionChange([]);
  };

  const randomFill = () => {
    const set = new Set(selectedRunes);
    let guard = 0;
    while (set.size < maxRunes && guard < 2000) {
      guard++;
      set.add(Math.floor(Math.random() * GRID_SIZE * GRID_SIZE));
    }
    const next = [...set].slice(0, maxRunes);
    setSelectedRunes(next);
    onSelectionChange(next);
    // เลื่อนมุมมองไปจุดต่างๆที่สุ่มได้ได้บ้าง
    if (next.length > 0) {
      const first = next[0];
      setViewX(wrapRuneOffset(first % GRID_SIZE - VIEW / 2));
      setViewY(wrapRuneOffset(Math.floor(first / GRID_SIZE) - VIEW / 2));
    }
  };

  // ปุ่มลูกศรสามเหลี่ยม (ผู้ใช้สั่ง 2026-09-20: ทำเป็นสามเหลี่ยม + ย้ายไปด้านข้าง/บน-ล่างของตาราง)
  // ผู้ใช้สั่ง 2026-09-26: "ทำให้เวลากดมันวน เอามาต่อกัน ให้กดได้ไม่สิ้นสุด" ⇒ ไม่มี disabled ที่ขอบอีก
  const navTriBtn =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-800 text-base leading-none text-amber-300 transition-colors hover:bg-gray-700 active:bg-gray-600';
  const navBottomBtn = 'btn-secondary text-sm';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-center">
        <p className="text-sm text-gray-400">{t('discover.pickHint')}</p>
        <p className="text-lg font-bold text-amber-400">
          {t('discover.selected')}: {selectedRunes.length} / {maxRunes}
        </p>
      </div>

      {/* ▲ เหนือตาราง — กดวนขึ้นไม่สิ้นสุด (ขึ้นสุด → กลับไปล่างสุด) */}
      <button
        type="button"
        data-rune-nav="up"
        onClick={() => panView(0, -1)}
        aria-label={t('discover.navUp')}
        className={navTriBtn}
      >
        ▲
      </button>

      <div className="flex items-center gap-2">
        {/* ◀ ซ้ายของตาราง */}
        <button
          type="button"
          data-rune-nav="left"
          onClick={() => panView(-1, 0)}
          aria-label={t('discover.navLeft')}
          className={navTriBtn}
        >
          ◀
        </button>

        <canvas
          ref={canvasRef}
          width={sizePx}
          height={sizePx}
          className="rounded-xl border border-gray-700 cursor-grab select-none"
          style={{ width: sizePx, height: sizePx, touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />

        {/* ▶ ขวาของตาราง */}
        <button
          type="button"
          data-rune-nav="right"
          onClick={() => panView(1, 0)}
          aria-label={t('discover.navRight')}
          className={navTriBtn}
        >
          ▶
        </button>
      </div>

      {/* ▼ ใต้ตาราง — กดวนลงไม่สิ้นสุด (ลงสุด → กลับไปบนสุด) */}
      <button
        type="button"
        data-rune-nav="down"
        onClick={() => panView(0, 1)}
        aria-label={t('discover.navDown')}
        className={navTriBtn}
      >
        ▼
      </button>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={randomFill}
          className={navBottomBtn}
        >
          {t('discover.random', { n: maxRunes })}
        </button>
        <button
          type="button"
          onClick={clearSelection}
          className={navBottomBtn}
          disabled={selectedRunes.length === 0}
        >
          {t('discover.clear')}
        </button>
        {selectedRunes.length < minRunes && (
          <span className="text-sm text-gray-500">{t('discover.needMore', { n: minRunes })}</span>
        )}
      </div>
    </div>
  );
}
