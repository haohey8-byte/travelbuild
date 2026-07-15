import html2pdf from 'html2pdf.js'

// 基于 html2canvas 截图生成 PDF（图片方式，天然支持中文/泰文等 CJK/Thai 字体）。
// 表格/文本为图片，非可选中文本 —— MVP 取舍：零后端依赖、离线可用、字体零配置。
export async function generatePdf(el: HTMLElement, filename: string): Promise<void> {
  const opt = {
    margin: 10,
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
  }
  await html2pdf().set(opt as Record<string, unknown>).from(el).save()
}
