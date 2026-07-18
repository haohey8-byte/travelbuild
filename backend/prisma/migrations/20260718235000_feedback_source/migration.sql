-- 给协作反馈表补充 source 列（用于区分 H5 链接反馈 vs 控制台内部反馈）
-- 旧记录默认标记为 h5，与新 schema 的 @default("h5") 一致
ALTER TABLE "RouteFeedback" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'h5';
