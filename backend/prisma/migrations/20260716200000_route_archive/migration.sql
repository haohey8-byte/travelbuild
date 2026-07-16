-- 路线备份历史库：一手 PandaKing 删除路线时，删除前将整条路线 + 关联数据快照归档，
-- 便于审计与恢复溯源。删除为硬删（生产 Route 表移除），本表独立留存。
CREATE TABLE "RouteArchive" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "routeData" JSONB NOT NULL,
    "versions" JSONB,
    "shares" JSONB,
    "feedbacks" JSONB,
    "costInquiries" JSONB,
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

CREATE INDEX "RouteArchive_routeId_idx" ON "RouteArchive"("routeId");
CREATE INDEX "RouteArchive_createdAt_idx" ON "RouteArchive"("createdAt");
