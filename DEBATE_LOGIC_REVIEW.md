# Debate Logic Code Review - Critical Issues Found

## 🚨 CRITICAL ISSUES

### 1. **Missing Database Unique Constraint**
**Location:** `packages/database/prisma/schema.prisma` (line 121)

**Problem:** No unique constraint on `(sessionId, orderIndex)`, allowing duplicate turns with the same orderIndex for a session.

**Impact:** Race conditions could create duplicate turns. If two users submit simultaneously or server restarts, duplicate submissions are possible.

**Fix Required:**
```prisma
model DebateTurn {
  // ... existing fields ...
  
  @@unique([sessionId, orderIndex])  // ADD THIS
  @@index([sessionId])
  @@index([sessionId, orderIndex])
}
```

---

### 2. **No Validation Before Creating Turn**
**Location:** `apps/server/orchestrator/debateOrchestrator.ts` (line 378)

**Problem:** `submitArgument()` doesn't check if a turn with the same `orderIndex` already exists in the database before creating it.

**Impact:** Even with a unique constraint, the code doesn't handle the race condition gracefully. Should check existence first and handle the error properly.

**Fix Required:**
```typescript
// Before creating, check if turn already exists
const existingTurn = await prisma.debateTurn.findUnique({
  where: {
    sessionId_orderIndex: {
      sessionId,
      orderIndex: pendingTurn.orderIndex,
    },
  },
});

if (existingTurn) {
  throw new Error("Turn already submitted for this order");
}
```

---

### 3. **assignDebater Allows Overwriting Existing Debater**
**Location:** `apps/server/orchestrator/debateOrchestrator.ts` (line 408-426)

**Problem:** The `assignDebater()` method has no validation to prevent overwriting an already-assigned debater with a different user.

**Impact:** If debaterA is already assigned and someone tries to assign a different user as debaterA, it will overwrite without warning.

**Fix Required:**
```typescript
async assignDebater(sessionId: string, position: "A" | "B", userId: string): Promise<void> {
  // First, check current state
  const session = await prisma.debateSession.findUnique({
    where: { id: sessionId },
    select: { debaterAId: true, debaterBId: true, status: true },
  });

  if (!session) {
    throw new Error("Session not found");
  }

  // Validate position is not already assigned to someone else
  const currentDebaterId = position === "A" ? session.debaterAId : session.debaterBId;
  if (currentDebaterId && currentDebaterId !== userId) {
    throw new Error(`Position ${position} is already assigned to another user`);
  }

  // If already assigned to this user, return early
  if (currentDebaterId === userId) {
    logger.info("User already assigned to this position", { sessionId, position, userId });
    return;
  }

  // Prevent reassignment if debate has started
  if (session.status !== "CREATED") {
    throw new Error(`Cannot reassign debater when debate is ${session.status}`);
  }

  // ... rest of assignment logic ...
}
```

---

### 4. **Missing Turn Order Validation**
**Location:** `apps/server/orchestrator/debateOrchestrator.ts` (line 357-360)

**Problem:** `submitArgument()` doesn't verify that the `orderIndex` in the pending turn matches the expected next turn order based on existing database turns.

**Impact:** If the in-memory `pendingTurns` map gets out of sync with the database (e.g., after server restart), incorrect turn orders could be accepted.

**Fix Required:**
```typescript
// Verify orderIndex matches expected next turn
const expectedOrderIndex = state.turns.length;
if (pendingTurn.orderIndex !== expectedOrderIndex) {
  // Clean up stale pending turn
  this.pendingTurns.delete(sessionId);
  throw new Error(`Invalid turn order. Expected ${expectedOrderIndex}, got ${pendingTurn.orderIndex}`);
}
```

---

### 5. **In-Memory State Lost on Server Restart**
**Location:** `apps/server/orchestrator/debateOrchestrator.ts` (line 10)

**Problem:** `pendingTurns` Map is in-memory only. If server restarts, all pending turn states are lost, causing debates to get stuck.

**Impact:** Debates in RUNNING status with pending turns become unrecoverable after restart. Users can't submit their arguments.

**Fix Required:**
```typescript
// On server start or when loading session, check if debate needs recovery
async initiateNextTurn(sessionId: string): Promise<void> {
  // ... existing code ...
  
  // Check if there's already a turn at this orderIndex (recovery from restart)
  const existingTurn = await prisma.debateTurn.findFirst({
    where: { sessionId, orderIndex },
  });
  
  if (existingTurn) {
    // Turn already exists, skip to next
    logger.info("Turn already exists, skipping to next", { sessionId, orderIndex });
    await this.initiateNextTurn(sessionId);
    return;
  }
  
  // ... rest of logic ...
}
```

