-- Support the bounded admin report feed without sorting the full reports table.
CREATE INDEX "reports_created_at_id_idx"
ON "reports"("created_at", "id");
