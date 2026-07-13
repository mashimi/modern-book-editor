#!/usr/bin/env python3
"""typesetting/typeset.py — Python typesetting engine"""
import sys
import json
import re
import os
from pathlib import Path
from io import BytesIO
import markdown
from weasyprint import HTML

SCRIPT_DIR = Path(__file__).resolve().parent
CSS_PATH = SCRIPT_DIR / "book.css"


# ── Helpers ────────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text[:50]


def generate_pdf(json_data: dict) -> None:
    metadata = json_data.get("metadata", {})
    chapters = json_data.get("chapters", [])
    title = metadata.get("title", "Untitled")
    author = metadata.get("author", "Anonymous")

    html_body = f"""
    <section class="frontmatter" id="titlepage">
        <div style="text-align: center; margin-top: 4in; page-break-before: right;">
            <h1 style="font-size: 32pt; border: none; margin: 0; page-break-before: auto;">{title}</h1>
            <p style="font-size: 16pt; margin-top: 1in; text-indent: 0;">{author}</p>
        </div>
    </section>"""

    toc_items = ""
    for i, ch in enumerate(chapters):
        ch_title = ch.get("title", f"Chapter {i+1}")
        ch_id = slugify(ch_title)
        toc_items += f'<li><a href="#{ch_id}"><span class="toc-title">{ch_title}</span><span class="toc-dots"></span></a></li>'

    html_body += f"""
    <nav id="toc" class="frontmatter">
        <h1 style="page-break-before: right; margin-top: 2in; text-align: center;">Contents</h1>
        <ul style="list-style: none; padding: 0; margin-top: 1in;">{toc_items}</ul>
    </nav>"""

    html_body += '<section class="bodymatter">'
    for i, ch in enumerate(chapters):
        ch_title = ch.get("title", f"Chapter {i+1}")
        ch_id = slugify(ch_title)
        content_md = ch.get("content", "")
        content_md = re.sub(r'^#+\s+.*?\n+', '', content_md.strip(), count=1)
        content_html = markdown.markdown(content_md, extensions=["tables", "fenced_code"])
        html_body += f'<h1 id="{ch_id}" class="chapter-title">{ch_title}</h1>{content_html}'
    html_body += "</section>"

    with open(CSS_PATH, "r", encoding="utf-8") as f:
        css_content = f.read()

    toc_css = """
    #toc a[href]::after { content: target-counter(attr(href url), page); margin-left: auto; padding-left: 0.3em; }
    #toc a { display: flex; align-items: baseline; text-decoration: none; color: #000; }
    #toc a .toc-dots { border-bottom: 1px dotted #555; flex: 1 1 auto; margin: 0 0.3em; min-width: 1em; position: relative; top: -2pt; }
    """

    full_html = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>{css_content}{toc_css}</style></head><body>{html_body}</body></html>"""

    buf = BytesIO()
    HTML(string=full_html, base_url=str(SCRIPT_DIR)).write_pdf(buf, presentational_hints=True)
    sys.stdout.buffer.write(buf.getvalue())


if __name__ == "__main__":
    raw = sys.stdin.read()
    data = json.loads(raw)
    generate_pdf(data)

