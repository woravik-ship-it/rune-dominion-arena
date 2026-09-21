'use client';

// Tooltip — Phase 12: คำอธิบายสั้นสำหรับมือถือ (แตะเพื่อเปิด/ปิด)
import { useState } from 'react';

interface Props {
  text: string;
  children?: React.ReactNode;
  position?: 'top' | 'bottom';
}

export default function Tooltip({ text, children, position = 'top' }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        aria-label="คำอธิบาย"
        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-[11px] text-gray-300 hover:bg-gray-600"
      >
        {children ?? '?'}
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute left-1/2 z-50 w-56 -translate-x-1/2 rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-xs text-gray-200 shadow-lg ${
            position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
