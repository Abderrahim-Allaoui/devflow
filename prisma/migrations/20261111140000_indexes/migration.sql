-- Composite indexes for hot ordering/pagination queries + sweep support.
CREATE INDEX "login_attempts_windowStart_idx" ON "login_attempts"("windowStart");
CREATE INDEX "boards_ownerId_createdAt_id_idx" ON "boards"("ownerId", "createdAt", "id");
CREATE INDEX "tasks_columnId_position_idx" ON "tasks"("columnId", "position");
