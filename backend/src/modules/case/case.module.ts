import { Module } from '@nestjs/common'
import { CaseController } from './case.controller'
import { CaseService } from './case.service'
import { CaseOgController } from './case-og.controller'
import { AuthModule } from '../auth/auth.module'
import { UploadModule } from '../upload/upload.module'

@Module({
  // 导入 AuthModule 复用 JwtAuthGuard；UploadModule 复用 UploadService.sanitizeHtml（importCaseHtml）
  imports: [AuthModule, UploadModule],
  controllers: [CaseController, CaseOgController],
  providers: [CaseService],
})
export class CaseModule {}
