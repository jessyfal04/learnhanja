# Hanja Vocab specification

- Go SPA listening on configurable `HOST`/`PORT`, default `[::]:8004`
- Embedded Bulma UI with Characters and Vocabulary views
- Fixed 3,500-character 어문회 catalog grouped by level; every Hanja is clickable
- Optional server-side AnkiConnect overlay: selectable deck, compatible note type, and Hanja field; known/new/unknown/suspended states
- Vocabulary from bundled KRDict data with text filter, sorting, maximum frequency rank, and Pokémon/NIKL ranks
- Selection save/load via validated atomic files in `data/saves` and browser File System Access with download/upload fallback
- Modular server/client code and automated Go, HTTP, storage, Anki, vocabulary, and JavaScript tests
