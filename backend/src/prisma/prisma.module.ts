import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

// PrismaService 全局可用，避免各模块重复导入
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
