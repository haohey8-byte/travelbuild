import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { RoutesModule } from './modules/routes/routes.module'
import { AuthModule } from './modules/auth/auth.module'
import { KbModule } from './modules/knowledge/knowledge.module'
import { CaseModule } from './modules/case/case.module'
import { HealthController } from './health.controller'

// 根模块：聚合基础设施（Prisma 全局）+ 业务模块
@Module({
  imports: [PrismaModule, RoutesModule, AuthModule, KbModule, CaseModule],
  controllers: [HealthController],
})
export class AppModule {}
