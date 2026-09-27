'use client';

// Modal — "ฟอง/ป็อปอัป" กลางของเกม (Phase 41)
//
// ผู้ใช้สั่ง 2026-09-27: *"UI บางอย่างควรเป็นแค่เหมือน ฟอง หรือ Pop-up ขึ้นมา เช่นแจ้งเตือน
//   หรือดูรายละเอียดการ์ด"* · *"การเปลี่ยน Item หรือการขาย ต้องมีหน้า Confirm"*
//
// ใช้ร่วมกันทุกจุด (ดูการ์ด · ยืนยันการขาย · ยืนยันออกจากหน้าโดยไม่บันทึก ฯลฯ)
//  - มือถือ = แผ่นเลื่อนขึ้นจากด้านล่าง (bottom sheet) · จอใหญ่ = กล่องกลางจอ
//  - ปิดได้ด้วย: ปุ่ม ✕ · คลิกพื้นหลัง · ปุ่ม Esc · ล็อกการเลื่อนหน้าหลังเปิด
//  - เพิ่ม data-modal ให้สคริปต์ตรวจ UI จับได้
import { useCallback, useEffect } from 'react';

export type ModalSize = 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
};

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  /** false = ปิดได้เฉพาะปุ่มใน footer (ใช้กับการยืนยันที่ต้องเลือกจริง ๆ) */
  dismissable?: boolean;
}) {
  const close = useCallback(() => {
    if (dismissable) onClose();
  }, [dismissable, onClose]);

  // Esc + ล็อกการเลื่อนพื้นหลัง (คืนค่าเดิมเมื่อปิด)
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      data-modal="true"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={close}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-gray-900 shadow-2xl sm:rounded-2xl ${SIZE_CLASS[size]}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            {title && <p className="truncate text-base font-bold text-white">{title}</p>}
            {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
          </div>
          {dismissable && (
            <button
              type="button"
              onClick={onClose}
              data-modal-close
              aria-label="ปิด"
              className="shrink-0 rounded-lg bg-white/10 px-2 py-1 text-sm text-gray-200 hover:bg-white/20"
            >
              ✕
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-white/10 bg-black/20 px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
