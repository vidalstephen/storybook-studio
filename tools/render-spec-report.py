#!/usr/bin/env python3
"""Render the Storybook Studio specification set into one polished HTML report.

Report tooling only — it does not touch product code. Reads docs/*.md in numbered
order, emits report/index.html (self-contained) plus copies of the markdown.

Usage: python3 tools/render-spec-report.py [--out report]
"""
from __future__ import annotations

import argparse
import html
import json
import pathlib
import re
import shutil
import sys

import markdown

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

TITLE = "Storybook Studio"
SUBTITLE = (
    "Complete architecture and specification set — V1, text-only. "
    "Everything needed to build the product, and how each requirement will be proven."
)

# Docs that are not the numbered set, shown after them.
APPENDIX = {"STORYBOOK-STUDIO-SPEC.md": "Product specification (source, verbatim)"}

START_HERE = [
    ("17-decisions-and-open-questions.html",
     "Decisions and open questions",
     "The one document that asks for your input: 19 decisions taken on your behalf, 8 questions for you, and the spec text that cannot be implemented as written."),
    ("03-technical-architecture.html",
     "Technical architecture",
     "The determinism boundary — what AI does and what conventional code does — and the seven engines as modules."),
    ("05-content-and-composition-model.html",
     "Content and composition model",
     "The heart of the product: how a blueprint becomes beats, blocks, pages and page turns."),
    ("07-lock-and-constraint-rules.html",
     "Lock and constraint rules",
     "What 'this was intentional' means mechanically, and what happens when two intentions collide."),
    ("13-incremental-roadmap.html",
     "Incremental roadmap",
     "Nine phases with checkable exit criteria and two gates: automated tests and your review."),
]

