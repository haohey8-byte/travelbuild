-- 旅行社（Agency）增加 disabled 字段：禁用后仅从各选择下拉框移除，不阻断登录
ALTER TABLE "Agency" ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;
