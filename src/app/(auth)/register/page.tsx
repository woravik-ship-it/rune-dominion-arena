'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, displayName: displayName || undefined }),
      });
      const json = await res.json();
      if (json.success) {
        router.push('/');
        router.refresh();
      } else {
        setError(json.error || 'สมัครสมาชิกไม่สำเร็จ');
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
            สมัครสมาชิก
          </span>
        </h1>

        <form onSubmit={submit} className="space-y-4 bg-gray-800/60 border border-white/10 rounded-2xl p-6">
          <div>
            <label className="text-sm text-gray-300 mb-1 block">ชื่อผู้ใช้ *</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              pattern="[a-zA-Z0-9_]{3,20}"
              title="ภาษาอังกฤษ/ตัวเลข/ขีดล่าง 3-20 ตัวอักษร"
              autoComplete="username"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500"
              placeholder="warrior99"
            />
          </div>
          <div>
            <label className="text-sm text-gray-300 mb-1 block">อีเมล *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-sm text-gray-300 mb-1 block">ชื่อที่แสดง (ไม่บังคับ)</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500"
              placeholder="นักผจญรูน"
            />
          </div>
          <div>
            <label className="text-sm text-gray-300 mb-1 block">รหัสผ่าน * (อย่างน้อย 8 ตัวอักษร)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="text-sm text-gray-300 mb-1 block">ยืนยันรหัสผ่าน *</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? 'กำลังสมัครสมาชิก...' : 'สมัครสมาชิก (รับโบนัส 100 🪙)'}
          </button>

          <p className="text-sm text-center text-gray-400">
            มีบัญชีแล้ว?{' '}
            <Link href="/login" className="text-amber-400 hover:text-amber-300">
              เข้าสู่ระบบ
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
