# Hanja Vocab specification

- Go SPA listening on configurable `HOST`/`PORT`, default `[::]:8004`
- Embedded Bulma UI with Characters, Vocabulary, and 사자성어 views
- Fixed 3,500-character 어문회 catalog grouped by level; every Hanja is clickable
- Optional server-side AnkiConnect overlay: selectable deck, compatible note type, and Hanja field; known/new/unknown/suspended states
- Vocabulary from bundled KRDict data with text filter, sorting, maximum frequency rank, and Pokémon/NIKL ranks
- Exactly 214 NIKL 사자성어 from section 4.3 of *한국어 교육 어휘 내용 개발(3단계)*; no exam or third-party lists
- Selection save/load via validated atomic files in `data/saves` and browser File System Access with download/upload fallback
- Modular server/client code and automated Go, HTTP, storage, Anki, vocabulary, and JavaScript tests
