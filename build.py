"""Rebuild a completely self-contained index.html; Python 3.9+; no dependencies."""
from pathlib import Path
ROOT = Path(__file__).resolve().parent
source = ROOT / 'src'
html = (source / 'template.html').read_text(encoding='utf-8')
for tag, filename in [('STYLES', 'styles.css'), ('MATH', 'math.js'), ('GRAPH', 'graph.js'), ('APP', 'app.js')]:
    html = html.replace(f'/*__{tag}__*/', (source / filename).read_text(encoding='utf-8'))
(ROOT / 'index.html').write_text(html, encoding='utf-8')
print(f'Built index.html ({len(html.encode("utf-8")):,} bytes)')
