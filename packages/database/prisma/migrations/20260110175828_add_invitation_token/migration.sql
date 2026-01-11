-- AlterTable
ALTER TABLE "DebateSession" ADD COLUMN     "inviteToken" TEXT,
ADD COLUMN     "inviteTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "DebateSession_inviteToken_key" ON "DebateSession"("inviteToken");

-- CreateIndex
CREATE INDEX "DebateSession_inviteToken_idx" ON "DebateSession"("inviteToken");

