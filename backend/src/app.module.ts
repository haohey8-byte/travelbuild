import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { RoutesModule } from './modules/routes/routes.module'
import { AuthModule } from './modules/auth/auth.module'
import { HealthController } from './health.controller'

// 根模块：聚合基础设施（Prisma 全局）+ 业务模块
// 后续 Feature 开发追加 QuotesModule / CasesModule / KbModule / PermissionsModule
@Module({
  imports: [PrismaModule, RoutesModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
