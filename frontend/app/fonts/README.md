# Fonts

`app/layout.tsx` loads these with `next/font/local`, so builds never download fonts.

| File | Family | Weights | sha256 (first 16) |
| --- | --- | --- | --- |
| inter-latin.woff2 | Inter (variable) | 100 to 900 | c940764593d0fe5d |
| ibm-plex-sans-latin.woff2 | IBM Plex Sans (variable) | 400 to 700 | 056e4e2459f57a00 |
| jetbrains-mono-latin.woff2 | JetBrains Mono (variable) | 100 to 800 | 1e06740a02a443fb |

- **Source:** the latin subset files Google Fonts served to `next/font/google` on 2026-11-26, byte for byte.
- **Licence:** SIL Open Font License 1.1, one `OFL-*.txt` per family, from github.com/google/fonts.
- **Coverage:** latin only. Letters outside it (ł, ő, ş, Cyrillic, Greek) use the fallback font. The site's text and the knowledge docs had none on 2026-11-26.
- **Updating a font** changes glyphs, so the screenshot baselines need regenerating and approving.