Also add a recovery method:
```typescript
async recoverPendingTurns(): Promise<void> {
  // Find all RUNNING debates
  const runningDebates = await prisma.debateSession.findMany({
    where: { status: "RUNNING" },
    include: { turns: { orderBy: { orderIndex: "asc" } } },
  });

  for (const debate of runningDebates) {
    const currentTurnCount = debate.turns.length;
    const totalTurns = debate.rounds * 2;
    
    if (currentTurnCount < totalTurns) {
      // Re-establish pending turn
      const expectedOrderIndex = currentTurnCount;
      const currentSpeaker: "A" | "B" = expectedOrderIndex % 2 === 0 ? "A" : "B";
      this.pendingTurns.set(debate.id, { orderIndex: expectedOrderIndex, speaker: currentSpeaker });
      
      // Broadcast YOUR_TURN to appropriate debater
      await this.broadcastToSession(debate.id, {
        type: "YOUR_TURN",
        speaker: currentSpeaker,
        orderIndex: expectedOrderIndex,
      });
    }
  }
}
```

---

## ⚠️ MEDIUM PRIORITY ISSUES

### 6. **Client Not Properly Added Before Assignment Check**
**Location:** `apps/server/ws/index.ts` (line 137)

**Problem:** Client is added to session group AFTER assignment check and state loading. If an error occurs, client might not be properly registered.

**Impact:** Minor - mainly affects error handling and logging accuracy.

**Fix:** Move client addition earlier or ensure it's in a finally block.

---

### 7. **Undefined State Variable in Error Handler**
**Location:** `apps/server/orchestrator/debateOrchestrator.ts` (line 734-739)

**Problem:** In `autoJudgeDebate()` catch block, references `state.topic`, `state.turns.length`, etc., but `state` might be undefined if error occurs before `state` is loaded.

**Impact:** Could cause crashes if error occurs early in the function.

**Fix:**
```typescript
} catch (error) {
  logger.error("Auto-judging failed", {
    sessionId,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    topic: state?.topic,
    transcriptLength: transcript?.length,
    turnCount: state?.turns.length,
    totalRounds: state?.rounds,
    autoJudge: state?.autoJudge,
  });
  throw error;
}
```

---

### 8. **Incorrect Client Count Logging**
**Location:** `apps/server/ws/index.ts` (line 110)

**Problem:** Client count is logged BEFORE the client is added to the session group, so it shows incorrect count.

**Fix:** Log after adding client, or log both before and after.

---

### 9. **Missing Validation for Stuck Debates**
**Problem:** If a debate is RUNNING but no pending turn exists in memory and all turns are not complete, the debate could be stuck indefinitely.

**Impact:** Debates can get stuck if server restarts or if `initiateNextTurn()` fails silently.

**Fix:** Add recovery logic in `loadSessionState()` to detect and fix stuck debates:
```typescript
// In loadSessionState, after checking auto-transition
if (session.status === "RUNNING" && !allRoundsComplete) {
  const expectedOrderIndex = session.turns.length;
  // If no pending turn but should have one, recreate it
  if (!this.pendingTurns.has(sessionId)) {
    const currentSpeaker: "A" | "B" = expectedOrderIndex % 2 === 0 ? "A" : "B";
    this.pendingTurns.set(sessionId, { orderIndex: expectedOrderIndex, speaker: currentSpeaker });
  }
}
```

---

### 10. **Race Condition in Auto-Start**
**Location:** `apps/server/ws/index.ts` (line 146-161)

**Problem:** When both debaters connect simultaneously, `startDebate()` could be called multiple times, though the status check helps mitigate this.

**Impact:** Low - status check prevents duplicate starts, but could still cause issues.

**Fix:** Add a lock or check if debate is already starting:
```typescript
// Check if debate is already starting
const currentState = await debateOrchestrator.loadSessionState(sessionId);
if (currentState?.status !== "CREATED") {
  return; // Already started or in progress
}
```

---

## ✅ SUMMARY

**Critical Issues:** 5 (must fix immediately)
- Missing unique constraint (database schema)
- No validation before creating turns
- assignDebater allows overwriting
- Missing turn order validation
- In-memory state lost on restart

**Medium Issues:** 5 (should fix soon)
- Client registration timing
- Undefined state in error handler
- Incorrect logging
- Missing stuck debate recovery
- Race condition in auto-start

**Recommendation:** Fix all critical issues before production deployment. The most critical are #1, #3, and #5 as they can cause data corruption and stuck debates.

