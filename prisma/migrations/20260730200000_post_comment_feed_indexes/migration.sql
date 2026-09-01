DROP INDEX IF EXISTS "posts_club_id_status_created_at_idx";
DROP INDEX IF EXISTS "comments_post_id_status_created_at_idx";

CREATE INDEX "posts_club_id_status_created_at_id_idx"
ON "posts"("club_id", "status", "created_at", "id");

CREATE INDEX "comments_post_id_status_created_at_id_idx"
ON "comments"("post_id", "status", "created_at", "id");
