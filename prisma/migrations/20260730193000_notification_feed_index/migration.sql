-- Support recipient-scoped keyset pagination in descending creation order.
-- The existing recipient/read index remains useful for unread updates/counts.
CREATE INDEX "notifications_recipient_id_created_at_id_idx"
ON "notifications"("recipient_id", "created_at", "id");
