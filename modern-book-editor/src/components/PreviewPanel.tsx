import React, { useMemo } from 'react';
import { useBookStore } from '../store/useBookStore';
import { countWords } from '../utils/wordCounter';

export const PreviewPanel: React.FC = () => {
  const { chapters, activeChapterId, bookTitle, author, theme } = useBookStore();
  const activeChapter = chapters.find(c => c.id === activeChapterId);

  const previewHtml = useMemo(() => {
    if (!activeChapter?.content) return '<p style="color: #999;">No content to preview</p>';
    
    const renderNode = (node: any): string => {
      if (!node) return '';
      if (node.type === 'text') {
        let text = node.text || '';
        if (node.marks) {
          for (const mark of node.marks) {
            if (mark.type === 'bold') text = `<strong>${text}</strong>`;
            else if (mark.type === 'italic') text = `<em>${text}</em>`;
            else if (mark.type === 'code') text = `<code>${text}</code>`;
            else if (mark.type === 'strike') text = `<del>${text}</del>`;
          }
        }
        return text;
      }
      
      const children = (node.content || []).map(renderNode).join('');
      
      switch (node.type) {
        case 'doc': return children;
        case 'paragraph': return `<p>${children}</p>`;
        case 'heading': return `<h${node.attrs?.level || 1}>${children}</h${node.attrs?.level || 1}>`;
        case 'bulletList': return `<ul>${children}</ul>`;
        case 'orderedList': return `<ol>${children}</ol>`;
        case 'listItem': return `<li>${children}</li>`;
        case 'blockquote': return `<blockquote>${children}</blockquote>`;
        case 'codeBlock': return `<pre><code>${children}</code></pre>`;
        case 'horizontalRule': return '<hr />';
        case 'hardBreak': return '<br />';
        case 'image': return `<figure><img src="${node.attrs?.src || ''}" alt="${node.attrs?.alt || ''}" style="max-width:100%" />${node.attrs?.caption ? `<figcaption>${node.attrs.caption}</figcaption>` : ''}</figure>`;
        default: return children;
      }
    };
    
    return renderNode(activeChapter.content);
  }, [activeChapter]);

  const bgClass = theme === 'dark' ? 'bg-zinc-800 text-zinc-200' : theme === 'sepia' ? 'bg-[#fdf9f0] text-amber-950' : 'bg-white text-zinc-800';

  return (
    <div className={`h-full overflow-y-auto ${bgClass}`}>
      <div className="max-w-2xl mx-auto py-12 px-8">
        {activeChapter ? (
          <>
            <h1 className="text-3xl font-bold font-serif mb-2">{activeChapter.title}</h1>
            <div className="text-sm opacity-60 mb-8 border-b pb-4">
              {bookTitle} &middot; {author || 'Unknown'} &middot; {countWords(activeChapter.content).toLocaleString()} words
            </div>
            <div 
              className="prose prose-zinc max-w-none font-serif text-lg leading-relaxed"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </>
        ) : (
          <div className="text-center py-20 opacity-50">
            <p>Select a chapter to preview</p>
          </div>
        )}
      </div>
    </div>
  );
};
