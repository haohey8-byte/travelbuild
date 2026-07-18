-- 给协作反馈表增加 authorRole（提交方角色），用于协作时间线按角色着色与内部反馈隔离
ALTER TABLE "RouteFeedback" ADD COLUMN "authorRole" TEXT;
