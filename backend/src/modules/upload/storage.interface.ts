// 存储抽象：上传图片/HTML 走统一接口，按 STORAGE_DRIVER 选择实现。
// - local：本地磁盘（开发/测试；生产容器重启会丢，仅限调试）
// - cos：腾讯云 COS（生产；CloudBase 同账号可用，持久 + CDN）
export interface StoragePutInput {
  key: string // 形如 cases/images/2026-07/<uuid>.jpg
  body: Buffer
  contentType: string
}

export interface StoragePutResult {
  url: string // 可公开访问的 URL（local 为 /uploads/<key> 拼成绝对/相对；cos 为 CDN URL）
  key: string
  size: number
  contentType: string
}

export interface IStorage {
  put(input: StoragePutInput): Promise<StoragePutResult>
}
