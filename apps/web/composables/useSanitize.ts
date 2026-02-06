const ALLOWED_TAGS = new Set(['p', 'strong', 'em', 's', 'ul', 'ol', 'li', 'a', 'br'])
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
}

export function sanitizeHtml(html: string): string {
  if (!html) return ''

  return html.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)?\/?>/gi, (match, tag: string, attrs: string) => {
    const lowerTag = tag.toLowerCase()

    if (!ALLOWED_TAGS.has(lowerTag)) return ''

    // Closing tag
    if (match.startsWith('</')) return `</${lowerTag}>`

    // Self-closing tags
    if (lowerTag === 'br') return '<br>'

    // Parse and filter attributes
    const allowedAttrs = ALLOWED_ATTRS[lowerTag]
    if (!allowedAttrs || !attrs) return `<${lowerTag}>`

    const sanitizedAttrs: string[] = []
    const attrRegex = /([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
    let attrMatch

    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      const attrName = attrMatch[1]!.toLowerCase()
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? ''

      if (!allowedAttrs.has(attrName)) continue

      // Block javascript: URLs
      if (attrName === 'href' && /^\s*javascript\s*:/i.test(attrValue)) continue

      sanitizedAttrs.push(`${attrName}="${attrValue.replace(/"/g, '&quot;')}"`)
    }

    return sanitizedAttrs.length > 0
      ? `<${lowerTag} ${sanitizedAttrs.join(' ')}>`
      : `<${lowerTag}>`
  })
}
