import { Injectable, Logger } from '@nestjs/common'
import { tmtTranslate } from './tmt.translator'

// 翻译服务：腾讯云机器翻译 TMT（env: TMT_SECRET_ID / TMT_SECRET_KEY / TMT_REGION 可选）
// 未配置密钥时抛「翻译服务未配置」，由调用方决定是否静默降级（发布自动补翻失败不影响发布）
@Injectable()
export class TranslateService {
  private readonly logger = new Logger(TranslateService.name)

  /** 中文 → 目标语种（en/th） */
  async translateZh(text: string, target: 'en' | 'th'): Promise<string> {
    const sid = process.env.TMT_SECRET_ID
    const skey = process.env.TMT_SECRET_KEY
    if (!sid || !skey) {
      throw new Error('翻译服务未配置：缺少 TMT_SECRET_ID/TMT_SECRET_KEY')
    }
    const out = await tmtTranslate(
      { secretId: sid, secretKey: skey, region: process.env.TMT_REGION || 'ap-guangzhou' },
      text,
      'zh',
      target,
    )
    this.logger.log(`tmt translate zh->${target} (${text.length} chars)`)
    return out
  }
}
