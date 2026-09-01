-- Support the public published-review feed's descending keyset pagination and
-- event-scoped rating aggregate without scanning unrelated reviews.
DROP INDEX IF EXISTS "reviews_event_id_status_created_at_idx";

CREATE INDEX "reviews_event_id_status_created_at_id_idx"
ON "reviews"("event_id", "status", "created_at", "id");
