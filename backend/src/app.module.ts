import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { PrismaModule } from './prisma/prisma.module'
import { RoutesModule } from './modules/routes/routes.module'
import { AuthModule } from './modules/auth/auth.module'
import { KbModule } from './modules/knowledge/knowledge.module'
import { CaseModule } from './modules/case/case.module'
import { UploadModule } from './modules/upload/upload.module'
import { HealthController } from './health.controller'

// 根模块：聚合基础设施（Prisma 全局）+ 业务模块
// 全局限流：默认 100 次/分/IP（宽松兜底）；敏感端点（upload/cases 创建）用 @Throttle 覆盖收紧
@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 100 }],
    }),
    PrismaModule,
    RoutesModule,
    AuthModule,
    KbModule,
    CaseModule,
    UploadModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
