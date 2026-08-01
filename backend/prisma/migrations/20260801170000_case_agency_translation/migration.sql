-- 案例多语言 P1：归属机构 + 翻译状态
-- 权限边界：Case.agencyId = 案例归属境外旅行社（机构账号只管理/校对自己的案例）
-- transMeta：{ en: { status:'machine'|'reviewed', at:ISO }, th: {...} }

ALTER TABLE "Case" ADD COLUMN "agencyId" TEXT;
ALTER TABLE "Case" ADD COLUMN "transMeta" JSONB;