CSS = r"""
:root{
  --paper:#faf7f1; --paper-2:#f3eee4; --surface:#fffdf9;
  --ink:#1d1a15; --ink-2:#4a443a; --ink-3:#6f6759; --rule:#ddd4c4; --rule-2:#e9e2d4;
  --accent:#8a6f47; --accent-2:#6d5533; --ok:#3f6b4f; --warn:#8a5a2b; --bad:#8f3a30; --info:#4a5c72;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
  --shadow:0 1px 2px rgba(29,26,21,.05),0 8px 24px -12px rgba(29,26,21,.18);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0;background:var(--paper);color:var(--ink);
  font:400 16px/1.65 var(--sans);
  -webkit-text-size-adjust:100%;
}
a{color:var(--accent-2);text-decoration:none;text-underline-offset:2px}
a:hover{text-decoration:underline}

/* ---------- shell ---------- */
.shell{display:grid;grid-template-columns:310px minmax(0,1fr);min-height:100vh}
.nav{
  position:sticky;top:0;align-self:start;height:100vh;overflow-y:auto;
  background:var(--paper-2);border-right:1px solid var(--rule);padding:26px 20px 60px;
}
.nav .brand{font:600 11px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
.nav h1{font:400 21px/1.2 var(--serif);margin:10px 0 4px;letter-spacing:-.01em}
.nav .tag{font-size:12px;color:var(--ink-3);margin:0 0 18px}
.nav .counts{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 22px}
.nav .counts span{
  font:500 10.5px/1 var(--mono);letter-spacing:.04em;color:var(--ink-2);
  background:var(--surface);border:1px solid var(--rule);border-radius:999px;padding:5px 8px;
}
.nav ol{list-style:none;margin:0;padding:0;counter-reset:d}
.nav ol>li{margin:0 0 2px}
.nav ol>li>a{
  display:block;padding:7px 9px;border-radius:5px;font-size:13.5px;color:var(--ink-2);line-height:1.35;
}
.nav ol>li>a:hover{background:var(--surface);text-decoration:none;color:var(--ink)}
.nav ol>li>a.on{background:var(--surface);color:var(--ink);font-weight:600;box-shadow:inset 2px 0 0 var(--accent)}
.nav ol>li>a .n{font:500 11px/1 var(--mono);color:var(--ink-3);margin-right:7px}
.nav ul.sub{list-style:none;margin:1px 0 8px 22px;padding:0;border-left:1px solid var(--rule)}
.nav ul.sub li a{display:block;font-size:12px;color:var(--ink-3);padding:3px 0 3px 10px;line-height:1.35}
.nav ul.sub li a:hover{color:var(--ink)}
.nav .foot{border-top:1px solid var(--rule);margin-top:20px;padding-top:14px;font-size:11.5px;color:var(--ink-3)}

main{padding:0 0 90px}
.wrap{max-width:1080px;padding:0 46px}
.topbar{display:none}

/* ---------- hero ---------- */
.hero{border-bottom:1px solid var(--rule);padding:64px 0 44px;margin-bottom:0}
.hero .kicker{font:600 11px/1 var(--mono);letter-spacing:.18em;text-transform:uppercase;color:var(--accent)}
.hero h1{font:400 clamp(34px,5vw,54px)/1.06 var(--serif);letter-spacing:-.022em;margin:14px 0 0}
.hero p.lede{font-size:18px;color:var(--ink-2);max-width:62ch;margin:16px 0 0}
.hero .status{display:flex;flex-wrap:wrap;gap:8px;margin:26px 0 0}
.hero .status span{
  font:500 11.5px/1 var(--mono);letter-spacing:.03em;border-radius:999px;padding:7px 11px;
  background:var(--surface);border:1px solid var(--rule);color:var(--ink-2);font-weight:500;
}
.hero .status span.flag{border-color:var(--accent);color:var(--accent-2)}
.start{margin:38px 0 0;border-top:1px solid var(--rule-2)}
.start h2{font:600 11px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin:22px 0 12px}
.start a.card{
  display:block;border-top:1px solid var(--rule-2);padding:15px 0 14px;color:inherit;
}
.start a.card:hover{text-decoration:none;background:linear-gradient(90deg,rgba(138,111,71,.06),transparent)}
.start a.card b{display:block;font:600 15px/1.3 var(--sans);margin-bottom:3px}
.start a.card b:after{content:" →";color:var(--accent);opacity:0}
.start a.card:hover b:after{opacity:1}
.start a.card span{display:block;font-size:13.5px;color:var(--ink-2);max-width:74ch}

/* ---------- document ---------- */
.doc{border-top:1px solid var(--rule);padding:58px 0 10px;scroll-margin-top:20px}
.doc-head{margin-bottom:26px}
.doc-head .num{font:600 11px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
.doc-head h1{font:400 clamp(26px,3.4vw,38px)/1.12 var(--serif);letter-spacing:-.02em;margin:12px 0 0}
.doc-head .src{font-size:12.5px;color:var(--ink-3);margin:10px 0 0;font-family:var(--mono)}
.meta{
  display:grid;gap:0;border:1px solid var(--rule);border-radius:6px;background:var(--surface);
  margin:20px 0 0;overflow:hidden;
}
.meta div{display:grid;grid-template-columns:190px 1fr;gap:16px;padding:10px 14px;border-top:1px solid var(--rule-2)}
.meta div:first-child{border-top:0}
.meta dt,.meta .k{font:600 10.5px/1.5 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.meta .v{font-size:13.5px;color:var(--ink-2);min-width:0;overflow-wrap:anywhere}

.body{max-width:96ch}
.body h2{
  font:400 24px/1.25 var(--serif);letter-spacing:-.012em;margin:44px 0 10px;padding-top:14px;
  border-top:1px solid var(--rule-2);
}
.body h2:first-child{margin-top:0;border-top:0;padding-top:0}
.body h3{font:600 16.5px/1.3 var(--sans);margin:30px 0 6px;letter-spacing:-.005em}
.body h4{font:600 14px/1.3 var(--sans);margin:22px 0 4px;color:var(--ink-2)}
.body p{margin:0 0 13px;color:var(--ink-2)}
.body strong{color:var(--ink)}
.body ul,.body ol{margin:0 0 14px;padding-left:22px;color:var(--ink-2)}
.body li{margin:0 0 5px}
.body li>ul,.body li>ol{margin-top:5px}
.body blockquote{
  margin:16px 0;padding:2px 0 2px 16px;border-left:2px solid var(--accent);
  color:var(--ink-2);font-style:italic;
}
.body hr{border:0;border-top:1px solid var(--rule-2);margin:34px 0}
.body code{
  font:500 .87em/1.4 var(--mono);background:var(--paper-2);border:1px solid var(--rule-2);
  border-radius:4px;padding:1px 4px;color:var(--ink);
}
.body pre{
  background:var(--surface);border:1px solid var(--rule);border-radius:6px;padding:16px 18px;
  overflow-x:auto;margin:0 0 18px;box-shadow:var(--shadow);
}
.body pre code{background:none;border:0;padding:0;font-size:12.5px;line-height:1.6;color:var(--ink-2);white-space:pre}
.tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 0 20px;background:var(--surface);
  border:1px solid var(--rule);border-radius:6px}
.body table{
  width:100%;min-width:max-content;border-collapse:collapse;margin:0;font-size:13.5px;background:none;
}
.body thead th{
  text-align:left;font:600 10.5px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;
  color:var(--ink-3);background:var(--paper-2);padding:10px 12px;border-bottom:1px solid var(--rule);white-space:nowrap;
}
.body tbody td{padding:9px 12px;border-top:1px solid var(--rule-2);vertical-align:top;color:var(--ink-2)}
.body tbody tr:nth-child(even) td{background:rgba(243,238,228,.42)}
.body tbody td code{font-size:11.8px}
.body table code{white-space:nowrap}
.body a{overflow-wrap:anywhere}

/* inline semantic highlights */
code.tok-req{background:#eef3ee;border-color:#cfe0d2;color:#2f5a3c}
code.tok-dec{background:#f6f0e2;border-color:#e3d5b6;color:#6d5533}
code.tok-find{background:#f7ece9;border-color:#e6cfc9;color:#8f3a30}
code.tok-id{background:#eef1f6;border-color:#d3dae6;color:#41506a}

/* ---------- footer ---------- */
.pagefoot{border-top:1px solid var(--rule);margin-top:70px;padding:26px 0 0;font-size:12.5px;color:var(--ink-3)}
.pagefoot b{font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2);display:block;margin-bottom:6px}

/* ---------- responsive ---------- */
@media(max-width:1080px){
  .shell{grid-template-columns:1fr}
  .nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--rule);padding:16px}
  .nav .panel{display:none}
  .nav.open .panel{display:block;max-height:70vh;overflow-y:auto;margin-top:14px}
  .nav h1{font-size:18px;margin:0}
  .nav .brand,.nav .tag,.nav .counts{display:none}
  .topbar{
    display:flex;align-items:center;justify-content:space-between;gap:12px;
    position:sticky;top:0;z-index:20;background:rgba(250,247,241,.94);
    backdrop-filter:blur(8px);border-bottom:1px solid var(--rule);padding:11px 16px;
  }
  .topbar .t{font:600 13px/1 var(--serif);letter-spacing:-.01em}
  .topbar button{
    font:600 11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accent-2);
    background:var(--surface);border:1px solid var(--rule);border-radius:999px;padding:8px 12px;
  }
  .wrap{padding:0 20px}
  .hero{padding:34px 0 30px}
  .hero p.lede{font-size:16.5px}
  .doc{padding:38px 0 6px}
  .meta div{grid-template-columns:1fr;gap:2px}
  .body{font-size:15.5px}
  .body table{font-size:12.5px;white-space:nowrap}
  .body tbody td,.body thead th{padding:8px 10px}
  .body pre{font-size:11.5px;padding:12px 14px}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media print{
  :root{--paper:#fff;--surface:#fff;--paper-2:#fff}
  .nav,.topbar{display:none!important}
  .shell{grid-template-columns:1fr}
  .wrap{max-width:none;padding:0}
  body{font-size:10.5pt}
  .doc{break-before:page;padding-top:0}
  .body h2,.body h3{break-after:avoid}
  .body table,.body pre,.meta{break-inside:avoid}
  .body a{color:var(--ink)}
}
"""

