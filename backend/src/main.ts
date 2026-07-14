import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { HealthController } from './health.controller'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  // 全局前缀 /api，对齐前端 Vite 代理与 axios baseURL
  // 排除 /share/(.*)：协作 H5 分享页走服务端渲染（带 OG 注入），不挂 /api 前缀
  app.setGlobalPrefix('api', { exclude: ['share/(.*)'] })
  app.enableCors()
  // 容器内/云托管监听 0.0.0.0，端口取 PORT 环境变量（CloudBase 注入，缺省 3000）
  const port = Number(process.env.PORT) || 3000
  await app.listen(port, '0.0.0.0')
  // eslint-disable-next-line no-console
  console.log(`Backend listening on :${port} (prefix: /api)`)
}

bootstrap()
