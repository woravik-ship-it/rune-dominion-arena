'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

interface RuneCanvasProps {
  onSelectionChange: (selectedRunes: number[]) => void;
  minRunes?: number;
  maxRunes?: number;
}

const GRID_SIZE = 100;
const VIEW = 10;
const CELL_PX = 36;
const MAX_VIEW = GRID_SIZE - VIEW; // 90 — largest top-left offset
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

const GLYPHS = ['ᚠ','ᚢ','ᚦ','ᚨ','ᚱ','ᚲ','ᚷ','ᚹ','ᚺ','ᚾ','ᛁ','ᛃ','ᛇ','ᛈ','ᛉ','ᛊ','ᛏ','ᛒ','ᛖ','ᛗ','ᛚ','ᛜ','ᛞ','ᛟ'];

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
  maxRunes = 16
}: RuneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef<PanState | null>(null);
  const [selectedRunes, setSelectedRunes] = useState<number[]>([]);
  const [viewX, setViewX] = useState((GRID_SIZE - VIEW) / 2);
  const [viewY, setViewY] = useState((GRID_SIZE - VIEW) / 2);
  const sizePx = VIEW * CELL_PX;

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
        const order = selectedRunes.indexOf(index);
        const h = hashPos(index);
        ctx.fillStyle = isSelected ? '#f59e0b' : '#2d2d44';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = isSelected ? 12 : 0;
        const pad = 2;
        const cx = vx * CELL_PX + CELL_PX / 2;
        const cy = vy * CELL_PX + CELL_PX / 2;
        ctx.beginPath();
        ctx.roundRect(vx * CELL_PX + pad, vy * CELL_PX + pad, CELL_PX - pad * 2, CELL_PX - pad * 2, 8);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = isSelected ? '#1a1a2e' : `rgba(245,158,11,${0.35 + h * 0.55})`;
        ctx.font = `${Math.floor(CELL_PX * 0.52)}px serif`;
        ctx.fillText(GLYPHS[index % GLYPHS.length], cx, cy + 1);
        if (isSelected) {
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(vx * CELL_PX + CELL_PX - 9, vy * CELL_PX + 9, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText(String(order + 1), vx * CELL_PX + CELL_PX - 9, vy * CELL_PX + 9.5);
        }
      }
    }
  }, [selectedRunes, viewX, viewY, sizePx]);

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
    const vx = Math.floor(((clientX - rect.left) * scaleX) / CELL_PX);
    const vy = Math.floor(((clientY - rect.top) * scaleY) / CELL_PX);
    if (vx < 0 || vx >= VIEW || vy < 0 || vy >= VIEW) return -1;
    return (viewY + vy) * GRID_SIZE + (viewX + vx);
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
    const nextX = clamp(pan.baseX - Math.round(dx / CELL_PX), 0, MAX_VIEW);
    const nextY = clamp(pan.baseY - Math.round(dy / CELL_PX), 0, MAX_VIEW);
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
    setViewX(clamp(viewX + dx, 0, MAX_VIEW));
    setViewY(clamp(viewY + dy, 0, MAX_VIEW));
  };

  const clearSelection = () => {
    setSelectedRunes([]);
    onSelectionChange([]);
  };

  const navBtn = 'flex-1 h-10 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-200 text-sm disabled:opacity-30';

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-center">
        <p className="text-sm text-gray-400">
          เลือกรูน {minRunes}-{maxRunes} ตำแหน่ง · ลากเพื่อเลื่อนแผน
        </p>
        <p className="text-lg font-bold text-amber-400">
          เลือกแล้ว: {selectedRunes.length} / {maxRunes}
        </p>
      </div>

      <canvas
        ref={canvasRef}
        width={sizePx}
        height={sizePx}
        className="max-w-full h-auto rounded-xl border border-gray-700 cursor-grab select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>พิกัด: ({viewX}, {viewY}) · {VIEW}×{VIEW}</span>
        <button type="button" onClick={() => { setViewX((GRID_SIZE - VIEW) / 2); setViewY((GRID_SIZE - VIEW) / 2); }} className={navBtn}>
          กลับกลาง
        </button>
      </div>

      <div className="flex flex-col items-center gap-1">
        <button type="button" className={navBtn} onClick={() => panView(0, -1)}>↑</button>
        <div className="flex gap-1">
          <button type="button" className={navBtn} onClick={() => panView(-1, 0)}>←</button>
          <span className="w-10" />
          <button type="button" className={navBtn} onClick={() => panView(1, 0)}>→</button>
        </div>
        <button type="button" className={navBtn} onClick={() => panView(0, 1)}>↓</button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={clearSelection}
          className="btn-secondary text-sm"
          disabled={selectedRunes.length === 0}
        >
          ล้าง
        </button>
        <div className="text-sm text-gray-500 flex items-center">
          {selectedRunes.length < minRunes && (
            <span>ต้องเลือกอย่างน้อย {minRunes} จุด</span>
          )}
        </div>
      </div>

      {selectedRunes.length > 0 && (
        <div className="text-xs text-gray-500 text-center max-w-md break-words">
          ลำดับรูน: {selectedRunes.join(', ')}
        </div>
      )}
    </div>
  );
}
