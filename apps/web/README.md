# 🎯 Debate Platform

A platform where two people can debate on a topic and be evaluated by an AI judge.

## ✨ Features

- **Real-time human debates** - Two users debate on a topic
- **Turn-based system** - Each debater takes turns presenting arguments
- **AI judging** - Automatic evaluation with detailed scoring and feedback
- **Beautiful UI** with animations and dark mode support
- **WebSocket communication** for real-time updates
- **User authentication** - Sign in to create and join debates

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) (v18 or later)
- [pnpm](https://pnpm.io/) package manager
- [OpenAI API Key](https://platform.openai.com/api-keys)

### Setup & Run

1. **Clone and setup environment**:

   ```bash
   git clone <your-repo-url>
   cd debate-app
   # Create .env files for both apps (see environment variables section below)
   ```

2. **Configure environment variables**:

   Vercel (apps/web):
   - NEXTAUTH_SECRET=your-random-secret
   - NEXTAUTH_URL=https://your-vercel-domain.vercel.app
   - NEXT_PUBLIC_SERVER_API_URL=https://your-server-base-url (e.g. AWS EC2)
   - NEXT_PUBLIC_WS_URL=wss://your-ws-host:port

   Server (apps/server):
   - DATABASE_URL=...
   - REDIS_URL=...
   - S3_ACCESS_KEY_ID=...
   - S3_SECRET_ACCESS_KEY=...
   - S3_REGION=...
   - S3_ENDPOINT=...
   - S3_BUCKET=...
   - GEMINI_API_KEY=...
   - WS_PORT=3001
   - HTTP_PORT=3002

3. **Start everything**:
   ```bash
   # From root directory
   pnpm install              # Install dependencies
   pnpm docker:up           # Start Docker services (PostgreSQL, Redis, MinIO)
   pnpm db:generate         # Generate Prisma client
   pnpm db:migrate          # Run database migrations
   pnpm dev                 # Start web and server apps
   ```

Or use individual commands as needed (see Individual Commands section below).

### Access the Application

- **Web App**: http://localhost:3000
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin123)

## 🛠️ Development Workflow

The typical development workflow:

1. 🐳 Start **PostgreSQL** database on port 5432 (via `pnpm docker:up`)
2. 🔄 Start **Redis** server on port 6379 (via `pnpm docker:up`)
3. 📦 Start **MinIO** storage on ports 9000/9001 (via `pnpm docker:up`)
4. 🗄️ Setup database schema with Prisma (`pnpm db:generate && pnpm db:migrate`)
5. 📡 Start **WebSocket** server (`cd apps/server && pnpm dev`)
6. 🌐 Start **Next.js** app on port 3000 (`cd apps/web && pnpm dev`)

**Note**: `docker-compose.yml` is at the root because both `web` and `server` apps share the same infrastructure (PostgreSQL, Redis, MinIO).

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Next.js App   │◄───┤   WebSocket      │◄───┤   Background    │
│   (Frontend)    │    │   Server         │    │   Workers       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │     Redis        │    │     MinIO       │
│   (Database)    │    │   (Pub/Sub)      │    │   (Storage)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Tech Stack

- **Frontend**: Next.js 14, React 18, TailwindCSS, Zustand
- **Backend**: Next.js API Routes, TypeScript, WebSocket
- **Database**: PostgreSQL with Prisma ORM
- **Cache/PubSub**: Redis for real-time communication
- **AI**: AI-powered judging system for evaluation
- **Auth**: NextAuth.js with Google/GitHub OAuth

## 🔧 Individual Commands

If you need to run things separately:

```bash
# From root directory - Start Docker services (shared infrastructure)
pnpm docker:up

# From root directory - Stop Docker services
pnpm docker:down

# From root directory - Database operations
pnpm db:generate
pnpm db:migrate
pnpm db:studio

# Or from apps/web directory
cd apps/web
pnpm db:generate    # Shortcut to root command
pnpm db:migrate     # Shortcut to root command

# Start Next.js development server only (from apps/web)
cd apps/web
pnpm dev

# Start server app separately (from root)
cd apps/server
pnpm dev
```

## 🔒 Environment Variables

| Variable          | Description                    | Required | Default        |
| ----------------- | ------------------------------ | -------- | -------------- |
| `OPENAI_API_KEY`  | OpenAI API key for LLM and TTS | ✅       | -              |
| `DATABASE_URL`    | PostgreSQL connection string   | ✅       | Docker default |
| `REDIS_URL`       | Redis connection string        | ✅       | Docker default |
| `NEXTAUTH_SECRET` | NextAuth.js secret key         | ✅       | -              |
| `S3_*`            | Storage configuration          | ✅       | MinIO defaults |

## 🐛 Troubleshooting

### Common Issues

1. **"Database connection failed"**: Make sure Docker is running
2. **"Port already in use"**: Stop other services on ports 3000, 5432, 6379, 9000
3. **"OpenAI API error"**: Check your API key in `.env`

### Reset Everything

```bash
# From root directory - Stop and remove all Docker services
pnpm docker:down -v

# Remove containers and volumes (optional)
docker system prune -f

# Start fresh
pnpm docker:up
pnpm db:migrate
```

## 🚀 Production Deployment

For production, replace the Docker services with managed ones:

1. **Database**: AWS RDS, Supabase, or PlanetScale
2. **Cache**: AWS ElastiCache, Upstash Redis
3. **Storage**: AWS S3, Cloudflare R2
4. **Hosting**: Vercel (web), AWS EC2 (server)

## 📝 License

MIT License - see LICENSE file for details.

---

**Built with ❤️ using Next.js, OpenAI, and modern web technologies**
