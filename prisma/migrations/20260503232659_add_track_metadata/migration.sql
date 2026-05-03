-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "coverUrl" TEXT,
ADD COLUMN     "embedSupported" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "service" TEXT,
ADD COLUMN     "serviceTrackId" TEXT;
