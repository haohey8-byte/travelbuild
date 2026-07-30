import { Injectable, Logger } from '@nestjs/common'
import { join, dirname } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import type { IStorage, StoragePutResult } from './storage.interface'

// 本地磁盘存储（开发/测试默认）。生产必须切 cos。
// 文件落 process.cwd()/uploads/<key>；通过 main.ts 的 express.static('/uploads') 对外提供。
@Injectable()
export class LocalDiskStorage implements IStorage {
  private readonly logger = new Logger(LocalDiskStorage.name)
  private readonly root = join(process.cwd(), 'uploads')
  // publicBase：前端可访问的根。默认相对 '/uploads'（同源），由反向代理/网关拼成绝对。
  private readonly publicBase = process.env.LOCAL_STORAGE_PUBLIC_BASE || '/uploads'

  async put(input: { key: string; body: Buffer; contentType: string }): Promise<StoragePutResult> {
    const abs = join(this.root, input.key)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, input.body)
    this.logger.log(`local put ${input.key} (${input.body.length}B)`)
    const url = `${this.publicBase}/${input.key}`.replace(/\/+/g, '/')
    return { url, key: input.key, size: input.body.length, contentType: input.contentType }
  }
}
