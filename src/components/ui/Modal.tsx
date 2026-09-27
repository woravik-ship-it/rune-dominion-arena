'use client';

// Modal — "ฟอง/ป็อปอัป" กลางของเกม (Phase 41 → ปรับตามที่ผู้ใช้แจ้ง Phase 42)
//
// ผู้ใช้สั่ง:
//  *"UI บางอย่างควรเป็นแค่เหมือน ฟอง หรือ Pop-up ขึ้นมา เช่นแจ้งเตือน หรือดูรายละเอียดการ์ด"*
//  *"การเปลี่ยน Item หรือการขาย ต้องมีหน้า Confirm"*
//  *"ในมือถือปิดก็ไม่ได้ ต้องเล่นเต็มจอถึงจะเห็น ⇒ ให้คงหัวตารางไว้ที่มีปุ่มปิด เลื่อนเฉพาะตรงการ์ด"*
//  *"หน้ากระเป๋า กดดูการ์ดบนมือถือ แล้วกดปิดไม่ค่อยได้เนื่องจากเกินจอ"*
//
// กติกาที่แก้ (Phase 42):
//  - ใช้ `dvh` (dynamic viewport) ไม่ใช่ `vh` — กันปัญหามือถือ (URL bar) ทำให้กล่องสูงเกินจอจนปุ่มปิดหลุด
//  - **หัวกล่อง (มีปุ่ม ✕) ติดอยู่กับที่เสมอ** · เลื่อนได้เฉพาะเนื้อหา (`overscroll-contain`)
//  - มีปุ่ม "ปิด" ใหญ่ที่ท้ายกล่องอีกจุด ⇒ ปิดได้ทุกกรณีแม้เนื้อหายาว
//  - ระยะขอบล่างเว้น safe-area ของ iPhone
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
        // Phase 42: ใช้ dvh + จำกัดความสูงกล่อง ⇒ หัวกล่อง/ท้ายกล่องอยู่ในจอเสมอ (มือถือปิดได้แน่นอน)
        className={`flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-gray-900 shadow-2xl sm:max-h-[88dvh] sm:rounded-2xl ${SIZE_CLASS[size]}`}
      >
        {/* ── หัวกล่อง: ติดอยู่กับที่ + ปุ่มปิดขนาดใหญ่ (แตะง่ายบนมือถือ) ── */}
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-gray-900 px-4 py-3">
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
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg text-gray-100 hover:bg-white/20 active:scale-95"
            >
              ✕
            </button>
          )}
        </div>

        {/* ── เนื้อหา: เลื่อนเฉพาะส่วนนี้ ── */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>

        {/* ── ท้ายกล่อง: footer ที่ส่งมา + ปุ่มปิดสำรอง (มีทุกกล่องที่ปิดได้) ── */}
        <div
          className="shrink-0 border-t border-white/10 bg-black/20 px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          {footer}
          {dismissable && (
            <button
              type="button"
              onClick={onClose}
              data-modal-close-bottom
              className={`w-full rounded-xl bg-white/10 px-3 py-2 text-sm text-gray-100 hover:bg-white/20 ${footer ? 'mt-2' : ''}`}
            >
              ปิด
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

