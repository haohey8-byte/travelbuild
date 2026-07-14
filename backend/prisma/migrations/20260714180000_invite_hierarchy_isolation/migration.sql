-- 邀请两层级 + 机构物理隔绝：新增 RoleLevel 枚举、User/Invite/Route 机构归属字段
-- 说明：本迁移仅做「新增字段/枚举」的向后兼容变更；
--   原始 diff 中包含的 tencentdb_tbl_dial_test_* 两张表为云厂商内部探活表，
--   不属于本项目 schema，已显式剔除，切勿执行 DROP。

-- CreateEnum
CREATE TYPE "RoleLevel" AS ENUM ('admin', 'staff');

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "agencyId" TEXT,
ADD COLUMN     "level" "RoleLevel" NOT NULL DEFAULT 'admin',
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "agencyId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "level" "RoleLevel" NOT NULL DEFAULT 'staff',
ADD COLUMN     "parentId" TEXT;
