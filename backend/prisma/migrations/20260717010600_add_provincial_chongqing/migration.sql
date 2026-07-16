-- 迁移：新增真实省地接社 重庆渝青旅游
-- 时间：2026-07-17
-- 依赖：20260717000000_seed_real_agencies

INSERT INTO "Agency" ("id", "name", "role", "updatedAt")
VALUES
    ('provincial-chongqing-yuqing', '重庆渝青旅游', 'provincial', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
    "name" = EXCLUDED."name",
    "role" = EXCLUDED."role",
    "updatedAt" = CURRENT_TIMESTAMP;
