import { Module } from '@nestjs/common'
import { CaseController } from './case.controller'
import { CaseService } from './case.service'
import { CaseOgController } from './case-og.controller'
import { AuthModule } from '../auth/auth.module'
import { UploadModule } from '../upload/upload.module'
import { TranslateModule } from '../translate/translate.module'

@Module({
  // AuthModule 复用 JwtAuthGuard；UploadModule 复用 UploadService.sanitizeHtml；
  // TranslateModule 复用 TranslateService（AI 机器翻译）
  imports: [AuthModule, UploadModule, TranslateModule],
  controllers: [CaseController, CaseOgController],
  providers: [CaseService],
})
export class CaseModule {}
