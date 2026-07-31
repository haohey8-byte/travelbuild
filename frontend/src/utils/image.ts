// 图片地址工具：修历史 bug 容错
//
// 历史 bug：cos.storage.ts 早期版本 .replace(/\/+/g, '/') 把 https:// 协议里的
// 双斜杠压扁成了 https:/，导致所有已上传到 COS 的图片 URL 协议错、加载 404 / SSL 失败。
// 新代码已不再生成坏 URL，但数据库里已存的脏数据需要前端展示层容错修正。
//
// 修法：检测 https:/（单斜杠 + 非 //）自动补成 https://。其他情况原样返回。
//
// 用法：所有 img src / background-image 都套 fixImageUrl(url)。
export function fixImageUrl(u?: string | null): string {
  if (!u) return ''
  // 仅匹配 "https:/" 后接非 "/"（避免误伤 "https://"）：^https:\/[^/]
  if (/^https:\/[^/]/i.test(u)) return u.replace(/^https:\//i, 'https://')
  return u
}