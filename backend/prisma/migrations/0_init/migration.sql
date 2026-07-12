-- CreateEnum
CREATE TYPE "Role" AS ENUM ('pandaking', 'agency', 'provincial');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('draft', 'published', 'offline');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'agency',
    "agencyId" TEXT,
    "openid" TEXT,
    "email" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "email" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerNameCn" TEXT,
    "country" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "groupSize" INTEGER NOT NULL,
    "travelDate" TIMESTAMP(3),
    "statusKey" TEXT NOT NULL,
    "modeKey" TEXT NOT NULL DEFAULT 'collab',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteVersion" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "draft" BOOLEAN NOT NULL DEFAULT true,
    "itinerary" JSONB NOT NULL,
    "quote" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "routeId" TEXT,
    "destination" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "theme" TEXT NOT NULL,
    "priceRange" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KbEntry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "body" TEXT NOT NULL,
    "routeId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KbEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostInquiry" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "cost1" DECIMAL(12,2),
    "cost2" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteShare" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "versionId" TEXT,
    "role" "Role" NOT NULL DEFAULT 'agency',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "RouteShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteFeedback" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "versionId" TEXT,
    "token" TEXT,
    "authorName" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_openid_key" ON "User"("openid");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "CostInquiry_token_key" ON "CostInquiry"("token");

-- CreateIndex
CREATE UNIQUE INDEX "RouteShare_token_key" ON "RouteShare"("token");

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteVersion" ADD CONSTRAINT "RouteVersion_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteShare" ADD CONSTRAINT "RouteShare_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

