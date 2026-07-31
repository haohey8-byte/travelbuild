-- 案例行程参数：出行时间 / 人数（由源路线派生，可覆盖）/ 用车（运营手填）
-- 均为可空，加入已存在的 Case 表，存量案例保持 NULL，运营在管理后台补全。
ALTER TABLE "Case" ADD COLUMN "travelDate" TIMESTAMP(3);
ALTER TABLE "Case" ADD COLUMN "groupSize" INTEGER;
ALTER TABLE "Case" ADD COLUMN "vehicle" TEXT;
