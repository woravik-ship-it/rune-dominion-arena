'use client';

// Error ของ (game) zone — แสดงข้อความ + ปุ่มลองใหม่/กลับหน้าแรก (Phase 12)
import Link from 'next/link';
import { useEffect } from 'react';

export default function GameError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[game error]', error.message, error.digest);
  }, [error]);

  return (
    <main className="min-h-screen p-4 flex items-center justify-center">
      <div className="max-w-md w-full bg-gray-800 rounded-xl p-6 text-center">
        <p className="text-4xl mb-3">🛠️</p>
        <h1 className="text-xl font-bold text-white mb-2">หน้านี้โหลดไม่สำเร็จ</h1>
        <p className="text-sm text-gray-400 mb-5">
          ลองกดปุ่มด้านล่างอีกครั้ง หากยังไม่หายให้กลับหน้าแรกแล้วเข้าใหม่
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="btn-primary">ลองใหม่</button>
          <Link href="/" className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600">
            กลับหน้าแรก
          </Link>
        </div>
      </div>
    </main>
  );
}
