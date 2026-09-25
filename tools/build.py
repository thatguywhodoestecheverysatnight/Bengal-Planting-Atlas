#!/usr/bin/env python3
"""Build the Bengal Planting Atlas.

Outputs
  public/index.html          Vercel / static host entry (Three.js served from public/vendor)
  public/vendor/three.min.js Three.js r128, vendored
  public/favicon.svg
  dist/artifact.html         body-only build for hosts that supply their own skeleton (Three.js from cdnjs)
"""
import os, pathlib, shutil
root = pathlib.Path(__file__).resolve().parent.parent
src, pub, dist, ven = root / 'src', root / 'public', root / 'dist', root / 'vendor'
(pub / 'vendor').mkdir(parents=True, exist_ok=True); dist.mkdir(exist_ok=True)
rd = lambda n: (src / n).read_text(encoding='utf-8')
css = rd('styles.css')
order = ['data-districts.js', 'data-env.js', 'data-species.js', 'engine.js', 'map3d.js', 'audio.js', 'fx.js', 'store.js', 'app.js']
js = '\n'.join(rd(n) for n in order)
body = rd('body.html')
fonts = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400;1,6..72,500'
         '&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Noto+Serif+Bengali:wght@400;500&family=Noto+Sans+Bengali:wght@400;500&display=swap">')
title = '<title>Bengal Planting Atlas</title>'
desc = 'Algorithmic species suitability for West Bengal landscapes: pick any point on a 3D relief map and get the tree, shrub and ground cover that will hold there, a planting layout and the monsoon planting window. After Sarthak Chatterjee, Jadavpur University.'
style = '<style>\n' + css + '\n</style>'
app = '<script>\n' + js + '\n</script>'

# artifact build
three_cdn = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>'
(dist / 'artifact.html').write_text(title + fonts + style + '\n' + body + '\n' + three_cdn + '\n' + app, encoding='utf-8')

# static site build
head = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{title}
<meta name="description" content="{desc}">
<meta name="theme-color" content="#06110E">
<meta property="og:title" content="Bengal Planting Atlas">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
{fonts}
{style}
</head>
<body>
'''
page = head + body + '\n<script src="vendor/three.min.js"></script>\n' + app + '\n</body>\n</html>\n'
(pub / 'index.html').write_text(page, encoding='utf-8')
shutil.copy(ven / 'three.min.js', pub / 'vendor' / 'three.min.js')
shutil.copy(ven / 'THREE-LICENSE.txt', pub / 'vendor' / 'THREE-LICENSE.txt')
shutil.copy(ven / 'favicon.svg', pub / 'favicon.svg')
# archive page (shares the design tokens and components)
arc_css = '<style>\n' + css + '\n' + rd('archive.css') + '\n</style>'
arc = head.replace(title, '<title>Palette Archive</title>').replace(style, arc_css).replace('<meta name="description"', '<meta name="robots" content="noindex">\n<meta name="description"')
arc_page = arc + rd('archive-body.html') + '\n<script>\n' + rd('archive.js') + '\n</script>\n</body>\n</html>\n'
(pub / 'archive.html').write_text(arc_page, encoding='utf-8')
for f in [pub / 'archive.html', pub / 'index.html', pub / 'vendor' / 'three.min.js', dist / 'artifact.html']:
    print(f.relative_to(root), os.path.getsize(f), 'bytes')
