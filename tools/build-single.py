#!/usr/bin/env python3
"""Lapeeet single-file builder — Phase 0.1/0.2.

Reads www/index.html, inlines local CSS/JS + images, strips dev-only
(isomorphic-git + graphify memory), keeps CDN scripts as-is in v1
(Phase 0.3 vendors them into www/assets/vendor-live/ so later builds inline fully).

Usage:
    python tools/build-single.py --out dist/lapeeet.html [--inline-images] [--min]
"""
import argparse
import base64
import mimetypes
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WWW = ROOT / "www"

# Dev-only script/link patterns — removed from live single-file.
DEV_SCRIPT_PATTERNS = (
    "isomorphic-git",
    "lightning-fs",
    "git-layer.js",
    "lapeeet:git-ready",
    "assets/vendor/http/web/index.js",
)

# UI fragments stripped from live (dev memory UI only).
GIT_STATUS_ROW_RE = re.compile(
    r"\s*\{[^}]*id:\s*['\"]gitStatus['\"].*?\},?\s*\n", re.DOTALL
)
SETTINGS_GIT_CARD_RE = re.compile(
    r"\s*<div class=\"section full mt-2 mb-2\">\s*"
    r"<div class=\"section-title\">Data &amp; Privacy \(Git\)</div>.*?</div>\s*</div>\s*",
    re.DOTALL,
)
GIT_ABOUT_ROWS_RE = re.compile(
    r"\s*<li>Versioned Storage.*?</li>\s*<li>Git Transport.*?</li>\s*<li>Git FS Backend.*?</li>\s*",
    re.DOTALL,
)


def data_uri(path: Path) -> str:
    mime, _ = mimetypes.guess_type(str(path))
    mime = mime or "application/octet-stream"
    raw = path.read_bytes()
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{b64}"


def inline_images(html: str, www: Path, enable: bool) -> str:
    if not enable:
        return html

    def repl(m):
        url = m.group(2)
        if url.startswith(("data:", "http", "https:", "//")):
            return m.group(0)
        f = (www / url.split("?")[0].split("#")[0]).resolve()
        try:
            f.relative_to(www.resolve())
        except ValueError:
            return m.group(0)
        if not f.is_file() or f.stat().st_size > 400_000:
            print(f"  [img] skip {url} (>400KB or missing)", file=sys.stderr)
            return m.group(0)
        print(f"  [img] inline {url} ({f.stat().st_size}B)", file=sys.stderr)
        return m.group(1) + data_uri(f) + m.group(3)

    return re.sub(r'(src="|href=")(assets/img/[^"]+)(")', repl, html)


