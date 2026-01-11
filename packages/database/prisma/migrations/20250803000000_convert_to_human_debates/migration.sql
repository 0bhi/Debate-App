-- Migration: Convert from AI personas to human debaters
-- This migration:
-- 1. Removes personaA and personaB JSONB columns
-- 2. Adds debaterAId and debaterBId foreign keys to User
-- 3. Removes prompt, audioUrl, tokensIn, tokensOut, durationMs from DebateTurn
-- 4. Adds indexes for debaterAId and debaterBId

-- Step 1: Drop old persona columns from DebateSession
ALTER TABLE "DebateSession" DROP COLUMN IF EXISTS "personaA";
ALTER TABLE "DebateSession" DROP COLUMN IF EXISTS "personaB";

-- Step 2: Add new debater columns to DebateSession
ALTER TABLE "DebateSession" ADD COLUMN IF NOT EXISTS "debaterAId" TEXT;
ALTER TABLE "DebateSession" ADD COLUMN IF NOT EXISTS "debaterBId" TEXT;

-- Step 3: Add foreign key constraints for debaters
-- Note: We use ON DELETE SET NULL to handle cases where users are deleted
ALTER TABLE "DebateSession" 
  ADD CONSTRAINT "DebateSession_debaterAId_fkey" 
  FOREIGN KEY ("debaterAId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DebateSession" 
  ADD CONSTRAINT "DebateSession_debaterBId_fkey" 
  FOREIGN KEY ("debaterBId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 4: Add indexes for debater columns
CREATE INDEX IF NOT EXISTS "DebateSession_debaterAId_idx" ON "DebateSession"("debaterAId");
CREATE INDEX IF NOT EXISTS "DebateSession_debaterBId_idx" ON "DebateSession"("debaterBId");

-- Step 5: Update foreign key constraint name for userId (creator relation)
-- Drop the old constraint if it exists
ALTER TABLE "DebateSession" 
  DROP CONSTRAINT IF EXISTS "DebateSession_userId_fkey";

-- Re-add with the same settings (it's the creator, not debater)
ALTER TABLE "DebateSession" 
  ADD CONSTRAINT "DebateSession_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 6: Remove unused columns from DebateTurn
ALTER TABLE "DebateTurn" DROP COLUMN IF EXISTS "prompt";
ALTER TABLE "DebateTurn" DROP COLUMN IF EXISTS "audioUrl";
ALTER TABLE "DebateTurn" DROP COLUMN IF EXISTS "tokensIn";
ALTER TABLE "DebateTurn" DROP COLUMN IF EXISTS "tokensOut";
ALTER TABLE "DebateTurn" DROP COLUMN IF EXISTS "durationMs";

