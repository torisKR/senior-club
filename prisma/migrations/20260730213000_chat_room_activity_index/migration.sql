-- Supports stable activity-first pagination for a member's chat room list.
CREATE INDEX "chat_rooms_updated_at_id_idx" ON "chat_rooms"("updated_at", "id");
