'use client';

// ErrorBoundary ระดับ app — จับ error ที่ไม่คาดคิดทั้งแอป (Phase 12)
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // log ฝั่ง client (Phase 12: monitoring hook)
    console.error('[app error]', error.message, error.digest);
  }, [error]);

  return (
    <html lang="th">
      <body style={{ background: '#0b1020', color: '#e5e7eb', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>⚠️</p>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>เกิดข้อผิดพลาดในระบบ</h1>
            <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 20 }}>
              ระบบบันทึกปัญหาไว้แล้ว กรุณาลองใหม่อีกครั้ง
              {error.digest && <><br />รหัสอ้างอิง: {error.digest}</>}
            </p>
            <button
              onClick={reset}
              style={{
                background: '#f59e0b', color: '#111827', border: 'none',
                padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ลองใหม่อีกครั้ง
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
