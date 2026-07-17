-- 省地接社成本①支持按项目填写
ALTER TABLE "CostInquiry" ADD COLUMN "costItems" JSONB DEFAULT '[]';

-- 历史数据回填：已提交的成本①拆成一条明细
UPDATE "CostInquiry"
SET "costItems" = jsonb_build_array(jsonb_build_object('name', '地接成本', 'amount', "cost1"::numeric))
WHERE "cost1" IS NOT NULL AND "costItems" = '[]';
