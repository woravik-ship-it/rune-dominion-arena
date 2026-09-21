import { cardArtSrc, isGeneratingStatus } from '@/lib/card-image';

// Phase 14.3: กติกา UX ของผู้ใช้ — "ห้ามแสดงการ์ดวาดเอง (สคริปต์) เด็ดขาด"
// และระหว่างสร้างใหม่ต้องแสดงสถานะ "กำลังสร้างภาพ"
describe('CardFace กติกาการแสดงรูป (ไม่โชว์การ์ดสคริปต์)', () => {
  test('cardArtSrc: รับเฉพาะภาพจริง (art/ภายนอก) และปฏิเสธการ์ดวาดเองของเรา', () => {
    expect(cardArtSrc('/api/cards/abc/art')).toBe('/api/cards/abc/art');
    expect(cardArtSrc('/api/cards/abc/art?v=deadbeef')).toBe('/api/cards/abc/art?v=deadbeef');
    expect(cardArtSrc('https://cdn.example.com/card.jpg')).toBe('https://cdn.example.com/card.jpg');

    // การ์ดวาดเอง (placeholder SVG ของเรา) → ต้องไม่ถูกนำมาแสดง
    expect(cardArtSrc('/api/cards/abc/image')).toBeNull();
    expect(cardArtSrc('/api/cards/abc/image?v=6')).toBeNull();
    expect(cardArtSrc('/api/cards/abc/image?v=6&mode=overlay')).toBeNull();
    expect(cardArtSrc(null)).toBeNull();
    expect(cardArtSrc(undefined)).toBeNull();
  });

  test('isGeneratingStatus: PENDING/PROCESSING/ไม่ระบุ = กำลังสร้าง · READY/FAILED = ไม่ใช่', () => {
    expect(isGeneratingStatus('PENDING')).toBe(true);
    expect(isGeneratingStatus('PROCESSING')).toBe(true);
    expect(isGeneratingStatus(null)).toBe(true);
    expect(isGeneratingStatus(undefined)).toBe(true);
    expect(isGeneratingStatus('READY')).toBe(false);
    expect(isGeneratingStatus('FAILED')).toBe(false);
  });
});
