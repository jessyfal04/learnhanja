# Vocabulary frequency sources

The vocabulary table uses two independent ranked Hangul lists. They rank KRDict entries; they do not supply the vocabulary spelling or meaning.

## NIKL.json

Source: National Institute of Korean Language (국립국어원), *현대 국어 사용 빈도 조사*, word-frequency index.

The JSON preserves source order. `NULL` and entries marked `_DUP_…` are ignored, while each retained word keeps its original one-based position as its rank.

## Pokémon.json

Source dumps:

- [CPokemon/swsh-text](https://github.com/CPokemon/swsh-text): Korean `common/ko.txt` and `story/ko.txt` from *Pokémon Sword* v1.3.0. The repository notes that Shield-only text may be missing.
- [CPokemon/pla-text](https://github.com/CPokemon/pla-text): Korean `common/ko.txt` and `story/ko.txt` from *Pokémon Legends: Arceus*.

Both upstream dumps credit [kwsch/pkNX](https://github.com/kwsch/pkNX) for text extraction. The local source texts were exact UTF-8 conversions of those four upstream Korean files.

The corpus was processed with KoNLPy/Okt normalization and stemming. Non-Hangul tokens were removed, remaining tokens were counted, and unique forms were ordered by descending frequency.

## Application rule

The app performs an exact lookup of each KRDict Hangul spelling in both lists and exposes both ranks separately. A missing rank is stored as `0` and displayed as blank. Default frequency ordering and the maximum-rank filter use the smaller available nonzero rank.
