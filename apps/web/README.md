# 🎯 AI Debate Club

Watch AI personas debate in real-time with streaming text, TTS audio, animated avatars, and live judging.

## ✨ Features

- **Real-time AI debates** with streaming text responses
- **Text-to-Speech** audio generation and playback
- **Animated avatars** with speaking indicators
- **AI or manual judging** with detailed scoring
- **Preset personas** (Steve Jobs, Elon Musk, Warren Buffett, Oprah) or custom ones
- **Beautiful UI** with animations and dark mode support
- **WebSocket communication** for real-time updates

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) (v18 or later)
- [Yarn](https://yarnpkg.com/) package manager
- [OpenAI API Key](https://platform.openai.com/api-keys)

### Setup & Run

1. **Clone and setup environment**:

   ```bash
   git clone <your-repo-url>
   cd debate-app
   cp apps/web/.env.example apps/web/.env
   ```

2. **Add your OpenAI API key** to `apps/web/.env`:

   ```bash
   OPENAI_API_KEY=sk-your-openai-api-key-here
   ```

3. **Start everything**:
   ```bash
   yarn dx
   ```

That's it! This single command will:

- Start Docker services (PostgreSQL, Redis, MinIO)
- Install dependencies
- Setup the database
- Start all servers and workers

### Access the Application

- **Web App**: http://localhost:3000
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin123)

## 🛠️ What `yarn dx` does

The `dx` command handles everything automatically:

1. 🐳 Starts **PostgreSQL** database on port 5432
2. 🔄 Starts **Redis** server on port 6379
3. 📦 Starts **MinIO** storage on ports 9000/9001
4. 🗄️ Sets up database schema with Prisma
5. 📡 Starts **WebSocket** server
6. 🎵 Starts **TTS worker** for audio generation
7. 🌐 Starts **Next.js** app on port 3000

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
- **Cache/PubSub**: Redis with BullMQ for job queues
- **Storage**: MinIO (S3-compatible) for audio files
- **AI**: OpenAI GPT-4o for debates, OpenAI TTS for audio
- **Auth**: NextAuth.js with Google/GitHub OAuth

## 🔧 Individual Commands

If you need to run things separately:

```bash
# In apps/web directory
cd apps/web

# Start Docker services only
docker-compose up -d

# Stop Docker services
docker-compose down

# Install dependencies
npm install

# Database operations
npx prisma generate
npx prisma migrate dev

# Start development server only
npm run dev

# Start all services together
npm run dev:all
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
# Stop all services
cd apps/web && docker-compose down -v

# Remove containers and volumes
docker system prune -f

# Start fresh
cd ../../ && yarn dx
```

## 🚀 Production Deployment

For production, replace the Docker services with managed ones:

1. **Database**: AWS RDS, Supabase, or PlanetScale
2. **Cache**: AWS ElastiCache, Upstash Redis
3. **Storage**: AWS S3, Cloudflare R2
4. **Hosting**: Vercel, Railway, or Fly.io

## 📝 License

MIT License - see LICENSE file for details.

---

**Built with ❤️ using Next.js, OpenAI, and modern web technologies**
