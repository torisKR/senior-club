-- Support the worker's stale PROCESSING lease scan without walking the
-- growing ready/processed outbox history.
CREATE INDEX "outbox_events_status_locked_at_idx"
ON "outbox_events"("status", "locked_at");
