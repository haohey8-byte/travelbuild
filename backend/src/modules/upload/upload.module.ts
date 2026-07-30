import { Module } from '@nestjs/common'
import { UploadController } from './upload.controller'
import { UploadService } from './upload.service'
import { LocalDiskStorage } from './local-disk.storage'
import { CosStorage } from './cos.storage'
import { AuthModule } from '../auth/auth.module'
import type { IStorage } from './storage.interface'

// 按 STORAGE_DRIVER 选择存储实现（默认 local 开发；生产 cos）
const storageProvider = {
  provide: 'STORAGE',
  useFactory: (): IStorage => {
    const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase()
    if (driver === 'cos') return new CosStorage()
    return new LocalDiskStorage()
  },
}

@Module({
  imports: [AuthModule],
  controllers: [UploadController],
  providers: [UploadService, storageProvider, LocalDiskStorage, CosStorage],
  exports: [UploadService],
})
export class UploadModule {}
