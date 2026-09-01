-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MEMBER', 'LEADER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'KAKAO', 'NAVER', 'GOOGLE');

-- CreateEnum
CREATE TYPE "SessionClientType" AS ENUM ('WEB', 'ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('LOGIN', 'EMAIL_VERIFICATION');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "AccountDeletionStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ConsentDocumentType" AS ENUM ('TERMS', 'PRIVACY', 'MARKETING_EMAIL', 'MARKETING_PUSH');

-- CreateEnum
CREATE TYPE "ClubStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ClubMemberRole" AS ENUM ('MEMBER', 'MODERATOR', 'LEADER');

-- CreateEnum
CREATE TYPE "ClubMemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'LEFT', 'BANNED');

-- CreateEnum
CREATE TYPE "EventDifficulty" AS ENUM ('EASY', 'MODERATE', 'HARD');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "EventMemberStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('NOT_CHECKED', 'ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('GENERAL', 'NOTICE', 'PHOTO');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'DELETED');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('IMAGE', 'FILE');

-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'NOTICE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_EVENT', 'COMMENT', 'REPLY', 'APPLICATION_APPROVED', 'APPLICATION_REJECTED', 'EVENT_REMINDER', 'REVIEW_REQUEST', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NewsletterStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "NewsletterRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'POST', 'COMMENT', 'REVIEW', 'CHAT_MESSAGE');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'ABUSE', 'HARASSMENT', 'MISINFORMATION', 'INAPPROPRIATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birth_year" INTEGER,
    "region" TEXT,
    "gender" "Gender",
    "avatar_url" TEXT,
    "bio" VARCHAR(300),
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMP(3),
    "onboarding_completed_at" TIMESTAMP(3),
    "terms_agreed_at" TIMESTAMP(3),
    "marketing_agreed_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "deletion_requested_at" TIMESTAMP(3),
    "anonymized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "client_type" "SessionClientType" NOT NULL,
    "device_name" VARCHAR(120),
    "user_agent" VARCHAR(500),
    "ip_hash" VARCHAR(128),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_push_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "device_id" VARCHAR(160),
    "app_version" VARCHAR(40),
    "enabled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" TEXT NOT NULL,
    "push_enabled" BOOLEAN NOT NULL DEFAULT false,
    "push_event_updates" BOOLEAN NOT NULL DEFAULT true,
    "push_chat_messages" BOOLEAN NOT NULL DEFAULT true,
    "email_event_updates" BOOLEAN NOT NULL DEFAULT true,
    "email_newsletter" BOOLEAN NOT NULL DEFAULT false,
    "quiet_hours_start" VARCHAR(5),
    "quiet_hours_end" VARCHAR(5),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "document_type" "ConsentDocumentType" NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMP(3),

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "route" VARCHAR(160) NOT NULL,
    "key" VARCHAR(160) NOT NULL,
    "request_hash" VARCHAR(128) NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_deletion_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "AccountDeletionStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" VARCHAR(500),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "failure_code" VARCHAR(100),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "type" VARCHAR(120) NOT NULL,
    "aggregate_type" VARCHAR(80) NOT NULL,
    "aggregate_id" VARCHAR(120) NOT NULL,
    "dedup_key" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 8,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" VARCHAR(120),
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interests" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_interests" (
    "user_id" TEXT NOT NULL,
    "interest_id" TEXT NOT NULL,
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_interests_pkey" PRIMARY KEY ("user_id","interest_id")
);

-- CreateTable
CREATE TABLE "clubs" (
    "id" TEXT NOT NULL,
    "interest_id" TEXT NOT NULL,
    "leader_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cover_image_url" TEXT,
    "region" TEXT,
    "status" "ClubStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_members" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ClubMemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "ClubMemberStatus" NOT NULL DEFAULT 'PENDING',
    "joined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cover_image_url" TEXT,
    "location_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "map_url" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "registration_deadline" TIMESTAMP(3),
    "capacity" INTEGER NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'KRW',
    "difficulty" "EventDifficulty" NOT NULL,
    "supplies" TEXT,
    "approval_mode" "ApprovalMode" NOT NULL DEFAULT 'MANUAL',
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_members" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "EventMemberStatus" NOT NULL DEFAULT 'PENDING',
    "attendance" "AttendanceStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "reviewed_by_id" TEXT,
    "checked_in_by_id" TEXT,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "checked_in_at" TIMESTAMP(3),
    "note" VARCHAR(500),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_member_transitions" (
    "id" TEXT NOT NULL,
    "event_member_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "from_status" "EventMemberStatus",
    "to_status" "EventMemberStatus",
    "from_attendance" "AttendanceStatus",
    "to_attendance" "AttendanceStatus",
    "reason" VARCHAR(500),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_member_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "PostType" NOT NULL DEFAULT 'GENERAL',
    "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_attachments" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "url" TEXT NOT NULL,
    "file_name" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_attachments" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL DEFAULT 'IMAGE',
    "url" TEXT NOT NULL,
    "file_name" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_rooms" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_room_members" (
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "muted_at" TIMESTAMP(3),
    "last_read_at" TIMESTAMP(3),

    CONSTRAINT "chat_room_members_pkey" PRIMARY KEY ("room_id","user_id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reply_to_id" TEXT,
    "client_message_id" VARCHAR(100),
    "type" "ChatMessageType" NOT NULL DEFAULT 'TEXT',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "url" TEXT NOT NULL,
    "file_name" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "payload" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletters" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "audience_filter" JSONB,
    "status" "NewsletterStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_recipients" (
    "newsletter_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "NewsletterRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "failure_code" TEXT,

    CONSTRAINT "newsletter_recipients_pkey" PRIMARY KEY ("newsletter_id","user_id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "resolver_id" TEXT,
    "target_type" "ReportTargetType" NOT NULL,
    "reported_user_id" TEXT,
    "post_id" TEXT,
    "comment_id" TEXT,
    "review_id" TEXT,
    "chat_message_id" TEXT,
    "reason" "ReportReason" NOT NULL,
    "detail" VARCHAR(1000),
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolution_note" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "addressee_id" TEXT NOT NULL,
    "pair_key" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "id" TEXT NOT NULL,
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_created_at_idx" ON "users"("status", "created_at");

-- CreateIndex
CREATE INDEX "users_region_idx" ON "users"("region");

-- CreateIndex
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_provider_account_id_key" ON "auth_identities"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_user_id_provider_key" ON "auth_identities"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_revoked_at_expires_at_idx" ON "auth_sessions"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "email_verifications_email_purpose_consumed_at_expires_at_idx" ON "email_verifications"("email", "purpose", "consumed_at", "expires_at");

-- CreateIndex
CREATE INDEX "email_verifications_user_id_created_at_idx" ON "email_verifications"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_push_tokens_token_key" ON "device_push_tokens"("token");

-- CreateIndex
CREATE INDEX "device_push_tokens_user_id_disabled_at_idx" ON "device_push_tokens"("user_id", "disabled_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_push_tokens_user_id_device_id_key" ON "device_push_tokens"("user_id", "device_id");

-- CreateIndex
CREATE INDEX "consent_records_user_id_recorded_at_idx" ON "consent_records"("user_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "consent_records_user_id_document_type_version_key" ON "consent_records"("user_id", "document_type", "version");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_user_id_route_key_key" ON "idempotency_records"("user_id", "route", "key");

-- CreateIndex
CREATE INDEX "account_deletion_requests_status_scheduled_for_idx" ON "account_deletion_requests"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "account_deletion_requests_user_id_requested_at_idx" ON "account_deletion_requests"("user_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_dedup_key_key" ON "outbox_events"("dedup_key");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_created_at_idx" ON "outbox_events"("status", "available_at", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_created_at_idx" ON "outbox_events"("aggregate_type", "aggregate_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "interests_slug_key" ON "interests"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "interests_name_key" ON "interests"("name");

-- CreateIndex
CREATE INDEX "interests_is_active_sort_order_idx" ON "interests"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "user_interests_interest_id_idx" ON "user_interests"("interest_id");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_slug_key" ON "clubs"("slug");

-- CreateIndex
CREATE INDEX "clubs_interest_id_status_idx" ON "clubs"("interest_id", "status");

-- CreateIndex
CREATE INDEX "clubs_leader_id_idx" ON "clubs"("leader_id");

-- CreateIndex
CREATE INDEX "clubs_region_status_idx" ON "clubs"("region", "status");

-- CreateIndex
CREATE INDEX "club_members_user_id_status_idx" ON "club_members"("user_id", "status");

-- CreateIndex
CREATE INDEX "club_members_club_id_status_role_idx" ON "club_members"("club_id", "status", "role");

-- CreateIndex
CREATE UNIQUE INDEX "club_members_club_id_user_id_key" ON "club_members"("club_id", "user_id");

-- CreateIndex
CREATE INDEX "events_club_id_status_start_at_idx" ON "events"("club_id", "status", "start_at");

-- CreateIndex
CREATE INDEX "events_creator_id_idx" ON "events"("creator_id");

-- CreateIndex
CREATE INDEX "events_status_start_at_idx" ON "events"("status", "start_at");

-- CreateIndex
CREATE INDEX "events_location_name_start_at_idx" ON "events"("location_name", "start_at");

-- CreateIndex
CREATE INDEX "event_members_user_id_status_idx" ON "event_members"("user_id", "status");

-- CreateIndex
CREATE INDEX "event_members_event_id_status_attendance_idx" ON "event_members"("event_id", "status", "attendance");

-- CreateIndex
CREATE UNIQUE INDEX "event_members_event_id_user_id_key" ON "event_members"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "event_member_transitions_event_member_id_created_at_idx" ON "event_member_transitions"("event_member_id", "created_at");

-- CreateIndex
CREATE INDEX "event_member_transitions_actor_id_created_at_idx" ON "event_member_transitions"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "posts_club_id_status_created_at_idx" ON "posts"("club_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "posts_user_id_created_at_idx" ON "posts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "post_attachments_post_id_sort_order_idx" ON "post_attachments"("post_id", "sort_order");

-- CreateIndex
CREATE INDEX "comments_post_id_status_created_at_idx" ON "comments"("post_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "comments_user_id_created_at_idx" ON "comments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_parent_id_idx" ON "comments"("parent_id");

-- CreateIndex
CREATE INDEX "reviews_event_id_status_created_at_idx" ON "reviews"("event_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "reviews_user_id_created_at_idx" ON "reviews"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_event_id_user_id_key" ON "reviews"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "review_attachments_review_id_sort_order_idx" ON "review_attachments"("review_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "chat_rooms_event_id_key" ON "chat_rooms"("event_id");

-- CreateIndex
CREATE INDEX "chat_room_members_user_id_left_at_idx" ON "chat_room_members"("user_id", "left_at");

-- CreateIndex
CREATE INDEX "chat_messages_room_id_created_at_id_idx" ON "chat_messages"("room_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "chat_messages_user_id_created_at_idx" ON "chat_messages"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_messages_reply_to_id_idx" ON "chat_messages"("reply_to_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_room_id_user_id_client_message_id_key" ON "chat_messages"("room_id", "user_id", "client_message_id");

-- CreateIndex
CREATE INDEX "chat_attachments_message_id_idx" ON "chat_attachments"("message_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_created_at_idx" ON "notifications"("recipient_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_type_created_at_idx" ON "notifications"("type", "created_at");

-- CreateIndex
CREATE INDEX "newsletters_status_scheduled_at_idx" ON "newsletters"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "newsletter_recipients_user_id_status_idx" ON "newsletter_recipients"("user_id", "status");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_reporter_id_created_at_idx" ON "reports"("reporter_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_reported_user_id_idx" ON "reports"("reported_user_id");

-- CreateIndex
CREATE INDEX "reports_post_id_idx" ON "reports"("post_id");

-- CreateIndex
CREATE INDEX "reports_comment_id_idx" ON "reports"("comment_id");

-- CreateIndex
CREATE INDEX "reports_review_id_idx" ON "reports"("review_id");

-- CreateIndex
CREATE INDEX "reports_chat_message_id_idx" ON "reports"("chat_message_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_actor_id_created_at_idx" ON "admin_audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_type_target_id_created_at_idx" ON "admin_audit_logs"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_pair_key_key" ON "friendships"("pair_key");

-- CreateIndex
CREATE INDEX "friendships_addressee_id_status_idx" ON "friendships"("addressee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_requester_id_addressee_id_key" ON "friendships"("requester_id", "addressee_id");

-- CreateIndex
CREATE INDEX "user_blocks_blocked_id_created_at_idx" ON "user_blocks"("blocked_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_blocks_blocker_id_blocked_id_key" ON "user_blocks"("blocker_id", "blocked_id");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "interests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "interests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_checked_in_by_id_fkey" FOREIGN KEY ("checked_in_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_member_transitions" ADD CONSTRAINT "event_member_transitions_event_member_id_fkey" FOREIGN KEY ("event_member_id") REFERENCES "event_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_member_transitions" ADD CONSTRAINT "event_member_transitions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_attachments" ADD CONSTRAINT "post_attachments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_attachments" ADD CONSTRAINT "review_attachments_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_recipients" ADD CONSTRAINT "newsletter_recipients_newsletter_id_fkey" FOREIGN KEY ("newsletter_id") REFERENCES "newsletters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_recipients" ADD CONSTRAINT "newsletter_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolver_id_fkey" FOREIGN KEY ("resolver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_chat_message_id_fkey" FOREIGN KEY ("chat_message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_fkey" FOREIGN KEY ("addressee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain integrity that Prisma's schema language cannot express.
ALTER TABLE "events"
  ADD CONSTRAINT "events_capacity_positive" CHECK ("capacity" > 0),
  ADD CONSTRAINT "events_price_nonnegative" CHECK ("price" >= 0),
  ADD CONSTRAINT "events_time_order" CHECK ("end_at" IS NULL OR "end_at" > "start_at"),
  ADD CONSTRAINT "events_registration_before_start" CHECK (
    "registration_deadline" IS NULL OR "registration_deadline" <= "start_at"
  );

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "friendships"
  ADD CONSTRAINT "friendships_not_self" CHECK ("requester_id" <> "addressee_id");

ALTER TABLE "user_blocks"
  ADD CONSTRAINT "user_blocks_not_self" CHECK ("blocker_id" <> "blocked_id");

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_attempts_valid" CHECK (
    "attempts" >= 0 AND "max_attempts" > 0 AND "attempts" <= "max_attempts"
  );

ALTER TABLE "account_deletion_requests"
  ADD CONSTRAINT "account_deletion_schedule_valid" CHECK ("scheduled_for" >= "requested_at");

ALTER TABLE "event_member_transitions"
  ADD CONSTRAINT "event_member_transitions_has_change" CHECK (
    "to_status" IS NOT NULL OR "to_attendance" IS NOT NULL
  );

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_exactly_one_target" CHECK (
    num_nonnulls(
      "reported_user_id",
      "post_id",
      "comment_id",
      "review_id",
      "chat_message_id"
    ) = 1
  ),
  ADD CONSTRAINT "reports_target_type_matches_reference" CHECK (
    ("target_type" = 'USER'::"ReportTargetType" AND "reported_user_id" IS NOT NULL) OR
    ("target_type" = 'POST'::"ReportTargetType" AND "post_id" IS NOT NULL) OR
    ("target_type" = 'COMMENT'::"ReportTargetType" AND "comment_id" IS NOT NULL) OR
    ("target_type" = 'REVIEW'::"ReportTargetType" AND "review_id" IS NOT NULL) OR
    ("target_type" = 'CHAT_MESSAGE'::"ReportTargetType" AND "chat_message_id" IS NOT NULL)
  );
