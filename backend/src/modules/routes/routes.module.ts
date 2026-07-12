import { Module } from '@nestjs/common'
import { RoutesController } from './routes.controller'
import { RoutesService } from './routes.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  // 导入 AuthModule 以复用 JwtAuthGuard 与 JwtService
  imports: [AuthModule],
  controllers: [RoutesController],
  providers: [RoutesService],
})
export class RoutesModule {}
