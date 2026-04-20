/**
 * CommonMark treats `\(`, `\)`, `\[`, `\]` as backslash-escaped ASCII
 * punctuation and strips the backslashes during parsing. That means KaTeX's
 * auto-render (which walks text nodes *after* markdown has rendered) never
 * sees those delimiters and cannot match inline/display math written in the
 * classic TeX form many LLMs emit.
 *
 * To keep the KaTeX auto-render approach (no remark/rehype math plugins), we
 * rewrite those delimiter pairs into the `$ ... $` / `$$ ... $$` form that
 * markdown leaves alone, *before* the content reaches the parser. Everything
 * else is handled by auto-render in the rendered DOM.
 *
 * Fenced code blocks (``` ... ```) and inline code (`...`) are skipped so
 * real code that happens to contain `\(` or `\[` is not mangled.
 *
 * @param {string} src
 * @returns {string}
 */
export function preserveLatexEscapes(src) {
    if (!src || typeof src !== 'string') return src

    // Split out fenced code blocks first; odd indices are code fences.
    const fenceParts = src.split(/(```[\s\S]*?```)/g)

    return fenceParts
        .map((part, i) => {
            if (i % 2 === 1) return part // inside ``` ... ```
            // Protect inline `code` spans inside non-fenced segments.
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
