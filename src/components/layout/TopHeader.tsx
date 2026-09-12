'use client';

import Link from 'next/link';

export default function TopHeader() {
  return (
    <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
          Rune Dominion
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/discover" className="text-sm text-gray-300 hover:text-white transition-colors">
            Discover
          </Link>
          <Link href="/cards" className="text-sm text-gray-300 hover:text-white transition-colors">
            Cards
          </Link>
          <Link href="/decks" className="text-sm text-gray-300 hover:text-white transition-colors">
            Decks
          </Link>
          <Link href="/arena" className="text-sm text-gray-300 hover:text-white transition-colors">
            Arena
          </Link>
        </nav>
      </div>
    </header>
  );
}
