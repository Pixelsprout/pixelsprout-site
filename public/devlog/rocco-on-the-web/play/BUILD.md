# Orbweaver web build

- Game: ~/playground/kula-web at commit e50bc31
- Engine: rocco v0.14.0 bundles, as named in the game's main.roc header
- Built with: rocco_web.py from rocco-engine branch feat/web-anywhere, run in the kula-web folder
- rocco.js: the feat/web-anywhere copy (click-to-focus fix), because the v0.14.0 bundle's copy lacks it. Rebuild against the release that ships rocco_web.py, then drop this override.
