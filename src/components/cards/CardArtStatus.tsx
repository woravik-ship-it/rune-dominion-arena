'use client';

// CardArtStatus — บอกสถานะการสร้างภาพการ์ด + เวลาที่ต้องรอ (Phase 20)
//
// ผู้ใช้สั่ง 2026-09-26: "ตอน Gen รูปการ์ด ให้บอกว่าใช้เวลาประมาณเท่าไร และสามารถกลับมาดูได้ภายหลัง"
//  - ดึงสถานะจาก /api/images/status (คิว + เวลาประมาณ) แล้วอัปเดตเองทุก 10 วินาที
//  - เมื่อภาพเสร็จ จะเรียก onReady() ให้หน้าแม่โหลดภาพใหม่ (และมีการแจ้งเตือนค้างในศูนย์แจ้งเตือน)
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/providers/LocaleProvider';
import { etaPhraseKey, etaPhraseVars } from '@/lib/image-eta';

interface StatusPayload {
  cardId: string;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'NONE';
  queuePosition: number;
  queueTotal: number;
  etaSeconds: number;
  artUrl: string | null;
}

interface CardArtStatusProps {
  cardId: string;
  /** compact = ใช้ในกริดการ์ด (ข้อความสั้น บรรทัดเดียว) */
  compact?: boolean;
  /** เรียกเมื่อสถานะกลายเป็น READY (ให้หน้าแม่รีเฟรชภาพ) */
  onReady?: () => void;
  /** เริ่มนับเวลารอจากตอนนี้หรือไม่ (ปิดเมื่อไม่อยากให้ยิง API) */
  enabled?: boolean;
}

export default function CardArtStatus({ cardId, compact = false, onReady, enabled = true }: CardArtStatusProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const readyNotified = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/images/status?cardId=${encodeURIComponent(cardId)}`);
      const data = await res.json();
      if (!res.ok || !data?.success) return;
      const items = (data.data?.items ?? []) as StatusPayload[];
      const mine = items.find((item) => item.cardId === cardId) ?? null;
      setStatus(mine);
      if (mine?.status === 'READY' && !readyNotified.current) {
        readyNotified.current = true;
        onReady?.();
      }
    } catch {
      /* เงียบไว้ — สถานะเป็นข้อมูลเสริม ไม่ควรทำให้หน้าพัง */
    }
  }, [cardId, onReady]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [enabled, load]);

  if (!status || status.status === 'READY' || status.status === 'NONE') return null;

  const etaText = t(etaPhraseKey(status.etaSeconds), { n: etaPhraseVars(status.etaSeconds) });
  const generating = status.status === 'PROCESSING';

  if (status.status === 'FAILED') {
    return (
      <p data-card-art-status="FAILED" className={compact ? 'text-[11px] text-red-400' : 'text-sm text-red-400'}>
        ⚠️ {t('image.failed')}
      </p>
    );
  }

  if (compact) {
    return (
      <p data-card-art-status={status.status} className="text-[11px] text-amber-300">
        🎨 {etaText}
      </p>
    );
  }

  return (
    <div
      data-card-art-status={status.status}
      className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
    >
      <p className="font-bold text-amber-200">{t('image.generating')}</p>
      <p className="mt-1 text-amber-100">
        {generating && <span>{t('image.processing')}{' · '}</span>}
        {etaText}
        {status.queueTotal > 1 && (
          <span className="text-amber-200/80">
            {' · '}
            {t('image.queued', { position: status.queuePosition + 1, total: status.queueTotal })}
          </span>
        )}
      </p>
      <p className="mt-1 text-xs text-amber-200/80">{t('image.comeBackLater')}</p>
    </div>
  );
}
