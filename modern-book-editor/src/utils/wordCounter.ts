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
