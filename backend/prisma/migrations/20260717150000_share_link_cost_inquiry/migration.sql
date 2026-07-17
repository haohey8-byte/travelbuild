-- 迁移：省地接社协作 H5 关联成本询价
-- 时间：2026-07-17
-- 依赖：20260716200000_route_archive（CostInquiry 表已存在）
-- 目的：将「分配省地接社」与「发起成本询价」合并为一次操作。
--       每个省地接社协作 H5 的 RouteShare 关联一个 CostInquiry，
--       省地接社打开统一链接即可同时编辑行程并填写成本①。

-- 1. 在 RouteShare 表添加成本询价关联字段
ALTER TABLE "RouteShare" ADD COLUMN "costInquiryId" TEXT;

-- 2. 唯一约束：一个 CostInquiry 最多被一个 RouteShare 引用
CREATE UNIQUE INDEX "RouteShare_costInquiryId_key" ON "RouteShare"("costInquiryId");

-- 3. 外键约束：删除 CostInquiry 时，关联的 RouteShare 置空而非级联删除
ALTER TABLE "RouteShare"
    ADD CONSTRAINT "RouteShare_costInquiryId_fkey"
    FOREIGN KEY ("costInquiryId")
    REFERENCES "CostInquiry"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