JS = r"""
(function(){
  var nav=document.querySelector('.nav'), btn=document.querySelector('.topbar button');
  if(btn) btn.addEventListener('click',function(){nav.classList.toggle('open');});

  // highlight the doc currently in view
  var links=[].slice.call(document.querySelectorAll('.nav ol>li>a'));
  var map={};
  links.forEach(function(a){ map[a.getAttribute('href').replace('#','')]=a; });
  var obs=new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(!e.isIntersecting) return;
      var a=map[e.target.id];
      if(!a) return;
      links.forEach(function(x){x.classList.remove('on');});
      a.classList.add('on');
    });
  },{rootMargin:'-15% 0px -75% 0px'});
  document.querySelectorAll('.doc').forEach(function(s){obs.observe(s);});
})();
"""


def slug(rel: str) -> str:
    return pathlib.Path(rel).name[:-3] + ".html"


def inline_highlights(htmltext: str) -> str:
    """Wrap identifier-looking tokens in <code> with a semantic class."""
    placeholders: list[str] = []

    def stash(m: re.Match) -> str:
        placeholders.append(m.group(0))
        return f"\x00{len(placeholders) - 1}\x00"

    # never touch code blocks / spans that markdown already produced
    for m in re.finditer(r"<code>.*?</code>|<pre.*?</pre>", htmltext, re.S):
        stash(m)

    def wrap(pattern: str, cls: str, text_html: str) -> str:
        out, last = [], 0
        for m in re.finditer(pattern, text_html):
            if m.start() < last:
                continue
            out.append(text_html[last:m.start()])
            out.append(f'<code class="{cls}">{m.group(0)}</code>')
            last = m.end()
        out.append(text_html[last:])
        return "".join(out)

    htmltext = wrap(r"\bD-\d{2}\b", "tok-dec", htmltext)
    htmltext = wrap(r"\bQ-\d{2}\b", "tok-dec", htmltext)
    htmltext = wrap(r"\bR-[A-Z]{3}-\d{3}\b", "tok-req", htmltext)
    htmltext = wrap(r"\bT-[A-Z]{3}-\d{3}\b", "tok-req", htmltext)
    htmltext = wrap(r"\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,5}\b", "tok-find", htmltext)
    htmltext = wrap(r"\b(?:prj|blk|beat|pg|lck|tpl|srcref|prop|find|apr|art|job|act|ms|cmp|dsg|val)_[0-9a-fA-Fx]{3,}\b", "tok-id", htmltext)

    for i, original in enumerate(placeholders):
        htmltext = htmltext.replace(f"\x00{i}\x00", original)
    return htmltext


