'use client';

// Error ของ (auth) — หน้า login/register (Phase 12)
import Link from 'next/link';
import { useEffect } from 'react';

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[auth error]', error.message, error.digest);
  }, [error]);

  return (
    <main className="min-h-screen p-4 flex items-center justify-center">
      <div className="max-w-sm w-full bg-gray-800 rounded-xl p-6 text-center">
        <p className="text-4xl mb-3">🔑</p>
        <h1 className="text-lg font-bold text-white mb-2">เข้าสู่ระบบไม่สำเร็จ</h1>
        <p className="text-sm text-gray-400 mb-5">กรุณาลองใหม่อีกครั้ง</p>
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="btn-primary">ลองใหม่</button>
          <Link href="/login" className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600">
            ไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </main>
  );
}
