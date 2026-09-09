// Zero-dep JSON highlighter for admin user.json. Every chunk goes through esc().

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function span(cls: string, text: string): string {
  return `<span class="${cls}">${esc(text)}</span>`
}

const TOKEN_RE =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g

export function highlightJson(src: string): string {
  let out = ''
  let last = 0
  TOKEN_RE.lastIndex = 0
  for (let m = TOKEN_RE.exec(src); m; m = TOKEN_RE.exec(src)) {
    out += esc(src.slice(last, m.index))
    const [tok, str, colon, num, kw] = m
    if (str && colon) out += span('tok-key', str) + esc(colon)
    else if (str) out += span('tok-str', str)
    else if (num) out += span('tok-num', tok)
    else if (kw) out += span('tok-kw', tok)
    last = m.index + tok.length
  }
  return out + esc(src.slice(last))
}