def strip_h1(md_text: str) -> tuple[str, str]:
    """Remove the leading '# Title' so the shell can render its own heading."""
    lines = md_text.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("# "):
            title = line[2:].strip()
            rest = "\n".join(lines[:i] + lines[i + 1:])
            return title, rest
        if line.strip():
            break
    return "", md_text


def parse_meta(md_text: str) -> tuple[list[tuple[str, str]], str]:
    """Pull the **Implements:** / **Deliverable covered:** / **Inherits:** header lines."""
    meta = []
    for m in re.finditer(r"^\*\*(Implements|Deliverable covered|Inherits|Status|Purpose):\*\*\s*(.+)$",
                         md_text, re.M):
        meta.append((m.group(1), m.group(2).strip()))
    # drop them from the body
    body = re.sub(r"^\*\*(Implements|Deliverable covered|Inherits|Status|Purpose):\*\*\s*.+$\n?",
                  "", md_text, flags=re.M)
    return meta, body


def wrap_tables(htmltext: str) -> str:
    """A wide table must scroll inside its own box, never stretch the page."""
    return htmltext.replace("<table>", '<div class="tw"><table>').replace("</table>", "</table></div>")


def md_to_html(text: str) -> str:
    out = markdown.markdown(
        text,
        extensions=["tables", "fenced_code", "attr_list", "sane_lists", "toc", "md_in_html"],
        extension_configs={"toc": {"permalink": False}},
        output_format="html",
    )
    return wrap_tables(out)


def headings(htmltext: str) -> list[tuple[str, str]]:
    out = []
    for m in re.finditer(r'<h2 id="([^"]+)">(.*?)</h2>', htmltext, re.S):
        label = re.sub(r"<[^>]+>", "", m.group(2))
        label = html.unescape(label).strip()
        out.append((m.group(1), label))
    return out


def collect() -> list[dict]:
    docs = []
    numbered = sorted(p for p in DOCS.glob("[0-9][0-9]-*.md"))
    for p in numbered:
        docs.append({"path": p, "label": p.name[3:-3].replace("-", " "), "num": p.name[:2], "appendix": False})
    for name, label in APPENDIX.items():
        p = DOCS / "source" / name
        if p.exists():
            docs.append({"path": p, "label": label, "num": "src", "appendix": True})
    # any other loose document (the reconciliation register) reads as an appendix
    for p in sorted(DOCS.glob("*.md")):
        if not p.name[:1].isdigit():
            docs.append({"path": p, "label": p.name[:-3].replace("-", " ").lower(),
                         "num": "app", "appendix": True})
    return docs


