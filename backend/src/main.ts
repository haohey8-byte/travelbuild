import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { HealthController } from './health.controller'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import { join } from 'node:path'

async function bootstrap() {
  // bodyParser: false → 手动挂 express.json，提升 body 上限至 10MB。
  // NestJS 默认 100kb：案例 HTML 微站单文件 1-3MB（sanitize 后仍大），上传/保存都会 413。
  // multipart（/api/upload/image）由 multer 处理，不受此中间件影响。
  const app = await NestFactory.create(AppModule, { bodyParser: false })
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))
  // 全局前缀 /api，对齐前端 Vite 代理与 axios baseURL
  // 排除 /share/(.*)：协作 H5 分享页走服务端渲染（带 OG 注入），不挂 /api 前缀
  app.setGlobalPrefix('api', { exclude: ['share/(.*)'] })
  app.enableCors()
  // 同镜像托管前端 SPA：根路径与静态资源由 express.static 提供；
  // /api 与 /share(OG 注入) 交给 NestJS 路由；前端用 hash 路由（createWebHashHistory），
  // 无需 history fallback，仅在无扩展名的 GET 上兜底返回 index.html，防直接访问深层路径 404。
  const spaRoot = join(__dirname, '..', '..', 'spa')
  app.use(express.static(spaRoot, { index: 'index.html' }))
  // 本地磁盘存储驱动：对外提供 /uploads/* 静态资源（生产用 cos 时此目录为空，无害）
  if ((process.env.STORAGE_DRIVER || 'local').toLowerCase() === 'local') {
    const uploadsRoot = join(process.cwd(), 'uploads')
    app.use('/uploads', express.static(uploadsRoot))
  }
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.method === 'GET' &&
      !req.path.startsWith('/api') &&
      !req.path.startsWith('/share') &&
      !req.path.includes('.')
    ) {
      return res.sendFile(join(spaRoot, 'index.html'))
    }
    next()
  })
  // 容器内/云托管监听 0.0.0.0，端口取 PORT 环境变量（CloudBase 注入，缺省 3000）
  const port = Number(process.env.PORT) || 3000
  await app.listen(port, '0.0.0.0')
  // eslint-disable-next-line no-console
  console.log(`Backend listening on :${port} (prefix: /api)`)
}

bootstrap()
