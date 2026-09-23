import katex from 'katex';
import 'katex/dist/katex.min.css';

export function tex(src: string, display = false): string {
  return katex.renderToString(src, { throwOnError: false, displayMode: display, strict: 'ignore', output: 'html' });
}

/** Replace $$display$$ and $inline$ TeX inside an HTML string. Use \$ for a literal dollar. */
export function renderMath(html: string): string {
  const ESC = '\u0000D\u0000';
  let s = html.replace(/\\\$/g, ESC);
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, m: string) => `<div class="math-block">${tex(m.trim(), true)}</div>`);
  s = s.replace(/\$([^$\n]+?)\$/g, (_, m: string) => tex(m.trim(), false));
  return s.replace(new RegExp(ESC, 'g'), '$');
}
