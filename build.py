"""Inline src/ into a single page.

dist/invisible-stormreach.html  the claude.ai artifact (no doctype: the host adds the skeleton)
dist/preview.html               the same page with that skeleton, to open locally
dist/site/                      the standalone site (GitHub Pages): head metadata, three.js bundled from vendor/
"""
import re
import shutil
from pathlib import Path

root = Path(__file__).parent
src = root / "src"
order = ["content.js", "data.js", "plan.js", "audio.js", "scene.js", "app.js"]
tpl = (src / "template.html").read_text(encoding="utf8")
css = (src / "styles.css").read_text(encoding="utf8")
parts = [(src / f).read_text(encoding="utf8") for f in order]
for f, t in zip(order, parts):
    if "</script" in t.lower():
        raise SystemExit(f"{f} contains '</script', which would end its inline block.")
js = "\n</script>\n<script>\n".join(parts)
out = tpl.replace("/*STYLES*/", css).replace("/*SCRIPTS*/", js)
dist = root / "dist"
dist.mkdir(exist_ok=True)
(dist / "invisible-stormreach.html").write_text(out, encoding="utf8")
print(f"built dist/invisible-stormreach.html ({len(out)//1024} KB)")

RESET = '<style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>'
SKELETON = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'

# A local preview with the same skeleton the artifact host adds (doctype, charset, viewport).
(dist / "preview.html").write_text(SKELETON + RESET + '</head><body>' + out + '</body></html>', encoding="utf8")

# The standalone site: the template's leading title/meta/link lines move into <head>, and three.js loads from vendor/.
SITE_URL = "https://andruc.github.io/invisible-stormreach/"
m = re.match(r"\s*((?:<(?:title|meta|link)\b[^\n]*\n)+)", out)
if not m:
    raise SystemExit("template must start with its <title>/<meta>/<link> lines")
head, body = m.group(1), out[m.end():]
body, n = re.subn(r"https://cdn\.jsdelivr\.net/npm/three@0\.147\.0/(?:build|examples/js/\w+)/", "vendor/three/", body)
if n != len(list((root / "vendor" / "three").glob("*.js"))):
    raise SystemExit(f"rewrote {n} three.js URLs; vendor/three has a different number of scripts")
desc = re.search(r'<meta name="description" content="([^"]*)"', head).group(1)
og = (f'<link rel="canonical" href="{SITE_URL}">'
      '<meta property="og:type" content="website"><meta property="og:title" content="Invisible Stormreach">'
      f'<meta property="og:description" content="{desc}"><meta property="og:url" content="{SITE_URL}">'
      f'<meta property="og:image" content="{SITE_URL}og.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
      '<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#0b1214">\n')
site = dist / "site"
if site.exists():
    shutil.rmtree(site)
shutil.copytree(root / "vendor" / "three", site / "vendor" / "three")
if (root / "site-assets").exists():
    for f in (root / "site-assets").iterdir():
        shutil.copy(f, site / f.name)
(site / "index.html").write_text(SKELETON + head + og + RESET + '</head><body>' + body + '</body></html>', encoding="utf8")
print(f"built dist/site/ ({len(body)//1024} KB page, three.js from vendor/three)")
