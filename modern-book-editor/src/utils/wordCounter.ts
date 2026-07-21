import type { JSONContent } from '@tiptap/react';

/**
 * Traverses a TipTap JSONContent tree and extracts all text content.
 */
export function extractTextFromJSON(json: JSONContent | null): string {
  if (!json) return '';
  let text = '';

  function traverse(node: any) {
    if (node.type === 'text' && typeof node.text === 'string') {
      text += ' ' + node.text;
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  }

  traverse(json);
  return text.trim();
}

/**
 * Counts the number of words in a TipTap JSONContent object.
 */
export function countWords(json: JSONContent | null): number {
  const text = extractTextFromJSON(json);
  if (!text) return 0;
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Counts the number of characters (including spaces) in a TipTap JSONContent object.
 */
export function countCharacters(json: JSONContent | null): number {
  const text = extractTextFromJSON(json);
  return text.length;
}

/**
 * Converts simple markdown text into a TipTap/ProseMirror-compatible JSON
 * content tree. Supports: paragraphs, headings (# ## ###), bold (**text**),
 * italic (*text*), bullet lists, ordered lists, blockquotes, code blocks,
 * horizontal rules, and inline code (`code`).
 *
 * This avoids the fragile HTML parser path (marked → HTML → setContent) and
 * directly constructs the JSON structure that TipTap expects. Use this for
 * importing AI-generated markdown content into the editor.
 */
export function markdownToProseMirror(md: string): JSONContent {
  const doc: JSONContent = { type: 'doc', content: [] };
  if (!md) return doc;

  const lines = md.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Heading ──────────────────────────────────────────
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      doc.content!.push({
        type: 'heading',
        attrs: { level },
        content: parseInlineMarkdown(text),
      });
      i++;
      continue;
    }

    // ── Horizontal Rule ──────────────────────────────────
    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      doc.content!.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    // ── Code Block ───────────────────────────────────────
    if (/^```/.test(line)) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      doc.content!.push({
        type: 'codeBlock',
        content: [{ type: 'text', text: codeLines.join('\n') }],
      });
      continue;
    }

    // ── Blockquote ───────────────────────────────────────
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      doc.content!.push({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: parseInlineMarkdown(quoteLines.join('\n')) }],
      });
      continue;
    }

    // ── Bullet List ──────────────────────────────────────
    if (/^[-*+]\s/.test(line)) {
      const listItems: JSONContent[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^[-*+]\s+/, '');
        listItems.push({ type: 'listItem', content: [{ type: 'paragraph', content: parseInlineMarkdown(itemText) }] });
        i++;
      }
      doc.content!.push({ type: 'bulletList', content: listItems });
      continue;
    }

    // ── Ordered List ─────────────────────────────────────
    if (/^\d+[.)]\s/.test(line)) {
      const listItems: JSONContent[] = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^\d+[.)]\s+/, '');
        listItems.push({ type: 'listItem', content: [{ type: 'paragraph', content: parseInlineMarkdown(itemText) }] });
        i++;
      }
      doc.content!.push({ type: 'orderedList', content: listItems });
      continue;
    }

    // ── Empty Line (paragraph separator) ─────────────────
    if (line.trim() === '') {
      i++;
      continue;
    }

    // ── Paragraph (default) ──────────────────────────────
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      const l = lines[i];
      if (/^(#{1,6}\s|```|---|\*\*\*|___|> |[-*+]\s|\d+[.)]\s)/.test(l)) break;
      paraLines.push(l);
      i++;
    }
    if (paraLines.length > 0) {
      doc.content!.push({
        type: 'paragraph',
        content: parseInlineMarkdown(paraLines.join(' ')),
      });
    }
  }

  return doc;
}

// ── Inline Markdown Parser (bold, italic, code) ────────────────
function parseInlineMarkdown(text: string): JSONContent[] {
  if (!text) return [{ type: 'text', text: '' }];
  const nodes: JSONContent[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
  let lastIndex = 0;

  text.replace(regex, (match: string, _b: string, boldText: string, _i: string, italicText: string, _c: string, codeText: string, offset: number) => {
    if (offset > lastIndex) {
      nodes.push({ type: 'text', text: text.slice(lastIndex, offset) });
    }
    if (boldText) {
      nodes.push({ type: 'text', text: boldText, marks: [{ type: 'bold' }] });
    } else if (italicText) {
      nodes.push({ type: 'text', text: italicText, marks: [{ type: 'italic' }] });
    } else if (codeText) {
      nodes.push({ type: 'text', text: codeText, marks: [{ type: 'code' }] });
    }
    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    nodes.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return nodes.length > 0 ? nodes : [{ type: 'text', text }];
}
