# @repo/database

Shared database package for the debate platform. Contains Prisma schema, migrations, and shared Prisma client.

## Overview

This package is the single source of truth for database schema and migrations. All apps in the monorepo that need database access should import from this package.

## Structure

```
packages/database/
├── prisma/
│   ├── schema.prisma       # Prisma schema (all models)
│   └── migrations/         # Database migrations
├── src/
│   ├── client.ts           # Shared Prisma client singleton
│   └── index.ts            # Exports (client, types, models)
└── package.json
```

## Usage

### Import Prisma Client

```typescript
import { prisma } from "@repo/database";

// Use prisma client
const users = await prisma.user.findMany();
```

### Import Types

```typescript
import type { User, DebateSession, DebateStatus } from "@repo/database";

// Use types
const user: User = { ... };
```

## Scripts

All database operations should be run from this package:

```bash
# Generate Prisma Client
pnpm --filter @repo/database db:generate

# Run migrations
pnpm --filter @repo/database db:migrate

# Push schema to database (dev only)
pnpm --filter @repo/database db:push

# Open Prisma Studio
pnpm --filter @repo/database db:studio

# Reset database (careful!)
pnpm --filter @repo/database db:reset
```

## Environment Variables

This package requires `DATABASE_URL` environment variable. Prisma looks for `.env` files starting from the schema location (`packages/database/prisma/`) and walking up the directory tree.

**Create a `.env` file in one of these locations:**

### Option 1: Root `.env` (Recommended - shared across monorepo)
Create `/.env` at the root:
```env
DATABASE_URL=postgresql://debate_user:debate_password@localhost:5432/debate_db
```

### Option 2: Database package `.env` 
Create `packages/database/.env`:
```env
DATABASE_URL=postgresql://debate_user:debate_password@localhost:5432/debate_db
```

**Note:** Prisma will automatically find the `.env` file when running migrations. The root `.env` approach is recommended as it's shared across all apps.

## Models

- **User** - User accounts (NextAuth)
- **Account** - OAuth account connections (NextAuth)
- **Session** - User sessions (NextAuth)
- **VerificationToken** - Email verification tokens (NextAuth)
- **DebateSession** - Debate sessions with two debaters
- **DebateTurn** - Individual debate turns/arguments
- **RateLimit** - Rate limiting tracking

## Best Practices

1. **Always run migrations from this package** - Never run `prisma migrate` from apps
2. **Generate client before building apps** - Turbo pipeline handles this automatically
3. **Import from `@repo/database`** - Never import directly from `@prisma/client`
4. **Use the shared client** - Import `prisma` from `@repo/database`, don't create new instances

