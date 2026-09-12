'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

interface RuneCanvasProps {
  onSelectionChange: (selectedRunes: number[]) => void;
  minRunes?: number;
  maxRunes?: number;
}

const GRID_SIZE = 100;
const CELL_SIZE = 8;
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;

export default function RuneCanvas({ 
  onSelectionChange, 
  minRunes = 8, 
  maxRunes = 16 
}: RuneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedRunes, setSelectedRunes] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw grid cells
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const index = y * GRID_SIZE + x;
        const isSelected = selectedRunes.includes(index);
        
        if (isSelected) {
          ctx.fillStyle = '#f59e0b';
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 10;
        } else {
          ctx.fillStyle = '#2d2d44';
          ctx.shadowBlur = 0;
        }
        
        ctx.fillRect(x * CELL_SIZE + 1, y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      }
    }
    ctx.shadowBlur = 0;
  }, [selectedRunes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    drawGrid(ctx);
  }, [drawGrid]);

  const getRuneIndex = (e: React.MouseEvent<HTMLCanvasElement>): number => {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = Math.floor((e.clientX - rect.left) * scaleX / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) * scaleY / CELL_SIZE);
    
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return -1;
    
    return y * GRID_SIZE + x;
  };

  const toggleRune = (index: number) => {
    setSelectedRunes(prev => {
      if (prev.includes(index)) {
        const newSelection = prev.filter(i => i !== index);
        onSelectionChange(newSelection);
        return newSelection;
      } else if (prev.length < maxRunes) {
        const newSelection = [...prev, index];
        onSelectionChange(newSelection);
        return newSelection;
      }
      return prev;
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const index = getRuneIndex(e);
    if (index >= 0) toggleRune(index);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const index = getRuneIndex(e);
    if (index >= 0 && !selectedRunes.includes(index) && selectedRunes.length < maxRunes) {
      toggleRune(index);
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const clearSelection = () => {
    setSelectedRunes([]);
    onSelectionChange([]);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-center">
        <p className="text-sm text-gray-400">
          เลือกรูน {minRunes}-{maxRunes} ตำแหน่ง
        </p>
        <p className="text-lg font-bold text-amber-400">
          เลือกแล้ว: {selectedRunes.length} / {maxRunes}
        </p>
      </div>
      
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="border border-gray-700 rounded-lg cursor-crosshair max-w-full h-auto"
        style={{ imageRendering: 'pixelated' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      
      <div className="flex gap-2">
        <button
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
        <div className="text-xs text-gray-500 text-center max-w-md">
          ลำดับรูน: {selectedRunes.join(', ')}
        </div>
      )}
    </div>
  );
}
