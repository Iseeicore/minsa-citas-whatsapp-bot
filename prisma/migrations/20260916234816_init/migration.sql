-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'DOCUMENT', 'LOCATION');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "displayName" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInboundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "type" "MessageType" NOT NULL,
    "text" TEXT,
    "mediaId" TEXT,
    "mediaMimeType" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "waMessageId" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'SENT',
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_waId_key" ON "Conversation"("waId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_waMessageId_key" ON "Message"("waMessageId");

-- CreateIndex
CREATE INDEX "Message_conversationId_timestamp_idx" ON "Message"("conversationId", "timestamp");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
