-- 迁移：新增 Agency 机构表，并建立 User/Route/CostInquiry 的机构外键关系
-- 时间：2026-07-16
-- 依赖：20260714230000_provincial_collaboration

-- 1) 创建 Agency 机构表
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "contact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- 2) 插入已有演示机构（幂等：如已存在则跳过）
INSERT INTO "Agency" ("id", "name", "role", "updatedAt")
VALUES
    ('org-agency-seed', '环球旅行社', 'agency', CURRENT_TIMESTAMP),
    ('org-provincial-seed', '川内地接社', 'provincial', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
    "name" = EXCLUDED."name",
    "role" = EXCLUDED."role",
    "updatedAt" = CURRENT_TIMESTAMP;

-- 3) 修正 Route 中 agencyId 为字符串但可能指向不存在的机构的问题：
--    先把所有 agencyId 不是已知 Agency 的记录置为 NULL，避免外键创建失败。
--    （注意：这里只保护外键创建；后续业务逻辑会要求一手创建时必选旅行社。）
UPDATE "Route" SET "agencyId" = NULL
WHERE "agencyId" IS NOT NULL
  AND "agencyId" NOT IN (SELECT "id" FROM "Agency");

-- 3a) 同样清理 User.agencyId：早期测试数据可能写入任意字符串，
--     不在此归并会导致下面 ADD CONSTRAINT User_agencyId_fkey 在已有行上校验失败。
UPDATE "User" SET "agencyId" = NULL
WHERE "agencyId" IS NOT NULL
  AND "agencyId" NOT IN (SELECT "id" FROM "Agency");

-- 3b) CostInquiry.provincialId 是 NOT NULL，先把指向未知机构的记录归到演示省地接社，避免外键失败。
UPDATE "CostInquiry" SET "provincialId" = 'org-provincial-seed'
WHERE "provincialId" NOT IN (SELECT "id" FROM "Agency");

-- 4) 在 User 上添加外键约束
ALTER TABLE "User" ADD CONSTRAINT "User_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) 在 Route 上添加外键约束（旅行社 + 省地接社）
ALTER TABLE "Route" ADD CONSTRAINT "Route_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Route" ADD CONSTRAINT "Route_provincialId_fkey"
    FOREIGN KEY ("provincialId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6) 在 CostInquiry 上添加外键约束
ALTER TABLE "CostInquiry" ADD CONSTRAINT "CostInquiry_provincialId_fkey"
    FOREIGN KEY ("provincialId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
