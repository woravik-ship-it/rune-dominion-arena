// Logger — Phase 12: structured log + slow-request warning
// ใช้ node runtime เท่านั้น (middleware อยู่ edge) — ฝั่ง edge ส่ง header request-id แทน
// หมายเหตุความปลอดภัย: ห้าม log ข้อมูลอ่อนไหว (password/token/cookie)

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? '').toLowerCase();
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error') return env;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

/** จำนวน ms ที่ถือว่า "ช้า" ควรได้ warn (ปรับด้วย SLOW_REQUEST_MS) */
export function slowRequestMs(): number {
  const raw = Number(process.env.SLOW_REQUEST_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 1000;
}

export interface LogFields {
  requestId?: string;
  userId?: string;
  path?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel()]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
};

/** log คำขอ HTTP 1 บรรทัด — เพิ่ม level เป็น warn ถ้าเกิน slowRequestMs() */
export function logRequest(fields: LogFields & { durationMs: number }): void {
  const slow = fields.durationMs >= slowRequestMs();
  emit(slow ? 'warn' : 'info', slow ? 'slow_request' : 'request', {
    ...fields,
    slow: slow || undefined,
  });
}

/** สร้าง request id สั้น ๆ สำหรับ correlate log (ไม่ใช่ความลับ) */
export function newRequestId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
