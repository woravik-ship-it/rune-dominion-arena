export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-2xl">
        <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 bg-clip-text text-transparent">
          Rune Dominion Arena
        </h1>
        <p className="text-xl md:text-2xl text-gray-300">
          Fantasy Trading Card Game / Auto Battle / Competitive Arena
        </p>
        <div className="pt-8 flex flex-wrap justify-center gap-3">
          <a href="/discover" className="btn-primary text-lg">
            เริ่มค้นหารูน
          </a>
          <a
            href="/quests"
            className="text-lg px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-gray-200 border border-white/10"
          >
            📜 สมุดภารกิจ
          </a>
        </div>
        <p className="text-sm text-gray-500 pt-4">
          Phase 7 — Quest & Mission System เสร็จสมบูรณ์
        </p>
      </div>
    </main>
  );
}
