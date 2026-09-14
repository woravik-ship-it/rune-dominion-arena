'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/discover', label: 'Discover', icon: '🔮' },
  { href: '/cards', label: 'Cards', icon: '🃏' },
  { href: '/decks', label: 'Decks', icon: '📋' },
  { href: '/arena', label: 'Arena', icon: '⚔️' },
  { href: '/wallet', label: 'Wallet', icon: '💰' },
  { href: '/quests', label: 'Quests', icon: '📜' },
  { href: '/profile', label: 'Profile', icon: '👤' },
  { href: '/admin', label: 'Admin', icon: '⚙️', adminOnly: true },
];

export default function BottomNavigation() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const role = d?.data?.user?.role;
        setIsAdmin(role === 'ADMIN' || role === 'MODERATOR');
      })
      .catch(() => undefined);
  }, [pathname]);

  const items = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-t border-white/10 md:hidden">
      <div className="flex items-center h-16 overflow-x-auto scrollbar-hide px-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 shrink-0 px-2.5 py-1 rounded-lg transition-colors ${
              pathname === item.href
                ? 'text-amber-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-[10px] leading-none">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
