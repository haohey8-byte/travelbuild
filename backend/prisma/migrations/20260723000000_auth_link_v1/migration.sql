-- 迁移：账号密码登录 + 链接凭证协作权限（v1）
-- 生成依据：CodeSpec_账号密码登录与链接凭证协作权限_v1.0.md §2.1 / §2.2
-- 应用方式：backend 本地二进制 ./node_modules/.bin/prisma migrate deploy（禁 pnpm / 禁 migrate dev）

-- ===== §2.1 User 模型变更 =====
-- 1) phone 先加可空列
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
-- 2) 存量行回填唯一占位（MVP 仅 pandaking 用 phone，agency/provincial 用占位避免唯一冲突）
UPDATE "User" SET "phone" = 'legacy_' || "id" WHERE "phone" IS NULL;
-- 3) 置非空 + 唯一
ALTER TABLE "User" ALTER COLUMN "phone" SET NOT NULL;
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
-- 4) 新增密码与改密标记
ALTER TABLE "User" ADD COLUMN "password" TEXT;
ALTER TABLE "User" ADD COLUMN "mustChangePwd" BOOLEAN NOT NULL DEFAULT true;
-- 5) 新增更新时间（与 schema @updatedAt 对齐；存量行用当前时间回填）
ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- 6) role 默认值改 pandaking（不影响存量行）；level 默认值改 admin
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'pandaking';
ALTER TABLE "User" ALTER COLUMN "level" SET DEFAULT 'admin';

-- ===== §2.2 新增 RouteIntake 模型（机构提交链接） =====
CREATE TABLE "RouteIntake" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "RouteIntake_token_key" ON "RouteIntake"("token");
CREATE INDEX "RouteIntake_agencyId_idx" ON "RouteIntake"("agencyId");
