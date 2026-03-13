# Welcome Bingo System 🎱

A real-time single-room bingo web app for ~60 participants at a company welcome party.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 + TypeScript |
| Backend | Node.js + Express + Socket.IO |
| Database | PostgreSQL + Prisma ORM |

## Project Structure

```
welcome-bingo-system/
├── server/                # Node.js + Socket.IO backend
│   ├── src/
│   │   ├── index.ts       # Entry point (Express + Socket.IO server)
│   │   ├── models/        # Domain type definitions
│   │   ├── services/      # gameService – single source of truth
│   │   ├── socket/        # Socket.IO event handlers
│   │   ├── routes/        # REST API routes
│   │   └── lib/           # Prisma client, bingo card utils
│   ├── prisma/
│   │   └── schema.prisma  # DB schema
│   └── Dockerfile
├── client/                # Next.js frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx          # Participant mobile screen (/)
│   │   │   ├── admin/page.tsx    # Admin control screen (/admin)
│   │   │   └── projector/page.tsx # Public projector screen (/projector)
│   │   ├── components/
│   │   │   ├── bingo/BingoCard.tsx
│   │   │   └── game/VotePanel.tsx
│   │   ├── lib/socket.ts  # Socket.IO client singleton
│   │   └── types/game.ts  # Shared type definitions
│   └── Dockerfile
├── docker-compose.yml
└── package.json           # Monorepo scripts
```

## Screens

| URL | Purpose |
|-----|---------|
| `/` | **Participant** – mobile bingo card + A/B voting |
| `/admin` | **Admin** – start game/rounds, close voting, see results |
| `/projector` | **Projector** – full-screen public display for the room |

## Game Flow

1. **Admin** opens `/admin`, enters the secret, and clicks **Start Game**.
2. Admin enters a question + two A/B options, then clicks **Draw Number & Start Round**.
3. The server draws a random unused number (1–75) and opens voting.
4. **Participants** open `/` on their phones, enter their name once, and vote A or B.
5. Admin clicks **Close Voting & Reveal Results** when ready.
6. Server determines the majority vote:
   - Participants who voted for the majority **and** have the drawn number on their card open that cell.
   - If it's a tie, nobody opens a cell.
7. Bingo is checked after each round. Winners are announced to everyone.
8. Repeat from step 2.

### Bingo Card Rules

- Standard 5×5 card (B1–15, I16–30, N31–45, G46–60, O61–75).
- The center cell is pre-opened (FREE) for all new participants.
- Winning patterns: any row, any column, or either diagonal.

## Quick Start

### Prerequisites

- Node.js ≥ 20
- PostgreSQL running locally (or use Docker Compose)

### 1. Clone & install

```bash
git clone <repo>
cd welcome-bingo-system
cd server && npm install
cd ../client && npm install
```

### 2. Set up environment

```bash
# Server
cp server/.env.example server/.env
# Edit DATABASE_URL, ADMIN_SECRET as needed

# Client
cp client/.env.local.example client/.env.local
# NEXT_PUBLIC_SERVER_URL=http://localhost:4000
```

### 3. Set up database

```bash
cd server
npx prisma migrate dev --name init
# or for a quick push:
npx prisma db push
```

### 4. Start development servers

```bash
# Terminal 1 – backend
cd server && npm run dev

# Terminal 2 – frontend
cd client && npm run dev
```

### Docker Compose (recommended)

```bash
ADMIN_SECRET=my-secret docker-compose up --build
```

Then open:
- Participant: http://localhost:3000
- Admin:       http://localhost:3000/admin
- Projector:   http://localhost:3000/projector

## REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/game/state` | Current public game state |
| GET | `/api/game/rounds` | Completed rounds history |
| GET | `/api/game/participants` | Participant list (name, hasBingo, online) |
| GET | `/api/participants/:sessionId/card` | A participant's bingo card |

## Socket.IO Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `participant:join` | `{ name, sessionId }` | Join with name + browser session token |
| `participant:reconnect` | `{ sessionId }` | Restore session after reconnect |
| `public:subscribe` | — | Subscribe to public game state (admin/projector) |
| `vote:submit` | `{ choice: 'A'\|'B' }` | Cast a vote in the current round |
| `admin:start-game` | `{ secret }` | Start the game |
| `admin:start-round` | `{ secret, question, optionA, optionB }` | Draw a number and start a round |
| `admin:close-voting` | `{ secret }` | Close voting and compute results |
| `admin:reset-game` | `{ secret }` | Reset everything |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `game:state` | `PublicGameState` | Broadcast game state to all |
| `participant:state` | `ParticipantState` | Personal state sent to a single participant |
| `round:started` | Round info | New round announced |
| `round:completed` | Round result | Round result with majority + cell openers |
| `bingo:winner` | `{ winners, message }` | Bingo winner announcement |
| `game:reset` | `{ message }` | Game was reset |

## Prisma Schema

Key models: `Participant`, `BingoCard`, `Game`, `Round`, `Vote`.

History is persisted to PostgreSQL; runtime state lives in memory in `gameService.ts`.

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `PORT` | `4000` | Server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `CLIENT_URL` | `http://localhost:3000` | Allowed CORS origin |
| `ADMIN_SECRET` | `bingo-admin-secret` | Password for admin actions |
| `NEXT_PUBLIC_SERVER_URL` | `http://localhost:4000` | Socket.IO server URL for the browser |

