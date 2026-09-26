// เวลาแบบอ่านง่ายตามภาษา (Phase 20) — แยกไว้เป็น lib เพราะหน้าจอของ Next.js ห้าม export ฟังก์ชันอื่น
export type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function relativeTime(iso: string, t: TFn, now: number = Date.now()): string {
  const timestamp = new Date(iso).getTime();
  const diff = Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : 0;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t('notif.justNow');
  if (minutes < 60) return t('notif.minutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notif.hoursAgo', { n: hours });
  return t('notif.daysAgo', { n: Math.floor(hours / 24) });
}
