/*
  Warnings:

  - The values [SETUP] on the enum `SessionStage` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SessionStage_new" AS ENUM ('STAGE1', 'STAGE2', 'FINISHED');
ALTER TABLE "public"."Session" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "Session" ALTER COLUMN "stage" TYPE "SessionStage_new" USING ("stage"::text::"SessionStage_new");
ALTER TYPE "SessionStage" RENAME TO "SessionStage_old";
ALTER TYPE "SessionStage_new" RENAME TO "SessionStage";
DROP TYPE "public"."SessionStage_old";
ALTER TABLE "Session" ALTER COLUMN "stage" SET DEFAULT 'STAGE1';
COMMIT;

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "stage" SET DEFAULT 'STAGE1';
