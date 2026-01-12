# Unused Code Report

This report documents unused and unnecessary code found in the codebase.

## ✅ Fixed Issues

### 1. Unused Import: `parseQuery` from `querystring`

**File:** `apps/server/ws/index.ts`
**Status:** ✅ REMOVED

The `parseQuery` import was never used. The code only uses `parseUrl` from the `url` module.

```typescript
// REMOVED:
import { parse as parseQuery } from "querystring";
```

### 2. Unused Import: `ClientMessage` type

**File:** `apps/server/ws/index.ts`
**Status:** ✅ REMOVED

The `ClientMessage` type was imported but never used. Only `ClientMessageSchema` is actually used for validation.

```typescript
// BEFORE:
import { ClientMessage, ServerMessage, ClientMessageSchema } from "@repo/types";

// AFTER:
import { ServerMessage, ClientMessageSchema } from "@repo/types";
```

### 3. Unused Export: `closeWebSocketServer` function

**File:** `apps/server/ws/index.ts`
**Status:** ✅ REMOVED

The `closeWebSocketServer` function was exported but never imported or used anywhere in the codebase. The server shutdown logic in `apps/server/index.ts` directly calls `wsServer.close()` instead.

### 4. Unused Environment Variable: `SERVER_PORT`

**File:** `apps/server/env.ts`
**Status:** ✅ REMOVED

The `SERVER_PORT` environment variable was defined but never used. The codebase uses `HTTP_PORT` instead, making `SERVER_PORT` redundant.

```typescript
// REMOVED:
SERVER_PORT: z
  .string()
  .transform((val: string) => parseInt(val, 10))
  .default("3002"),
```

## ⚠️ Potentially Unused (Review Recommended)

### 5. Default Export: `redis` from `redis.ts`

**File:** `apps/server/services/redis.ts`
**Status:** ⚠️ REVIEW RECOMMENDED

The default export of `redis` is defined but may not be used anywhere. All imports use named exports (`redis`, `redisPub`, `redisSub`). However, this might be intentional for API completeness or future use.

**Recommendation:** Verify if this default export is needed. If not, consider removing it.

```typescript
// Current:
export default redis;

// Usage pattern found:
import { redis } from "./redis"; // Named import, not default
```

### 6. Duplicate Dotenv Loading

**File:** `apps/server/index.ts`
**Status:** ⚠️ REVIEW RECOMMENDED

Both `import "dotenv/config"` and manual `config()` call are present:

```typescript
import "dotenv/config"; // Auto-loads from project root
import { config } from "dotenv";
// ...
config({ path: resolve(__dirname, ".env") }); // Manual load from specific path
```

**Note:** This might be intentional if `.env` files exist in different locations (root vs `apps/server/.env`). The manual config would override values from the automatic one.

**Recommendation:** If only one `.env` file location is used, remove the redundant import/config call.

## 📊 Summary

- **Total unused code items found:** 4
- **Items fixed:** 4
- **Items requiring review:** 2

All critical unused code has been removed. The remaining items (default redis export and dotenv loading) may be intentional and should be reviewed based on the project's requirements.
