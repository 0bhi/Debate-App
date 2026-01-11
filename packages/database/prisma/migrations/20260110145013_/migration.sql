/*
  Warnings:

  - A unique constraint covering the columns `[sessionId,orderIndex]` on the table `DebateTurn` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "DebateTurn_sessionId_orderIndex_key" ON "DebateTurn"("sessionId", "orderIndex");
