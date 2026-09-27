'use client';

// ConfirmDialog — หน้ายืนยันก่อนทำสิ่งที่ "เปลี่ยนของ/เสียของ" (Phase 41)
//
// ผู้ใช้สั่ง 2026-09-27: *"การเปลี่ยน Item หรือการขาย ต้องมีหน้า Confirm"*
// ใช้กับ: ขายการ์ด · ขายไอเทม · เปลี่ยน/ถอด Item · เอาออกจากการ์ด · ออกจากหน้าโดยไม่บันทึก
import Modal from '@/components/ui/Modal';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: React.ReactNode;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      dismissable={false}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            data-confirm-accept
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-500 text-black hover:bg-amber-400'
            }`}
          >
            {busy ? 'กำลังทำ…' : confirmLabel}
          </button>
          <button
            type="button"
            data-confirm-cancel
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm text-gray-100 hover:bg-white/20 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        </div>
      }
    >
      <div data-confirm="true">
        {message && <p className="whitespace-pre-line text-sm text-gray-300">{message}</p>}
        {children}
      </div>
    </Modal>
  );
}
