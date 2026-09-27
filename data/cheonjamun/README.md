# 천자문 data

`wikisource.txt` preserves the 125 paired lines and textual-variant markup from the Chinese Wikisource transcription of Zhou Xingsi's *Thousand Character Classic*.

- Source: <https://zh.wikisource.org/w/index.php?title=千字文&oldid=5752664>
- Retrieved: 2026-09-27
- Work status: public domain
- Transcription terms: CC BY-SA 4.0

The first value in each `{{另|display|alternatives}}` expression is the displayed source text. The alternatives are retained as metadata. `scripts/build_cheonjamun.py` selects a separate study-match character from the existing 어문회 or insight catalogs without changing the displayed text.

Rebuild and validate the browser asset with:

```bash
python3 scripts/build_cheonjamun.py
python3 scripts/build_cheonjamun.py --check
```
