-- 迁移：写入两个真实机构（境外旅行社 / 省地接社）
-- 时间：2026-07-17
-- 依赖：20260716000000_agency_model（Agency 表与外键已存在）
-- 目的：一手 PandaKing 后续邀请对应微信账号时，可从机构下拉选到它们并自动归属。
--       （机构为空会导致邀请时无法选择真实归属社，从而引发外键/归属错乱。）

INSERT INTO "Agency" ("id", "name", "role", "updatedAt")
VALUES
    ('agency-101ways-to-china', '101 ways to china', 'agency', CURRENT_TIMESTAMP),
    ('provincial-xinjiang-hema', '新疆河马旅行社', 'provincial', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
    "name" = EXCLUDED."name",
    "role" = EXCLUDED."role",
    "updatedAt" = CURRENT_TIMESTAMP;
