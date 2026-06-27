-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneVerifiedAt" TIMESTAMP(3),
    "nickname" TEXT NOT NULL,
    "smsTriggerPausedAt" TIMESTAMP(3),
    "smsTriggerPausedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Countdown" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "lastConfirmedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "triggerClaimedAt" TIMESTAMP(3),

    CONSTRAINT "Countdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastInviteAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresetMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "shortNote" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL,
    "reviewReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresetMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "countdownId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "triggerKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "templateText" TEXT NOT NULL,
    "shortNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbuseEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbuseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Countdown_userId_key" ON "Countdown"("userId");

-- CreateIndex
CREATE INDEX "Countdown_status_expiresAt_idx" ON "Countdown"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Countdown_status_triggerClaimedAt_idx" ON "Countdown"("status", "triggerClaimedAt");

-- CreateIndex
CREATE INDEX "EmergencyContact_userId_status_idx" ON "EmergencyContact"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyContact_userId_phone_key" ON "EmergencyContact"("userId", "phone");

-- CreateIndex
CREATE INDEX "PresetMessage_userId_updatedAt_idx" ON "PresetMessage"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryEvent_idempotencyKey_key" ON "DeliveryEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DeliveryEvent_userId_createdAt_idx" ON "DeliveryEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryEvent_countdownId_createdAt_idx" ON "DeliveryEvent"("countdownId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryEvent_contactId_createdAt_idx" ON "DeliveryEvent"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "AbuseEvent_userId_type_createdAt_idx" ON "AbuseEvent"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "AbuseEvent_contactId_createdAt_idx" ON "AbuseEvent"("contactId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AbuseEvent_userId_contactId_type_key" ON "AbuseEvent"("userId", "contactId", "type");

-- AddForeignKey
ALTER TABLE "Countdown" ADD CONSTRAINT "Countdown_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresetMessage" ADD CONSTRAINT "PresetMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "EmergencyContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_countdownId_fkey" FOREIGN KEY ("countdownId") REFERENCES "Countdown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbuseEvent" ADD CONSTRAINT "AbuseEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbuseEvent" ADD CONSTRAINT "AbuseEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "EmergencyContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
