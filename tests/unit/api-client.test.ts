/**
 * @jest-environment jsdom
 */
import { getDeviceId, resetDeviceId, apiFetch } from '@/lib/api-client';

describe('API Client — device fingerprint (Phase 10)', () => {
  beforeEach(() => {
    resetDeviceId();
    window.localStorage.clear();
  });

  test('getDeviceId สร้าง id ใหม่และคงค่าเดิมเมื่อเรียกซ้ำ', () => {
    const first = getDeviceId();
    expect(first).toBeTruthy();
    expect(getDeviceId()).toBe(first);
    expect(window.localStorage.getItem('rda_device_id')).toBe(first);
  });

  test('resetDeviceId แล้วได้ id ใหม่', () => {
    const first = getDeviceId();
    resetDeviceId();
    expect(getDeviceId()).not.toBe(first);
  });

  test('apiFetch แทรก header x-device-id ให้อัตโนมัติ', async () => {
    const deviceId = getDeviceId();
    // jsdom ไม่มี global.fetch — กำหนด mock ก่อน
    global.fetch = jest.fn().mockResolvedValue(({ ok: true } as unknown as Response)) as unknown as typeof fetch;
    const fetchSpy = jest.spyOn(global, 'fetch');
    await apiFetch('/api/test', { method: 'POST', body: '{}' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('x-device-id')).toBe(deviceId);
    fetchSpy.mockRestore();
  });

  test('apiFetch เคารพ header เดิมที่ผู้เรียกส่งมา (ไม่ทับ)', async () => {
    getDeviceId();
    global.fetch = jest.fn().mockResolvedValue(({ ok: true } as unknown as Response)) as unknown as typeof fetch;
    const fetchSpy = jest.spyOn(global, 'fetch');
    await apiFetch('/api/test', { headers: { 'content-type': 'application/json' } });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-device-id')).toBeTruthy();
    fetchSpy.mockRestore();
  });
});
