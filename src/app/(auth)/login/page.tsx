'use client';

import { apiFetch } from '@/lib/api-client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const json = await res.json();
      if (json.success) {
        router.push('/');
        router.refresh();
      } else {
        setError(json.error || 'เข้าสู่ระบบไม่สำเร็จ');
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-6">
          <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
            เข้าสู่ระบบ
          </span>
        </h1>

        <form onSubmit={submit} className="space-y-4 bg-gray-800/60 border border-white/10 rounded-2xl p-6">
          <div>
            <label className="text-sm text-gray-300 mb-1 block">ชื่อผู้ใช้ หรือ อีเมล</label>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoComplete="username"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500"
              placeholder="warrior99"
            />
          </div>
          <div>
            <label className="text-sm text-gray-300 mb-1 block">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>

          <p className="text-sm text-center text-gray-400">
            ยังไม่มีบัญชี?{' '}
            <Link href="/register" className="text-amber-400 hover:text-amber-300">
              สมัครสมาชิก
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
