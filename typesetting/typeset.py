#!/usr/bin/env python3
"""typesetting/typeset.py — Python typesetting engine

Reads a book manuscript JSON (matching the Zod BookSchema shape) from
stdin and produces a print-ready PDF using WeasyPrint + the book.css
stylesheet.  Features:
  - Automatic Table of Contents with clickable page numbers
  - Full-bleed and captioned image support (inline base64)
  - Professional typography with crop marks
"""

import sys
import json
import re
import markdown
from weasyprint import HTML


# ── Helpers ────────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    """Convert arbitrary text into a URL-safe id (max 50 chars)."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text[:50]


def generate_toc_css() -> str:
    """Extra CSS needed for the target-counter TOC page numbers."""
    return """
/* ── TOC: auto page numbers via target-counter ───────────────────── */
#toc a[href]::after {
    content: target-counter(attr(href url), page);
    margin-left: auto;
    padding-left: 0.3em;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
#toc a {
    display: flex;
    align-items: baseline;
    text-decoration: none;
    color: #000;
    border-bottom: none;
}
#toc a .toc-dots {
    border-bottom: 1px dotted #555;
    flex: 1 1 auto;
    margin: 0 0.3em;
    min-width: 1em;
    position: relative;
    top: -2pt;
}
#toc a .toc-title {
    white-space: nowrap;
    padding-right: 0.3em;
}
"""


# ── Main ───────────────────────────────────────────────────────────────────

def generate_pdf(json_data: dict) -> str:
    metadata = json_data.get("metadata", {})
    chapters = json_data.get("chapters", [])

    # ------------------------------------------------------------------
    # 1. Build the HTML body
    # ------------------------------------------------------------------
    title = metadata.get("title", "Untitled")
    author = metadata.get("author", "Anonymous")

    # --- Front Cover (full-bleed) ---
    # Replace the image src below with your cover file path.
    # For a 6×9 book, use an image at least 1950×2925 px (300 DPI).
    html_body = """
    <section class="cover" id="cover">
        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; text-align: center; color: #fff;">
            <!--
              🖼️ FRONT COVER IMAGE
              Uncomment and update the path to your cover image:
              <img src="file:///path/to/your/cover.jpg" alt="Cover" class="full-bleed" style="width: 100%; height: 100%; object-fit: cover;" />
            -->
            <div style="padding: 1in;">
                <h1 style="font-size: 28pt; color: #000; margin: 0; border: none;">{title}</h1>
                <p style="font-size: 14pt; color: #333; margin-top: 0.5in; text-indent: 0;">{author}</p>
            </div>
        </div>
    </section>
    """

    # --- Title page (Front Matter) ---
    html_body += f"""
    <section class="frontmatter" id="titlepage">
        <div style="text-align: center; margin-top: 4in; page-break-before: right;">
            <h1 style="font-size: 32pt; border: none; margin: 0; page-break-before: auto;">
                {title}
            </h1>
            <p style="font-size: 16pt; margin-top: 1in; text-indent: 0;">
                {author}
            </p>
            <p style="font-size: 10pt; margin-top: 2in; text-indent: 0; color: #666;">
                {metadata.get("trimSize", "6×9in")}
            </p>
        </div>
    </section>
    """

    # --- Table of Contents ---
    toc_items = ""
    for i, ch in enumerate(chapters):
        ch_title = ch.get("title", f"Chapter {i+1}")
        ch_id = slugify(ch_title)
        toc_items += f"""
        <li>
            <a href="#{ch_id}">
                <span class="toc-title">{ch_title}</span>
                <span class="toc-dots"></span>
            </a>
        </li>
        """

    html_body += f"""
    <nav id="toc" class="frontmatter">
        <h1 style="page-break-before: right; margin-top: 2in; text-align: center;">Contents</h1>
        <ul style="list-style: none; padding: 0; margin-top: 1in;">
            {toc_items}
        </ul>
    </nav>
    """

    # --- Chapters ---
    html_body += '<section class="bodymatter">'
    for i, ch in enumerate(chapters):
        ch_title = ch.get("title", f"Chapter {i+1}")
        ch_id = slugify(ch_title)
        content_md = ch.get("content", "")

        content_html = markdown.markdown(
            content_md,
            extensions=["tables", "fenced_code"],
        )

        html_body += f"""
        <h1 id="{ch_id}" class="chapter-title">{ch_title}</h1>
        {content_html}
        """
    html_body += "</section>"

    # ------------------------------------------------------------------
    # 2. Wrap in a full HTML document with the CSS stylesheet
    # ------------------------------------------------------------------
    with open("typesetting/book.css", "r", encoding="utf-8") as f:
        css_content = f.read()

    full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <style>{css_content}
{generate_toc_css()}</style>
</head>
<body>
{html_body}
</body>
</html>"""

    # ------------------------------------------------------------------
    # 3. Render the PDF
    # ------------------------------------------------------------------
    output_path = "output_book.pdf"
    HTML(string=full_html).write_pdf(
        output_path,
        presentational_hints=True,
        pdf_forms=True,     # Enables clickable hyperlinks in the PDF
    )
    print(f"✓ PDF generated at {output_path}", file=sys.stderr)
    return output_path


if __name__ == "__main__":
    raw = sys.stdin.read()
    data = json.loads(raw)
    generate_pdf(data)
    # Write the PDF binary to stdout so Node.js can pipe it to the client
    with open("output_book.pdf", "rb") as f:
        sys.stdout.buffer.write(f.read())

