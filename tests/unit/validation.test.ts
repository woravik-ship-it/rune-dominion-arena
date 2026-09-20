import { NextRequest } from 'next/server';
import {
  discoverSchema,
  arenaCreateSchema,
  cardFavoriteSchema,
  deckCreateSchema,
  parseJsonBody,
} from '@/lib/validation';

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/test', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('Input Validation (Zod) — Phase 10', () => {
  test('discover: รูน 8–16 จุดช่วงกริดถูกต้อง → ผ่าน', () => {
    const runes = Array.from({ length: 10 }, (_, i) => i);
    expect(discoverSchema.safeParse({ runes, userId: 'user-1' }).success).toBe(true);
  });

  test('discover: รูนน้อยกว่า 8 จุด → ปฏิเสธ', () => {
    expect(discoverSchema.safeParse({ runes: [1, 2, 3], userId: 'u' }).success).toBe(false);
  });

  test('discover: รูนเกิน 16 จุด → ปฏิเสธ', () => {
    const runes = Array.from({ length: 17 }, (_, i) => i);
    expect(discoverSchema.safeParse({ runes, userId: 'u' }).success).toBe(false);
  });

  test('discover: ตำแหน่งเกินกริด (>= 10000) → ปฏิเสธ', () => {
    const runes = Array.from({ length: 8 }, () => 10_000);
    expect(discoverSchema.safeParse({ runes, userId: 'u' }).success).toBe(false);
  });

  test('discover: รูนเป็นทศนิยมหรือสตริง → ปฏิเสธ', () => {
    const floats = Array.from({ length: 8 }, (_, i) => i + 0.5);
    expect(discoverSchema.safeParse({ runes: floats, userId: 'u' }).success).toBe(false);
    const strs = Array.from({ length: 8 }, (_, i) => String(i));
    expect(discoverSchema.safeParse({ runes: strs, userId: 'u' }).success).toBe(false);
  });

  test('arena create: ชื่อห้องว่างหรือยาวเกิน 60 → ปฏิเสธ', () => {
    expect(arenaCreateSchema.safeParse({ userId: 'u', name: '', deckId: 'd' }).success).toBe(false);
    expect(arenaCreateSchema.safeParse({ userId: 'u', name: 'x'.repeat(61), deckId: 'd' }).success).toBe(false);
  });

  test('favorite: isFavorite ต้องเป็น boolean เท่านั้น', () => {
    expect(cardFavoriteSchema.safeParse({ userId: 'u', cardId: 'c', isFavorite: 'yes' }).success).toBe(false);
    expect(cardFavoriteSchema.safeParse({ userId: 'u', cardId: 'c', isFavorite: true }).success).toBe(true);
  });

  test('deck: position ต้องเป็น int 0–4', () => {
    expect(
      deckCreateSchema.safeParse({ userId: 'u', name: 't', slots: [{ cardId: 'c', position: 9 }] }).success
    ).toBe(false);
    expect(
      deckCreateSchema.safeParse({ userId: 'u', name: 't', slots: [{ cardId: 'c', position: 0 }] }).success
    ).toBe(true);
  });

  test('parseJsonBody: JSON พัง → 400 พร้อมข้อความไทย', async () => {
    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      body: '{bad-json',
      headers: { 'content-type': 'application/json' },
    });
    const result = await parseJsonBody(req, discoverSchema);
    expect(result.errorResponse?.status).toBe(400);
    const body = await result.errorResponse?.json();
    expect(body?.error).toContain('JSON');
  });

  test('parseJsonBody: field ไม่ผ่าน schema → 400 ระบุ path', async () => {
    const result = await parseJsonBody(jsonRequest({ runes: [1], userId: 'u' }), discoverSchema);
    expect(result.errorResponse?.status).toBe(400);
    const body = await result.errorResponse?.json();
    expect(body?.error).toContain('runes');
  });

  test('parseJsonBody: ผ่าน → ได้ data ที่ typed ถูกต้อง', async () => {
    const result = await parseJsonBody(
      jsonRequest({ runes: [0, 1, 2, 3, 4, 5, 6, 7], userId: 'u1', extra: 'ถูกตัดทิ้ง' }),
      discoverSchema
    );
    expect(result.errorResponse).toBeUndefined();
    expect(result.data?.userId).toBe('u1');
    expect(result.data?.runes).toHaveLength(8);
  });
});
