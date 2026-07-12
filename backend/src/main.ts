import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { HealthController } from './health.controller'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  // 全局前缀 /api，对齐前端 Vite 代理与 axios baseURL
  app.setGlobalPrefix('api')
  app.enableCors()
  await app.listen(3000)
  // eslint-disable-next-line no-console
  console.log('Backend listening on http://localhost:3000 (prefix: /api)')
}

bootstrap()
