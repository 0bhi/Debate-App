# 🎯 Debate App - Monorepo

A real-time debate platform built with Next.js, TypeScript, and WebSockets, organized as a Turborepo monorepo.

## 📁 Project Structure

```
debate-app/
├── docker-compose.yml          # Shared infrastructure (PostgreSQL, Redis, MinIO)
├── apps/
│   ├── web/                    # Next.js frontend application
│   └── server/                 # WebSocket & HTTP API server
└── packages/
    ├── database/               # Shared Prisma schema and client
    ├── types/                  # Shared TypeScript types
    ├── ui/                     # Shared React components
    ├── eslint-config/          # ESLint configurations
    └── typescript-config/      # TypeScript configurations
```

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) (v18 or later)
- [pnpm](https://pnpm.io/) (v9.0.0)

### Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up environment variables:**
   
   Create `apps/web/.env`:
   ```bash
   NEXTAUTH_SECRET=your-random-secret-here
   NEXTAUTH_URL=http://localhost:3000
   DATABASE_URL=postgresql://debate_user:debate_password@localhost:5432/debate_db
   NEXT_PUBLIC_WS_URL=ws://localhost:3001
   NEXT_PUBLIC_SERVER_API_URL=http://localhost:3002
   ```

   Create `apps/server/.env`:
   ```bash
   GEMINI_API_KEY=your-gemini-api-key
   # Gemini API rate limiting (optional, defaults shown)
   GEMINI_RATE_LIMIT_RPM=10          # Requests per minute (default: 10, adjust based on your API tier)
   GEMINI_RATE_LIMIT_WINDOW_SECONDS=60  # Time window in seconds (default: 60)
   DATABASE_URL=postgresql://debate_user:debate_password@localhost:5432/debate_db
   REDIS_URL=redis://localhost:6379
   S3_ACCESS_KEY_ID=minioadmin
   S3_SECRET_ACCESS_KEY=minioadmin123
   S3_REGION=us-east-1
   S3_ENDPOINT=http://localhost:9000
   S3_BUCKET=debate-assets
   WS_PORT=3001
   HTTP_PORT=3002
   ```

3. **Start infrastructure services:**
   ```bash
   # From root directory
   pnpm docker:up
   ```

4. **Set up database:**
   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

5. **Start all applications:**
   ```bash
   # This starts both web and server apps
   pnpm dev
   ```

   Or start individually:
   ```bash
   # Terminal 1: WebSocket & HTTP server
   cd apps/server && pnpm dev

   # Terminal 2: Next.js web app
   cd apps/web && pnpm dev
   ```

## 🐳 Docker Services

All infrastructure services are defined in the root `docker-compose.yml` because they are shared between `web` and `server` applications.

### Available Commands (from root):

```bash
pnpm docker:up       # Start all Docker services
pnpm docker:down     # Stop all Docker services
pnpm docker:logs     # View Docker service logs
pnpm docker:restart  # Restart all Docker services
pnpm docker:ps       # List running Docker services
```

### Services:

- **PostgreSQL** (port 5432) - Database for both apps
- **Redis** (port 6379) - Cache and pub/sub for both apps
- **MinIO** (ports 9000/9001) - S3-compatible storage for both apps

## 📦 Workspace Scripts

### Root Level

```bash
pnpm dev              # Start all apps in development mode
pnpm build            # Build all apps and packages
pnpm lint             # Lint all apps and packages
pnpm check-types      # Type-check all apps and packages
pnpm format           # Format code with Prettier

# Database operations
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run database migrations
pnpm db:studio        # Open Prisma Studio
```

### App-Specific

```bash
# Web app (apps/web)
pnpm --filter web dev

# Server app (apps/server)
pnpm --filter server dev
```

## 🏗️ Architecture

Both `apps/web` and `apps/server` share the same infrastructure:

```
┌─────────────────┐         ┌─────────────────┐
│   apps/web      │         │  apps/server    │
│   (Next.js)     │         │  (WebSocket)    │
└────────┬────────┘         └────────┬────────┘
         │                           │
         └───────────┬───────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    ┌────▼────┐  ┌────▼────┐  ┌──▼─────┐
    │Postgres │  │ Redis   │  │ MinIO  │
    │(Docker) │  │(Docker) │  │(Docker)│
    └─────────┘  └─────────┘  └────────┘
```

## 🔧 Development

### Why is docker-compose.yml at the root?

The `docker-compose.yml` file is at the root because:
- ✅ **Shared Infrastructure**: Both `web` and `server` apps use PostgreSQL, Redis, and MinIO
- ✅ **Single Source of Truth**: One place to manage all development infrastructure
- ✅ **Monorepo Best Practice**: Shared resources belong at the root level
- ✅ **Easier Management**: Start/stop services from root without navigating to subdirectories

### Running Individual Services

If you need to run services separately:

```bash
# Start only Docker services (from root)
pnpm docker:up

# Start only web app
pnpm --filter web dev

# Start only server app
pnpm --filter server dev

# Run database migrations
pnpm db:migrate
```

## 📚 Documentation

- [Web App README](./apps/web/README.md) - Detailed web app documentation
- [Database Package README](./packages/database/README.md) - Database schema and migrations

## 🚀 Production Deployment

For production, replace Docker services with managed cloud services:
- **Database**: AWS RDS, Supabase, Neon, or PlanetScale
- **Cache**: AWS ElastiCache, Upstash Redis
- **Storage**: AWS S3, Cloudflare R2
- **Hosting**: Vercel (web), Railway/Render/Fly.io (server)

## 📝 License

MIT License

---

**Built with ❤️ using Next.js, Turborepo, and modern web technologies**
