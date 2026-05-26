-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'VOICE';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "voiceDuration" INTEGER,
ADD COLUMN "voiceUrl" TEXT;
