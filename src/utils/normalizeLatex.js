/**
 * Normalizes LaTeX delimiters in markdown text so `remark-math` can recognize
 * them. Many LLMs reply using the classic TeX delimiters `\( ... \)` for
 * inline math and `\[ ... \]` for display math, but:
 *   1. `remark-math` only understands `$ ... $` / `$$ ... $$`.
 *   2. Markdown treats `\(` / `\[` as escaped parentheses/brackets, so the
 *      backslashes get stripped before any math plugin can see them.
 *
 * This helper rewrites those delimiters to the dollar-sign form while leaving
 * fenced code blocks (``` ... ```) and inline code (`...`) untouched so that
 * actual code snippets are not accidentally turned into math.
 *
 * @param {string} src
 * @returns {string}
 */
export function normalizeLatexDelimiters(src) {
    if (!src || typeof src !== 'string') return src

    // Split out fenced code blocks first; odd indices are code fences.
    const fenceParts = src.split(/(```[\s\S]*?```)/g)

    return fenceParts
        .map((part, i) => {
            if (i % 2 === 1) return part // inside ``` ... ```
            // Within non-fenced segments, also protect inline `code` spans.
            const inlineParts = part.split(/(`[^`\n]*`)/g)
            return inlineParts
                .map((ip, j) => {
                    if (j % 2 === 1) return ip // inside `...`
                    return (
                        ip
                            // \[ ... \]  ->  $$ ... $$  (display math)
                            .replace(/\\\[([\s\S]+?)\\\]/g, (_, body) => `\n$$\n${body.trim()}\n$$\n`)
                            // \( ... \)  ->  $ ... $    (inline math)
                            .replace(/\\\(([\s\S]+?)\\\)/g, (_, body) => `$${body.trim()}$`)
                    )
                })
                .join('')
        })
        .join('')
}
