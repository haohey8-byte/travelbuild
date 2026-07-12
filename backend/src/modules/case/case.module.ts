import { Module } from '@nestjs/common'
import { CaseController } from './case.controller'
import { CaseService } from './case.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  // 导入 AuthModule 以复用 JwtAuthGuard（管理操作鉴权）
  imports: [AuthModule],
  controllers: [CaseController],
  providers: [CaseService],
})
export class CaseModule {}
