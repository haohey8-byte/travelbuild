-- 省地接社纳入路线协作 + 成本询价机构字段语义化
-- 对应需求：省地接社按 provincialId 可见被分配的路线并参与协作规划与报价；
--           CostInquiry.agencyId 重命名为 provincialId（被询价的省地接社机构）。

-- 1) Route 增加省地接社归属字段（用于物理隔绝的查询隔离）
ALTER TABLE "Route" ADD COLUMN "provincialId" TEXT;
CREATE INDEX "Route_provincialId_idx" ON "Route"("provincialId");

-- 2) CostInquiry.agencyId 改名为 provincialId（保留 NOT NULL 约束）
ALTER TABLE "CostInquiry" RENAME COLUMN "agencyId" TO "provincialId";
