'use client';

// AvatarView — แสดงอวตารผู้เล่น (อิโมจิ หรือภาพวาด 6×6) — Phase 26
//
// ผู้ใช้สั่ง 2026-09-27: "เพิ่ม เลือก Emoji แทนตัว หรือ สามารถวาด เองได้จาก ช่องวาด 6x6 ช่อง"
// ใช้ร่วมกันทั้งหน้าโปรไฟล์และหัวเว็บ ⇒ รูปอวตารหน้าตาเหมือนกันทุกที่
import { AVATAR_GRID_SIZE, cellColor, isValidAvatarEmoji, paintedCells, sanitizeAvatarGrid } from '@/lib/avatar';

export default function AvatarView({
  emoji,
  grid,
  size = 32,
  /** อิโมจิเริ่มต้นเมื่อยังไม่มีอวตาร (ปกติ 👤) */
  fallback = '👤',
  className = '',
  title,
}: {
  emoji?: string | null;
  grid?: string | null;
  size?: number;
  fallback?: string;
  className?: string;
  title?: string;
}) {
  const useEmoji = isValidAvatarEmoji(emoji);
  const cells = sanitizeAvatarGrid(grid ?? '');
  const painted = paintedCells(cells);

  if (useEmoji) {
    return (
      <span
        data-avatar-kind="emoji"
        data-avatar-emoji={emoji}
        title={title}
        className={`inline-flex items-center justify-center leading-none ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.72 }}
      >
        {emoji}
      </span>
    );
  }

  if (painted === 0) {
    return (
      <span
        data-avatar-kind="default"
        title={title}
        className={`inline-flex items-center justify-center leading-none ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.72 }}
      >
        {fallback}
      </span>
    );
  }

  return (
    <span
      data-avatar-kind="grid"
      data-avatar-grid={cells}
      title={title}
      className={`inline-grid overflow-hidden rounded ${className}`}
      style={{
        width: size,
        height: size,
        gridTemplateColumns: `repeat(${AVATAR_GRID_SIZE}, 1fr)`,
        gridTemplateRows: `repeat(${AVATAR_GRID_SIZE}, 1fr)`,
        backgroundColor: 'rgba(17,24,39,0.85)',
      }}
    >
      {cells.split('').map((char, index) => (
        <span
          key={index}
          data-avatar-cell={char}
          style={{ backgroundColor: cellColor(char) ?? 'transparent' }}
        />
      ))}
    </span>
  );
}
