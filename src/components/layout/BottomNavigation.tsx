'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/discover', label: 'Discover', icon: '🔮' },
  { href: '/cards', label: 'Cards', icon: '🃏' },
  { href: '/decks', label: 'Decks', icon: '📋' },
  { href: '/arena', label: 'Arena', icon: '⚔️' },
  { href: '/wallet', label: 'Wallet', icon: '💰' },
  { href: '/quests', label: 'Quests', icon: '📜' },
  { href: '/profile', label: 'Profile', icon: '👤' },
];

export default function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-t border-white/10 md:hidden">
      <div className="flex justify-around items-center h-16">
        {navItems.slice(0, 5).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 px-2 py-1 rounded-lg transition-colors ${
              pathname === item.href
                ? 'text-amber-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-xs">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
