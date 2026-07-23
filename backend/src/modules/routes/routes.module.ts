import { Module } from '@nestjs/common'
import { RoutesController } from './routes.controller'
import { RoutesService } from './routes.service'
import { IntakeController } from './intake.controller'
import { CostInquiryController } from './cost-inquiry.controller'
import { CostInquiryService } from './cost-inquiry.service'
import { H5Controller } from './h5.controller'
import { OgPageController } from './og-page.controller'
import { RouteArchiveController } from './route-archive.controller'
import { RouteArchiveService } from './route-archive.service'
import { ShareTokenGuard } from '../../common/guards/share-token.guard'
import { AuthModule } from '../auth/auth.module'

@Module({
  // 导入 AuthModule 以复用 JwtAuthGuard 与 JwtService
  imports: [AuthModule],
  controllers: [
    RoutesController,
    IntakeController,
    CostInquiryController,
    H5Controller,
    OgPageController,
    RouteArchiveController,
  ],
  providers: [RoutesService, CostInquiryService, RouteArchiveService, ShareTokenGuard],
})
export class RoutesModule {}
