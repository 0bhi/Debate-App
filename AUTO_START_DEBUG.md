# Auto-Start Debugging Guide

## Issue: Debate Not Auto-Starting When Both Users Are Assigned

### Symptoms
- Both `debaterAId` and `debaterBId` are set
- Status is `CREATED`
- Message shows "The debate will begin shortly..."
- Debate doesn't start automatically

### Auto-Start Triggers

The debate should auto-start in these scenarios:

1. **When User B accepts invitation via API** (`acceptInvitation`)
   - Location: `apps/server/orchestrator/debateOrchestrator.ts:779-820`
   - After assigning debater B, checks if both debaters are assigned
   - Calls `startDebate` if status is CREATED

2. **When a user connects via WebSocket** (`handleConnection`)
   - Location: `apps/server/ws/index.ts:150-168`
   - After assignment (or if already assigned), checks if both debaters are assigned
   - Calls `startDebate` if status is CREATED

3. **When a user sends JOIN_SESSION message** (`handleJoinSession`)
   - Location: `apps/server/ws/index.ts:279-299`
   - After assignment, checks if both debaters are assigned
   - Calls `startDebate` if status is CREATED

### Debugging Steps

1. **Check server logs for these messages:**
   - "Both debaters assigned, auto-starting debate" (handleConnection)
   - "Both debaters assigned after invitation acceptance, auto-starting debate" (acceptInvitation)
   - "Starting debate" (startDebate)
   - "Debate already starting, skipping duplicate call" (if locked)
   - "Cannot start debate from status" (if status changed)
   - "Failed to auto-start debate" (if error occurred)

2. **Check if `startDebate` is being called:**
   - Look for "Starting debate" log message
   - If not found, auto-start check isn't triggering

3. **Check if `startDebate` is failing:**
   - Look for "Failed to auto-start debate" or "Debate flow failed after starting"
   - Check for errors in `initiateNextTurn`

4. **Verify database state:**
   ```sql
   SELECT id, status, "debaterAId", "debaterBId" FROM "DebateSession" WHERE id = 'SESSION_ID';
   ```
   - Both `debaterAId` and `debaterBId` should be set
   - Status should be `CREATED` (or `RUNNING` if it already started)

### Common Issues

1. **Silent Failure in `acceptInvitation`:**
   - If `startDebate` fails in `acceptInvitation`, it's caught and logged but doesn't throw
   - Check logs for "Failed to auto-start debate after invitation acceptance"

2. **Lock Mechanism:**
   - If debate is already starting, duplicate calls are skipped
   - Check for "Debate already starting, skipping duplicate call"

3. **Status Changed Between Checks:**
   - Status might change between the check and the actual start
   - `startDebate` uses atomic `updateMany` to prevent this

4. **User Not Connected via WebSocket:**
   - Auto-start in `handleConnection` only triggers when user connects
   - If User B accepts invitation via API but never connects via WebSocket, auto-start should still happen in `acceptInvitation`

### Next Steps

If the debate still doesn't start after checking logs, verify:
1. Both users are actually assigned in the database
2. Status is actually CREATED (not RUNNING or FINISHED)
3. No errors in the server logs
4. WebSocket connections are established
5. `initiateNextTurn` is being called (check for "Turn initiated" log)

