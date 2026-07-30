-- 案例展示公开化 + 机构联合品牌字段扩展
-- 说明：因云 Postgres 无 CREATE DATABASE 权限，无法提供 shadow database，
-- 故手工编写与 prisma migrate diff 等价的可空列 ALTER 语句（无默认值、可空）。
-- 线上由 Dockerfile CMD `prisma migrate deploy` 自动应用。

-- AlterTable: Agency 联合品牌字段
ALTER TABLE "Agency" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Agency" ADD COLUMN "contacts" JSONB;

-- AlterTable: Case 公开化/图文产品页/多语言字段
ALTER TABLE "Case" ADD COLUMN "title" TEXT;
ALTER TABLE "Case" ADD COLUMN "titleEn" TEXT;
ALTER TABLE "Case" ADD COLUMN "titleTh" TEXT;
ALTER TABLE "Case" ADD COLUMN "cover" TEXT;
ALTER TABLE "Case" ADD COLUMN "highlights" TEXT[];
ALTER TABLE "Case" ADD COLUMN "descZh" TEXT;
ALTER TABLE "Case" ADD COLUMN "descEn" TEXT;
ALTER TABLE "Case" ADD COLUMN "descTh" TEXT;
ALTER TABLE "Case" ADD COLUMN "daysContent" JSONB;
