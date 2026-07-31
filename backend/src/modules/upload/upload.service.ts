import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import sanitizeHtml from 'sanitize-html'
import type { IStorage } from './storage.interface'

// 上传结果：HTML sanitize 后返回
export interface HtmlSanitizeResult {
  html: string
  stats: {
    originalSize: number
    keptSize: number
    strippedTags: string[]
    strippedAttrs: string[]
  }
}

// 图片上传结果
export interface ImageUploadResult {
  url: string
  key: string
  size: number
  contentType: string
  width?: number
  height?: number
}

// iframe src 域名白名单（地图/天气）
const IFRAME_HOSTS = [
  'map.baidu.com',
  'api.map.baidu.com',
  'www.google.com',
  'maps.google.com',
  'www.openstreetmap.org',
  'openstreetmap.org',
  'weather.html.qq.com',
  'tianqi.qq.com',
  'www.qq.com',
]

// sanitize-html 配置：严格白名单 + iframe 域名白名单 + 自动注入 sandbox/target
function buildSanitizeOpts(recorder: { tags: Set<string>; attrs: Set<string> }): sanitizeHtml.IOptions {
  return {
    allowedTags: [
      'div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'br', 'hr',
      'a', 'img', 'figure', 'figcaption', 'picture', 'source',
      'blockquote', 'cite', 'q',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
      'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g', 'defs', 'use', 'text', 'tspan', 'stop', 'linearGradient', 'radialGradient',
      'video', 'audio', 'track',
      'details', 'summary', 'time',
      'span', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup', 'mark', 'small', 'del', 'ins',
      'pre', 'code', 'kbd', 'samp', 'var',
      'style', 'iframe',
    ],
    allowedAttributes: {
      '*': ['class', 'id', 'style', 'title', 'lang', 'dir', 'role', 'aria-label', 'aria-hidden', 'data-*'],
      a: ['href', 'name', 'target', 'rel', 'title', 'download'],
      img: ['src', 'alt', 'width', 'height', 'loading', 'decoding', 'srcset', 'sizes'],
      iframe: ['src', 'width', 'height', 'allowfullscreen', 'sandbox', 'allow', 'title', 'name'],
      video: ['src', 'poster', 'controls', 'preload', 'width', 'height', 'autoplay', 'loop', 'muted', 'playsinline'],
      audio: ['src', 'controls', 'preload', 'autoplay', 'loop', 'muted'],
      source: ['src', 'srcset', 'type', 'media', 'sizes'],
      track: ['src', 'kind', 'srclang', 'label', 'default'],
      svg: ['viewBox', 'width', 'height', 'xmlns', 'fill', 'stroke', 'stroke-width', 'class', 'style', 'preserveAspectRatio'],
      path: ['d', 'fill', 'stroke', 'stroke-width', 'class', 'style', 'fill-rule', 'clip-rule'],
      circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'class', 'style'],
      rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'class', 'style'],
      line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'class', 'style'],
      polyline: ['points', 'fill', 'stroke', 'class', 'style'],
      polygon: ['points', 'fill', 'stroke', 'class', 'style'],
      ellipse: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'class', 'style'],
      use: ['href', 'xlink:href', 'x', 'y', 'width', 'height'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
      col: ['span'],
      colgroup: ['span'],
      time: ['datetime'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    // 图片允许 data: scheme（单文件微站常内嵌 base64 图，如北疆攻略 1.3MB）；
    // 限定仅 img 标签，避免全局放行 data: 造成 a[href=data:text/html] 等可执行注入。
    // 非 data:image/ 前缀的 data URI 由 transformTags.img 二次拦截剥掉 src。
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowedIframeHostnames: IFRAME_HOSTS,
    // 强制 iframe 注入 sandbox（不含 allow-top-navigation，防导航劫持）
    transformTags: {
      a: (_t, attribs) => {
        const href = attribs.href || ''
        if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
          return { tagName: 'a', attribs }
        }
        return { tagName: 'a', attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } }
      },
      iframe: (_t, attribs) => ({
        tagName: 'iframe',
        attribs: { ...attribs, sandbox: 'allow-scripts allow-same-origin allow-popups' },
      }),
      img: (_t, attribs) => {
        const out = { ...attribs }
        // data: URI 仅放行图片（data:image/...），其余（text/html、application/...）剥掉 src 防注入
        if ((out.src || '').startsWith('data:') && !(out.src || '').startsWith('data:image/')) {
          delete out.src
        }
        return { tagName: 'img', attribs: { ...out, loading: out.loading || 'lazy', decoding: out.decoding || 'async' } }
      },
    },
    // 记录被剥离的标签
    onIgnoreTag: (tag) => {
      recorder.tags.add(tag)
      return null
    },
    // 记录被剥离的属性（on* 事件、javascript: 等）
    onIgnoreTagAttr: (tag, name) => {
      recorder.attrs.add(`${tag}.${name}`)
      return null
    },
  }
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name)

  constructor(@Inject('STORAGE') private readonly storage: IStorage) {}

  // HTML sanitize：接收原始 HTML 字符串，返回 sanitize 后的 HTML + 剥离统计
  sanitizeHtml(raw: string): HtmlSanitizeResult {
    const recorder = { tags: new Set<string>(), attrs: new Set<string>() }
    const html = sanitizeHtml(raw, buildSanitizeOpts(recorder))
    return {
      html,
      stats: {
        originalSize: Buffer.byteLength(raw, 'utf8'),
        keptSize: Buffer.byteLength(html, 'utf8'),
        strippedTags: [...recorder.tags],
        strippedAttrs: [...recorder.attrs],
      },
    }
  }

  // 图片上传：MIME 嗅探（不信客户端 Content-Type）→ 生成 UUID key → 存 storage
  async uploadImage(file: { buffer: Buffer; originalname: string; mimetype: string }): Promise<ImageUploadResult> {
    const ext = this.sniffImageExt(file.buffer)
    if (!ext) {
      throw new BadRequestException('不支持的图片格式（仅 jpg/png/webp）')
    }
    const now = new Date()
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    const key = `cases/images/${ym}/${randomUUID()}.${ext}`
    const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
    const res = await this.storage.put({ key, body: file.buffer, contentType })
    this.logger.log(`image uploaded ${key} (${res.size}B)`)
    return { url: res.url, key: res.key, size: res.size, contentType }
  }

  // 嗅探图片真实格式（魔数），返回扩展名或 null
  private sniffImageExt(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
    if (buf.length < 12) return null
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
    // WEBP: RIFF....WEBP
    if (
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    ) {
      return 'webp'
    }
    return null
  }
}
