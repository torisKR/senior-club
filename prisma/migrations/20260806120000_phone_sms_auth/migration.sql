ALTER TABLE "users"
  ALTER COLUMN "email" DROP NOT NULL,
  ADD COLUMN "phone_number" TEXT,
  ADD COLUMN "phone_verified_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

CREATE TABLE "phone_verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "phone_number" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "phone_verifications_phone_number_purpose_consumed_at_expires_at_idx"
  ON "phone_verifications"("phone_number", "purpose", "consumed_at", "expires_at");
CREATE INDEX "phone_verifications_user_id_created_at_idx"
  ON "phone_verifications"("user_id", "created_at");

ALTER TABLE "phone_verifications"
  ADD CONSTRAINT "phone_verifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
