-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "joinToken" TEXT NOT NULL,
ADD COLUMN     "maxParticipants" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "accessKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Session_joinToken_key" ON "Session"("joinToken");
