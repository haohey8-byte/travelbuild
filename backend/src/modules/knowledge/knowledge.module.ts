import { Module } from '@nestjs/common'
import { KbController } from './knowledge.controller'
import { KbService } from './knowledge.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  // 导入 AuthModule 以复用 JwtAuthGuard（写操作鉴权）
  imports: [AuthModule],
  controllers: [KbController],
  providers: [KbService],
})
export class KbModule {}
