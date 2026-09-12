# Rune Dominion Arena

Fantasy Trading Card Game / Auto Battle / Competitive Arena

## Getting Started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL (or use Docker)
- Redis (or use Docker)

### Installation

1. Clone the repository
```bash
git clone <repo-url>
cd rune-dominion-arena
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your values
```

4. Start databases
```bash
docker compose up -d
```

5. Run database migrations
```bash
npm run db:generate
npm run db:push
```

6. (Optional) Seed initial data
```bash
npm run db:seed
```

7. Start development server
```bash
npm run dev
```

8. Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript (strict mode)
- **Database:** PostgreSQL + Prisma ORM
- **Cache:** Redis
- **Styling:** Tailwind CSS
- **UI Components:** Radix UI / shadcn/ui
- **State Management:** Zustand + TanStack Query
- **Auth:** NextAuth.js
- **Testing:** Jest + Playwright

## Project Structure

```
src/
├── app/              # Next.js App Router
│   ├── (auth)/       # Auth routes (login, register)
│   ├── (game)/       # Game routes
│   └── api/          # API routes
├── components/       # React components
│   ├── ui/           # Base UI components
│   ├── layout/       # Layout components
│   ├── cards/        # Card components
│   ├── rune/         # Rune grid components
│   ├── battle/       # Battle components
│   └── arena/        # Arena components
├── lib/              # Utilities & configs
├── services/         # Business logic
├── hooks/            # Custom React hooks
├── stores/           # Zustand stores
├── types/            # TypeScript types
└── utils/            # Helper functions
```

## Development Rules

1. **TypeScript strict mode** — No `any` types
2. **Integer Currency** — Never use Float for currency
3. **Server-side calculations** — Combat, Discovery, Reward
4. **Deterministic** — No `Math.random()` in critical systems
5. **Mobile-first** — Design for mobile first
6. **Thai language** — All UI text in Thai

## Game Phases

| Phase | Feature | Status |
|-------|---------|--------|
| 0 | Project Setup | ✅ Complete |
| 1 | Rune Discovery & Seed | 🔜 In Progress |
| 2 | Card Collection | ⏳ Planned |
| 3 | Deck Builder | ⏳ Planned |
| 4 | Auto Battle | ⏳ Planned |
| 5 | Coin Ledger | ⏳ Planned |
| 6 | Arena | ⏳ Planned |
| 7 | Quests | ⏳ Planned |
| 8 | AI Images | ⏳ Planned |
| 9 | Admin Tools | ⏳ Planned |
| 10 | Security & Anti-Cheat | ⏳ Planned |
| 11 | Seasonal Events | ⏳ Planned |
| 12 | Polish & Launch | ⏳ Planned |

## License

All rights reserved.
