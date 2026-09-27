'use client';

// /cards → /decks (Phase 42)
//
// ผู้ใช้สั่ง 2026-09-27: *"หน้าการ์ด ถ้าไม่จำเป็นก็เอาออก เอามารวมกับหน้า Deck
//   เพราะอย่างไรก็ดูการ์ดได้เหมือนกัน"*
// ⇒ หน้าการ์ดถูกควบรวมเข้า "คลังการ์ด" ในหน้าจัดเด็ค (ดูการ์ด/ใส่ Item/ส่งเข้าทีม/ขาย)
//   หน้านี้เหลือไว้เป็นทางผ่านให้ลิงก์เก่าใช้งานได้ (ไม่พัง 404)
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CardsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/decks');
  }, [router]);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <p className="text-sm text-gray-400">รวมหน้าการ์ดไว้ในหน้าจัดเด็คแล้ว — กำลังพาไป…</p>
    </main>
  );
}