def build(outdir: pathlib.Path) -> int:
    outdir.mkdir(parents=True, exist_ok=True)
    docs = collect()
    renderable = []

    for d in docs:
        raw = d["path"].read_text(encoding="utf-8")
        title, rest = strip_h1(raw)
        meta, body_md = parse_meta(rest)
        htm = md_to_html(body_md)
        htm = inline_highlights(htm)
        d.update({
            "title": title or d["label"].title(),
            "html": htm,
            "meta": meta,
            "heads": headings(htm),
            "slug": slug(str(d["path"])),
            "lines": len(raw.splitlines()),
        })
        renderable.append(d)

    # counts for the hero chips
    dec = re.compile(r"\bD-\d{2}\b")
    qst = re.compile(r"\bQ-\d{2}\b")
    dec_ids, q_ids = set(), set()
    for d in renderable:
        raw = d["path"].read_text(encoding="utf-8")
        dec_ids |= set(dec.findall(raw))
        q_ids |= set(qst.findall(raw))

    req_count = None
    req_file = ROOT / "spec" / "requirements.json"
    if req_file.exists():
        try:
            req_count = len(json.loads(req_file.read_text()))
        except Exception:
            req_count = None

    # ---- nav
    nav_items, sections = [], []
    for d in renderable:
        subs = "".join(
            f'<li><a href="#{d["slug"]}__{hid}">{html.escape(label)}</a></li>'
            for hid, label in d["heads"][:14]
        )
        # h2 ids are global in markdown output; prefix them so nav links work per doc
        for hid, _label in d["heads"]:
            d["html"] = d["html"].replace(f'<h2 id="{hid}">', f'<h2 id="{d["slug"]}__{hid}">')
        nav_items.append(
            f'<li><a href="#{d["slug"]}"><span class="n">{d["num"].upper()}</span>{html.escape(d["title"])}</a>'
            + (f'<ul class="sub">{subs}</ul>' if subs else "")
            + "</li>"
        )
        meta_rows = "".join(
            f'<div><span class="k">{html.escape(k)}</span><span class="v">{v}</span></div>'
            for k, v in d["meta"]
        )
        meta_block = f'<div class="meta">{meta_rows}</div>' if meta_rows else ""
        sections.append(
            f'<section class="doc" id="{d["slug"]}">'
            f'<div class="doc-head">'
            f'<div class="num">Document {d["num"].upper()}{" · appendix" if d["appendix"] else ""}</div>'
            f'<h1>{html.escape(d["title"])}</h1>'
            f'<p class="src">docs/{"source/" if d["appendix"] else ""}{d["path"].name} · {d["lines"]} lines</p>'
            f'</div>{meta_block}<div class="body">{d["html"]}</div></section>'
        )

    start_html = "".join(
        f'<a class="card" href="#{href[:-5]}"><b>{html.escape(t)}</b><span>{html.escape(desc)}</span></a>'
        for href, t, desc in START_HERE
        if (outdir.parent / "docs").exists()
    )

    chips = [f"{len(renderable)} documents"]
    if req_count:
        chips.append(f"{req_count} requirements")
    chips.append(f"{len(dec_ids)} decisions")
    chips.append(f"{len(q_ids)} open questions")
    chips.append("no implementation code")
    chips_html = "".join(
        f'<span class="{"flag" if c.startswith("no ") else ""}">{html.escape(c)}</span>' for c in chips
    )

    import datetime
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    page = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(TITLE)} — specification set</title>
<meta name="description" content="{html.escape(SUBTITLE)}">
<style>{CSS}</style>
</head><body>
<div class="topbar"><span class="t">{html.escape(TITLE)} — specification set</span>
<button type="button">Contents</button></div>
<div class="shell">
<nav class="nav">
  <div class="brand">Specification set</div>
  <h1>{html.escape(TITLE)}</h1>
  <p class="tag">V1 — text-only storybook studio</p>
  <div class="panel">
    <div class="counts">{chips_html}</div>
    <ol>{''.join(nav_items)}</ol>
    <div class="foot">Rendered {stamp} from <code>docs/</code>. Report tooling, not product code.</div>
  </div>
</nav>
<main>
<div class="wrap">
  <header class="hero">
    <div class="kicker">Architecture for review</div>
    <h1>{html.escape(TITLE)}</h1>
    <p class="lede">{html.escape(SUBTITLE)}</p>
    <div class="status">{chips_html}</div>
    <div class="start">
      <h2>Start here</h2>
      {start_html}
    </div>
  </header>
  {''.join(sections)}
  <div class="pagefoot">
    <b>End of set</b>
    Every statement in this set either cites a section of the supplied product specification or one of the numbered
    decisions. Anything that does neither is a defect in this set — report it and it will be fixed.
  </div>
</div>
</main></div>
<script>{JS}</script>
</body></html>
"""
    (outdir / "index.html").write_text(page, encoding="utf-8")

    # ship the markdown alongside so the report is self-describing
    md_out = outdir / "docs"
    md_out.mkdir(exist_ok=True)
    for d in renderable:
        from_source = d["path"].parent.name == "source"
        target = md_out / ("source-" + d["path"].name if from_source else d["path"].name)
        shutil.copy2(d["path"], target)

    total = sum(d["lines"] for d in renderable)
    print(f"rendered {len(renderable)} documents, {total} lines -> {outdir/'index.html'}")
    print(f"bytes: {(outdir/'index.html').stat().st_size:,}")
    for d in renderable:
        print(f"  {d['num']:>3}  {d['lines']:>5} lines  {d['title'][:64]}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="report")
    args = ap.parse_args()
    sys.exit(build((ROOT / args.out).resolve()))
