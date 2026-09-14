import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

// Admin layout — guard: ป้องกัน user ทั่วไปเข้า /admin (redirect กลับ login)
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) {
    redirect('/login');
  }
  if (session.role !== 'ADMIN' && session.role !== 'MODERATOR') {
    redirect('/');
  }

  const navItems = [
    { href: '/admin', label: '📊 Dashboard' },
    { href: '/admin/cards', label: '🃏 การ์ด' },
    { href: '/admin/quests', label: '📜 เควส' },
    { href: '/admin/users', label: '👥 ผู้เล่น' },
    { href: '/admin/images', label: '🖼️ ภาพ' },
  ];

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-2xl font-bold text-amber-400">⚙️ Admin Tools</h1>
          <div className="text-sm text-gray-400">
            {session.username} <span className="text-amber-400">({session.role})</span>
            <Link href="/" className="ml-3 text-gray-500 hover:text-white">← ออก</Link>
          </div>
        </div>
        <nav className="flex flex-wrap gap-2 mb-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </main>
  );
}
