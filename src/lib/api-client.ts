// API Fetch Wrapper (client-side) — Phase 10
// แทรก header x-device-id อัตโนมัติทุก request (fingerprint สำหรับตรวจ Alt-account)
// Device id เป็นค่าสุ่มถาวรต่อ browser (เก็บใน localStorage) — ไม่ใช่ข้อมูลส่วนบุคคล
'use client';

const DEVICE_ID_KEY = 'rda_device_id';

/** ดึง device id ของ browser นี้ — ไม่มีก็สร้างใหม่ (uuid แบบ crypto) */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    } catch {
      // localStorage ถูกปิด (เช่น private mode บาง browser) — ใช้ใน session นี้พอ
    }
  }
  return id;
}

/** fetch สำหรับเรียก API ภายใน — เหมือน fetch เดิมแต่แทรก x-device-id ให้เอง */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const deviceId = getDeviceId();
  if (deviceId) headers.set('x-device-id', deviceId);
  return fetch(input, { ...init, headers });
}

/** ล้าง device id (ใช้ในเทส / ผู้ใช้ต้องการ reset fingerprint) */
export function resetDeviceId(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(DEVICE_ID_KEY);
  }
}

