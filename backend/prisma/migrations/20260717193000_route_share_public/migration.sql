-- 协作 H5 共享令牌新增「公开(对客)」标记：
-- 公开链接(public=true)仅暴露对客价 guestPrice，不泄漏内部成本①/利润，
-- 实现「客户看板」与内部报价的物理隔离；旧链接 public 默认 false(沿用原角色可见性)。
ALTER TABLE "RouteShare" ADD COLUMN "public" BOOLEAN NOT NULL DEFAULT false;
