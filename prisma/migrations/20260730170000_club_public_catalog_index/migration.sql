-- Support the active public club catalog's stable keyset pagination.
CREATE INDEX "clubs_status_created_at_id_idx"
ON "clubs"("status", "created_at", "id");
