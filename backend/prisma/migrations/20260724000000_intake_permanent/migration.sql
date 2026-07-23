-- 迁移：机构提交链接（RouteIntake）支持永久有效 + 备注 + 每 token 限流
-- 设计依据：用户确认「每机构单条常驻 + 永久/自定义有效期（30天/1年/自定义/永久），配合撤销与限流」
-- 应用方式：backend 本地二进制 ./node_modules/.bin/prisma migrate deploy（禁 pnpm / 禁 migrate dev；云库无 CREATE DATABASE）

-- 1) expiresAt 改为可空（null = 永久有效）
ALTER TABLE "RouteIntake" ALTER COLUMN "expiresAt" DROP NOT NULL;

-- 2) 新增备注
ALTER TABLE "RouteIntake" ADD COLUMN "note" TEXT;

-- 3) 每 token 限流字段：提交次数 + 最近提交时间
ALTER TABLE "RouteIntake" ADD COLUMN "submitCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RouteIntake" ADD COLUMN "lastSubmittedAt" TIMESTAMP(3);
