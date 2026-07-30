import client from './client'
import type { UploadHtmlResult, UploadImageResult } from '@/types'

// 案例内容编辑器：上传 API —— 对应后端 /api/upload
// HTML sanitize：前端读取 .html 文件内容后以 JSON 提交；后端 sanitize-html 严格白名单 + iframe 域名白名单
export async function uploadHtml(html: string): Promise<UploadHtmlResult> {
  const { data } = await client.post('/upload/html', { html })
  return data
}

// 图片上传：multipart file 字段（字段名 file）；后端 MIME 嗅探 + storage 存储
export async function uploadImage(file: File): Promise<UploadImageResult> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await client.post('/upload/image', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}
