-- P2 整体页面多语言字段
-- 扩展字段：highlights 数组 / daysContent 每日图文 / contentHtml 整份 HTML 的英泰文版

ALTER TABLE "Case" ADD COLUMN "highlightsEn" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Case" ADD COLUMN "highlightsTh" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Case" ADD COLUMN "daysContentEn" JSONB;
ALTER TABLE "Case" ADD COLUMN "daysContentTh" JSONB;
ALTER TABLE "Case" ADD COLUMN "contentHtmlEn" TEXT;
ALTER TABLE "Case" ADD COLUMN "contentHtmlTh" TEXT;