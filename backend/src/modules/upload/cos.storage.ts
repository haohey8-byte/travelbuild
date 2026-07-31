import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import COS from 'cos-nodejs-sdk-v5'
import type { IStorage, StoragePutResult } from './storage.interface'

// 腾讯云 COS 存储（生产）。CloudBase 同账号可直接用 SecretId/SecretKey。
// 环境变量：
//   COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION / COS_CDN_BASE(可选)
// 缺少任一 → 启动时警告，上传时抛错（不静默失败）。
@Injectable()
export class CosStorage implements IStorage, OnModuleInit {
  private readonly logger = new Logger(CosStorage.name)
  private cos!: COS
  private bucket = process.env.COS_BUCKET || ''
  private region = process.env.COS_REGION || ''
  private cdnBase = process.env.COS_CDN_BASE || ''

  onModuleInit() {
    const sid = process.env.COS_SECRET_ID
    const skey = process.env.COS_SECRET_KEY
    if (!sid || !skey || !this.bucket || !this.region) {
      this.logger.warn('COS env incomplete (COS_SECRET_ID/COS_SECRET_KEY/COS_BUCKET/COS_REGION); uploads will fail')
    }
    this.cos = new COS({ SecretId: sid || '', SecretKey: skey || '' })
  }

  async put(input: { key: string; body: Buffer; contentType: string }): Promise<StoragePutResult> {
    if (!this.bucket || !this.region) {
      throw new Error('COS 未配置：缺少 COS_BUCKET/COS_REGION 环境变量')
    }
    try {
      await this.cos.putObject({
        Bucket: this.bucket,
        Region: this.region,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      })
    } catch (e: any) {
      // COS SDK 错误必须记日志（此前完全吞掉只剩 message，线上无法诊断）
      const code = e?.code || e?.statusCode || ''
      const msg = e?.message || String(e)
      this.logger.error(
        `cos putObject failed bucket=${this.bucket} region=${this.region} key=${input.key} code=${code} msg=${msg}`,
      )
      throw new Error(`COS 上传失败${code ? ` (${code})` : ''}：${msg}`)
    }
    const base = this.cdnBase || `https://${this.bucket}.cos.${this.region}.myqcloud.com`
    const url = `${base}/${input.key}`.replace(/\/+/g, '/')
    this.logger.log(`cos put ${input.key} (${input.body.length}B)`)
    return { url, key: input.key, size: input.body.length, contentType: input.contentType }
  }
}
