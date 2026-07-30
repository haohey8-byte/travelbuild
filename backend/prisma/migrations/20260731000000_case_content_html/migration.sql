-- 案例主体 HTML 字段（运营上传的单文件微站，服务端 sanitize 后存）
-- 说明：因云 Postgres 无 CREATE DATABASE 权限，无法提供 shadow database，
-- 故手工编写与 prisma migrate diff 等价的可空列 ALTER 语句（无默认值、可空）。
-- 线上由 Dockerfile CMD `prisma migrate deploy` 自动应用。

-- AlterTable: Case 主体 HTML
ALTER TABLE "Case" ADD COLUMN "contentHtml" TEXT;
