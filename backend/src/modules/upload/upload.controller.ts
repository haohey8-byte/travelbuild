import { Body, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { UploadService } from './upload.service'

interface AuthUser {
  id: string
}

interface HtmlBody {
  html: string
}

// 上传模块：HTML sanitize + 图片上传。均需登录（JWT）。
@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly svc: UploadService) {}

  // HTML sanitize：前端读取 .html 文件内容后以 JSON 提交；返回 sanitize 后的 HTML + 剥离统计
  @Post('html')
  sanitizeHtml(@Body() body: HtmlBody) {
    if (!body || typeof body.html !== 'string' || !body.html.trim()) {
      return { error: 'html 字段必填' }
    }
    // 500KB 上限（与 PRD M2 一致）
    if (Buffer.byteLength(body.html, 'utf8') > 500 * 1024) {
      return { error: 'HTML 文件超过 500KB 上限' }
    }
    return this.svc.sanitizeHtml(body.html)
  }

  // 图片上传：multipart file 字段；内存暂存（5MB 上限）→ MIME 嗅探 → storage
  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadImage(@UploadedFile() file: any, _user: AuthUser) {
    if (!file) {
      return { error: '未收到文件（字段名 file）' }
    }
    try {
      return await this.svc.uploadImage(file)
    } catch (e: any) {
      return { error: e?.message || '上传失败' }
    }
  }
}
