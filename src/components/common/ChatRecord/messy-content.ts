export interface MessyContentAnalysis {
  shouldCollapse: boolean
  normalizedContent: string
  previewLines: string[]
  hiddenLineCount: number
  linkUrls: string[]
}

const PREVIEW_LINE_COUNT = 3
const MIN_LINE_COUNT = 8
const MIN_MACHINE_LINE_RATIO = 0.35
const MIN_STRUCTURAL_NOISE_RATIO = 0.25
const MIN_XML_TAG_COUNT = 6
const LONG_TOKEN_LENGTH = 32

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, '\n')
}

function trimOuterBlankLines(lines: string[]): string[] {
  let start = 0
  let end = lines.length

  while (start < end && lines[start].trim() === '') {
    start += 1
  }

  while (end > start && lines[end - 1].trim() === '') {
    end -= 1
  }

  return lines.slice(start, end)
}

function isMachineLikeLine(line: string): boolean {
  const value = line.trim()
  if (!value) return false

  if (/^https?:\/\//i.test(value) && value.length >= LONG_TOKEN_LENGTH) return true
  if (/^(?:true|false|null|undefined|-?\d+)$/i.test(value)) return true
  if (/^[0-9a-f]{24,}$/i.test(value)) return true
  if (/^[a-z0-9_-]+_[a-z0-9_-]{8,}$/i.test(value)) return true
  if (/^[a-z0-9+/=_-]{24,}$/i.test(value) && /[a-z]/i.test(value) && /\d/.test(value)) return true

  const hasWhitespace = /\s/.test(value)
  if (!hasWhitespace && value.length >= LONG_TOKEN_LENGTH && /^[\w+/=:%.-]+$/.test(value)) return true

  const readableMatches = value.match(/[\p{Script=Han}\p{Letter}]/gu) ?? []
  const readableRatio = readableMatches.length / value.length
  return value.length >= 16 && readableRatio < 0.25
}

function isStructuralNoiseLine(line: string): boolean {
  if (line.trim() === '') return true
  return /^\s+/.test(line) || line.includes('\t')
}

function countXmlTags(content: string): number {
  return content.match(/<\/?[A-Za-z_][\w:.-]*(?:\s[^<>]*)?>/g)?.length ?? 0
}

function isXmlLikeContent(content: string): boolean {
  const trimmedContent = content.trim()
  if (!/^(?:<\?xml[\s\S]*?\?>\s*)?<[A-Za-z_][\w:.-]*(?:\s[^<>]*)?>/.test(trimmedContent)) {
    return false
  }
  return countXmlTags(trimmedContent) >= MIN_XML_TAG_COUNT
}

function decodeXmlEntities(content: string): string {
  return content
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractXmlPreviewLines(content: string): string[] {
  const textContent = content
    .replace(/<\?xml[\s\S]*?\?>/gi, '\n')
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '\n$1\n')
    .replace(/<[^>]+>/g, '\n')

  // XML 只抽取叶子文本节点做预览；标签名、属性和机器字段都不参与摘要。
  return textContent
    .split('\n')
    .map((line) => decodeXmlEntities(line).trim())
    .filter((line) => line && !isMachineLikeLine(line))
    .slice(0, PREVIEW_LINE_COUNT)
}

function extractHttpUrls(content: string): string[] {
  const decodedContent = decodeXmlEntities(content)
  const matches = decodedContent.match(/https?:\/\/[^\s<>"']+/gi) ?? []
  const urls = new Set<string>()

  for (const match of matches) {
    try {
      const url = new URL(match)
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        urls.add(url.toString())
      }
    } catch {
      // 忽略格式不完整的链接片段，展示层只接收浏览器可打开的 URL。
    }
  }

  return [...urls]
}

export function analyzeMessyContent(content: string): MessyContentAnalysis {
  const normalizedLines = trimOuterBlankLines(normalizeLineEndings(content).split('\n'))
  const normalizedContent = normalizedLines.join('\n')
  const nonEmptyLines = normalizedLines.filter((line) => line.trim() !== '')
  const xmlPreviewLines = isXmlLikeContent(normalizedContent) ? extractXmlPreviewLines(normalizedContent) : []
  const previewLines =
    xmlPreviewLines.length > 0 ? xmlPreviewLines : nonEmptyLines.slice(0, PREVIEW_LINE_COUNT).map((line) => line.trim())

  if (xmlPreviewLines.length > 0) {
    return {
      shouldCollapse: true,
      normalizedContent,
      previewLines,
      hiddenLineCount: Math.max(nonEmptyLines.length - previewLines.length, 0),
      linkUrls: extractHttpUrls(normalizedContent),
    }
  }

  if (nonEmptyLines.length < MIN_LINE_COUNT) {
    return {
      shouldCollapse: false,
      normalizedContent,
      previewLines,
      hiddenLineCount: Math.max(nonEmptyLines.length - previewLines.length, 0),
      linkUrls: [],
    }
  }

  const machineLineCount = nonEmptyLines.filter(isMachineLikeLine).length
  const structuralNoiseLineCount = normalizedLines.filter(isStructuralNoiseLine).length

  // 这里只看文本结构，不识别具体平台或字段名，避免把某个聊天软件的导出格式写死到展示层。
  const machineLineRatio = machineLineCount / nonEmptyLines.length
  const structuralNoiseRatio = structuralNoiseLineCount / normalizedLines.length
  const shouldCollapse =
    machineLineRatio >= MIN_MACHINE_LINE_RATIO && structuralNoiseRatio >= MIN_STRUCTURAL_NOISE_RATIO

  return {
    shouldCollapse,
    normalizedContent,
    previewLines,
    hiddenLineCount: Math.max(nonEmptyLines.length - previewLines.length, 0),
    linkUrls: [],
  }
}
