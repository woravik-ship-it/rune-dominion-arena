'use client';

// EmptyState — สถานะว่างของทุกหน้า + ปุ่มนำทาง (Phase 12)
import Link from 'next/link';

interface Props {
  icon?: string;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon = '🌙',
  title,
  description,
  actionHref,
  actionLabel,
  onAction,
}: Props) {
  return (
    <div className="bg-gray-800/70 border border-gray-700 rounded-xl p-8 text-center">
      <p className="text-4xl mb-3">{icon}</p>
      <p className="text-white font-semibold mb-1">{title}</p>
      {description && <p className="text-sm text-gray-400 mb-4">{description}</p>}
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn-primary inline-block">
          {actionLabel}
        </Link>
      )}
      {!actionHref && onAction && actionLabel && (
        <button onClick={onAction} className="btn-primary">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
