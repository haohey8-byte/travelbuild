// 本地最小类型声明：sanitize-html（@types/sanitize-html 因沙箱 safe-delete 守卫未能安装）
// 仅覆盖本项目实际用到的 API；如后续装上 @types/sanitize-html 可删除此文件。
declare module 'sanitize-html' {
  export interface IOptions {
    allowedTags?: string[] | false
    allowedAttributes?: Record<string, string[]>
    allowedSchemes?: string[]
    allowedIframeHostnames?: string[]
    transformTags?: Record<
      string,
      (tagName: string, attribs: Record<string, string>) => { tagName: string; attribs: Record<string, string> }
    >
    onIgnoreTag?: (tag: string, html: string, opts: any) => string | null
    onIgnoreTagAttr?: (tag: string, name: string, value: string, opts: any) => string | null
    [key: string]: any
  }
  function sanitizeHtml(dirty: string, options?: IOptions): string
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace sanitizeHtml {
    export { IOptions }
  }
  export = sanitizeHtml
}