def build(out: Path, inline_imgs: bool, do_min: bool) -> dict:
    stats = {"inlined_css": 0, "inlined_js": 0, "stripped_dev": 0, "kept_cdn": [],
             "wasm_embedded": False, "wasm_bytes": 0}
    index = WWW / "index.html"
    html = index.read_text(encoding="utf-8")

    # 1. Inline local stylesheets. Local @import url(...) inside the CSS are
    # resolved and inlined too (they 404 when the CSS is inlined at site root).
    # Remote (http) imports are hoisted to the top of the <style> so they stay valid.
    IMPORT_RE = re.compile(r'@import\s+url\(["\']?([^"\')]+)["\']?\)\s*;?')

    def resolve_css_imports(css_text, css_dir):
        http_imports = []

        def imp_repl(m):
            url = m.group(1)
            if url.startswith(('http://', 'https://', '//', 'data:')):
                http_imports.append(m.group(0).rstrip(';') + ';')
                return ''
            target = (css_dir / url.split('?')[0].split('#')[0]).resolve()
            try:
                target.relative_to(WWW.resolve())
            except ValueError:
                print(f"  [css] import outside www: {url}", file=sys.stderr)
                return ''
            if not target.is_file():
                print(f"  [css] import MISSING: {url}", file=sys.stderr)
                return ''
            print(f"  [css] inline @import {url} ({target.stat().st_size}B)", file=sys.stderr)
            return '\n' + target.read_text(encoding='utf-8', errors='replace') + '\n'

        body = IMPORT_RE.sub(imp_repl, css_text)
        head = '\n'.join(http_imports) + ('\n' if http_imports else '')
        return head, body

    def css_repl(m):
        href = m.group(1)
        if href.startswith("http"):
            return m.group(0)
        f = WWW / href
        if not f.is_file():
            print(f"  [css] MISSING {href}", file=sys.stderr)
            return m.group(0)
        css = f.read_text(encoding="utf-8", errors="replace")
        head, body = resolve_css_imports(css, f.parent)
        stats["inlined_css"] += 1
        print(f"  [css] inline {href} ({len(css)} chars)", file=sys.stderr)
        return f"<style>/* inlined: {href} */\n{head}{body}\n</style>"

    html = re.sub(
        r'<link\s+rel="stylesheet"\s+href="(assets/[^"]+\.css)"[^>]*>',
        css_repl,
        html,
    )

    # 2. Scripts: strip dev-only, inline local, keep CDN.
    def js_repl(m):
        src = m.group(1)
        tag = m.group(0)
        if any(p in src or p in tag for p in DEV_SCRIPT_PATTERNS):
            stats["stripped_dev"] += 1
            print(f"  [js] strip dev-only {src[:80]}", file=sys.stderr)
            return "<!-- stripped dev-only -->"
        if src.startswith("http"):
            # Phase 0.3 will vendor these; keep with warning for now.
            if "type=\"module\"" in tag or 'type="module"' in tag:
                return tag  # ionicons ESM stays CDN (UI degrades gracefully)
            stats["kept_cdn"].append(src)
            print(f"  [js] keep CDN {src}", file=sys.stderr)
            return tag
        f = WWW / src
        if not f.is_file():
            print(f"  [js] MISSING {src}", file=sys.stderr)
            return tag
        js = f.read_text(encoding="utf-8", errors="replace")
        stats["inlined_js"] += 1
        print(f"  [js] inline {src} ({len(js)} chars)", file=sys.stderr)
        # Guard against premature </script> close inside JS strings.
        js = js.replace("</script", "<\\/script")
        return f"<script>/* inlined: {src} */\n{js}\n</script>"

    # ESM dev transport block (multiline) — remove whole block first.
    html = re.sub(
        r'<script\s+type="module">\s*import http from.*?lapeeet:git-ready.*?</script>',
        "<!-- stripped dev-only git ESM -->",
        html,
        flags=re.DOTALL,
    )
    stats["stripped_dev"] += 1
    html = re.sub(r'<script\s+src="([^"]+)"[^>]*>\s*</script>', js_repl, html)

    # 3b. Embed sql-wasm.wasm as base64 (true single-file, file:// safe).
    # db-layer.js prefers window.LAPEEET_WASM_B64 over locateFile.
    wasm = WWW / "assets" / "vendor-live" / "sql-wasm.wasm"
    if wasm.is_file():
        raw = wasm.read_bytes()
        b64 = base64.b64encode(raw).decode("ascii")
        # Inject INSIDE the sql-wasm.js script block (separate <script> tags
        # cannot nest — the marker sits inside an open <script> element).
        marker = "/* inlined: assets/vendor-live/sql-wasm.js */"
        if marker in html:
            html = html.replace(marker,
                                "window.LAPEEET_WASM_B64=\"" + b64 + "\";\n" + marker, 1)
            stats["wasm_embedded"] = True
            stats["wasm_bytes"] = len(raw)
            print(f"  [wasm] embedded sql-wasm.wasm ({len(raw)}B -> {len(b64)} b64 chars)",
                  file=sys.stderr)
        else:
            print("  [wasm] SKIP: sql-wasm.js inline marker not found", file=sys.stderr)
    else:
        print("  [wasm] SKIP: vendor-live/sql-wasm.wasm missing", file=sys.stderr)

    # 3c. Strip dev-only UI fragments from inlined ui-components.js + settings.
    html2, n1 = GIT_STATUS_ROW_RE.subn("", html)
    html2, n2 = SETTINGS_GIT_CARD_RE.subn("", html2)
    html2, n3 = GIT_ABOUT_ROWS_RE.subn("", html2)
    stats["stripped_dev"] += n1 + n2 + n3
    html = html2

    # 4. Images (opt-in; default off to keep v1 small — WebView online anyway).
    html = inline_images(html, WWW, inline_imgs)

    # 5. Light min (optional): collapse blank lines only — safe, no semantic change.
    if do_min:
        html = re.sub(r"\n{3,}", "\n\n", html)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    stats["out_bytes"] = out.stat().st_size
    # Static companions that stay external by design:
    # manifest + icons, full app image dir, leaflet control sprites.
    for rel in ("manifest.json",):
        src = WWW / rel
        dst = out.parent / rel
        if src.is_file():
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(src.read_bytes())
            print(f"  [static] copy {rel} ({src.stat().st_size}B)", file=sys.stderr)
    for rel in ("assets/img", "assets/vendor-live/leaflet-images", "assets/vendor-live/routing-images"):
        src = WWW / rel
        # Publish flattened next to index.html: assets/img/* stays, but the
        # inlined CSS references leaflet-images/* and routing-images/* at root.
        dst = out.parent / ("leaflet-images" if rel.endswith("leaflet-images")
                            else "routing-images" if rel.endswith("routing-images")
                            else rel)
        if src.is_dir():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
            n = sum(1 for _ in dst.rglob('*') if _.is_file())
            print(f"  [static] copy dir {rel} -> {dst.name}/ ({n} files)", file=sys.stderr)
    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="dist/lapeeet.html")
    ap.add_argument("--inline-images", action="store_true")
    ap.add_argument("--min", action="store_true")
    args = ap.parse_args()
    out = (ROOT / args.out).resolve()
    print(f"Building {out} from {WWW}/index.html ...", file=sys.stderr)
    stats = build(out, args.inline_images, args.min)
    print("---- build stats ----")
    for k, v in stats.items():
        print(f"{k}: {v if not isinstance(v, list) else len(v)}")
    if stats["kept_cdn"]:
        print("CDN still external (Phase 0.3 will vendor):")
        for u in stats["kept_cdn"]:
            print(f"  - {u}")
    print(f"WROTE {out} ({stats['out_bytes']} bytes)")


if __name__ == "__main__":
    main()
