# Hanja Vocab

Web app for selecting a fixed Hanja level catalog, overlaying local Anki state, and building KRDict vocabulary.

## Run

Requirements: Go 1.24+. Anki with AnkiConnect is optional and only supplies study state in the browser.

```bash
make run
```

Open `https://local.jessyfal04.dev`. The server listens on all interfaces at port `8004` so the VPS can reach it through WireGuard. For direct access, use `http://127.0.0.1:8004`.

```bash
go run ./server/main -port 8090
```

### Docker

Build and run the default image at `http://127.0.0.1:8004`:

```bash
make docker-build
make docker-run
```

The default image reference is `jessyfal04/hanja:tagname`. Override it with `IMAGE=... TAG=...`, or publish it with `make docker-push`.

The static catalog contains 3,500 characters in 14 어문회 levels. The first tab contains local Anki and file connections; character selection is kept in the second tab. Choose an Anki deck, a compatible note type, and its Hanja field to overlay status.

Connecting to Anki or pressing **한자 상태 새로고침** selects only catalog characters with learned (학습함) cards. Vocabulary for the current selection is calculated in the background and is ready in the 어휘 tab without changing the active tab. Further selection changes recalculate it. Opening a saved selection file restores its selected characters instead of replacing them with the automatic Anki selection.

The 사자성어 view combines 247 entries from [*꼭 시험에 나오는 고사성어*](https://product.kyobobook.co.kr/detail/S000215142650), 214 entries in section 4.3 of the National Institute of Korean Language report [*한국어 교육 어휘 내용 개발(3단계)*](https://www.korean.go.kr/front/reportData/reportDataView.do?report_seq=800), 75 entries from Darakwon's [*한자능력검정시험 마스터 6급·6급Ⅱ*](https://product.kyobobook.co.kr/detail/S000000525684), labeled **어문회 6급 (마스터)**, and 76 entries from Sidae Education's [*어문회 한자능력검정시험 6급 한 권으로 끝내기*](https://product.kyobobook.co.kr/detail/S000216865870), labeled **어문회 6급 (한권)**. Shared idioms are shown once, producing 447 unique entries. The combined list is the default source, and source filtering keeps each original list available. Each row has a compact information button for its source links. Click an idiom's Hanja to open 한자 탐구. A separate Anki deck, note type, and whole-idiom field can overlay known/new status. Hanja compatibility forms are normalized when matching. The view also supports Hangul/Hanja filtering, source-order or alphabetical sorting, selection coverage, and adding an idiom's Hanja to the active selection.

The idiom level filter assigns each entry the level of its hardest character in the 14-level catalog. A selected level includes all easier levels (7급 includes 8급). Partial spellings, alternate spellings, and entries containing characters outside the catalog appear under **급수 미상**. The level filter combines with the existing source, search, and selection filters; the assigned level is visible in each row.

Source: [국립국어원 report page](https://www.korean.go.kr/front/reportData/reportDataView.do?report_seq=800), 공공누리 제4유형 (출처표시, 비상업적 이용, 변경금지).

## Character insights

Open **한자 탐구** (`#insights`) and paste a character, word, or mixed sentence. Click a Hanja spelling in the **어휘**, **사자성어**, or 탐구 results to open it directly in this tab with the word already filled in. Analyze up to 64 distinct Hanja. The tab shows:

- Compact character cards with Korean 훈음, Unihan kDefinition, level, radical, stroke count, and Anki status shown directly on the colored level badge
- Related KRDict vocabulary, ordered by frequency, with a simple text search and character buttons to narrow the results
- Related idioms, with original source information available on hover
- Add one character or all input characters to the existing study selection

Analysis does not require Anki. It does not change the selection until an add button is clicked, and never edits Anki cards. Level badges use AnkiConnect status from the deck, note type, and character field chosen in the connections tab: green for learned (at least one non-new card), blue for new cards, amber for no matching note, and neutral for unverified or unknown card state. Suspensions remain labeled separately. Insights loads status automatically when Anki configuration becomes ready and offers its own refresh button; the connected deck is available on hover. Changing Anki configuration clears the previous overlay and stale in-flight results are ignored. Unicode compatibility forms are matched with NFKC while original input forms remain visible. Simplified/traditional spellings and other distinct variant characters are not automatically merged. This is a reference lookup, not a sentence translator, and missing dictionary entries are not evidence that a word does not exist.

The lazily loaded `client/data/insights.json` focuses on Korean Hanja: local `HanjaLevels` 훈음, radicals, and stroke counts (snapshot 2026-09-19), supplemented by Korean readings, stroke counts, and kDefinition from [Unicode Unihan 17.0.0](https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip). Chinese/Japanese readings and foreign study references are excluded. Related vocabulary uses KRDict Korean definitions; the original vocabulary tab retains its English translations. Unihan kDefinition is displayed as the original English gloss. The explicit 旣/既 variant link comes from the [Taiwan Ministry of Education character-variant dictionary](https://dict.variants.moe.edu.tw/dictView.jsp?ID=19555&la=0). Missing reference fields are shown explicitly. Existing source datasets are preserved.

To rebuild the snapshot using your local export and the pinned Unihan archive:

```bash
python3 scripts/build_insights.py --cjk-data /path/to/learnCJK.dev/backend/data --unihan /path/to/Unihan-17.0.0.zip
```

The generated asset is self-contained; the running app does not depend on the other checkout or Python. Unicode data is covered by the [Unicode license](client/data/unicode-license.txt).

## Data sources and processing

### Hanja levels

`client/data/levels.json` is a static snapshot of the 어문회 `Grade` field taken on 2026-09-09. It contains 3,500 characters across 14 levels.

### Idioms

- *꼭 시험에 나오는 고사성어*: 247 entries
- National Institute of Korean Language (NIKL), *한국어 교육 어휘 내용 개발(3단계)* section 4.3: 214 entries
- `master_6.tsv`: 75 Hanja and Korean readings from Darakwon's *한자능력검정시험 마스터 6급·6급Ⅱ*
- `onebook_6.tsv`: 76 Hanja and Korean readings from Sidae Education's *어문회 한자능력검정시험 6급 한 권으로 끝내기*
- Entries shared by the lists appear once but retain all source labels, resulting in 447 unique entries
- The original inputs remain in `data/idioms`; the browser reads the merged static `client/data/idioms.json`
- Run `python3 scripts/merge_idiom_sources.py` to merge both preserved 어문회 TSVs into the browser catalog

### Vocabulary

Vocabulary content and frequency are deliberately separate:

1. The word, Hanja spelling, and English meanings come from the 2025-12-19 XML ZIP obtained through the official [KRDict full-dictionary download](https://krdict.korean.go.kr/download/downloadPopup). The app does not scrape the website. Rows without a pure-Hanja spelling are excluded. Rows with the same Hanja and Hangul spelling are deduplicated and their meanings are merged.
2. Only entries whose complete Hanja spelling can be made from the selected characters are returned.
3. The Hangul spelling is looked up exactly in two independent ranked lists:
   - **NIKL rank:** the word index from the National Institute of Korean Language's *현대 국어 사용 빈도 조사*. Null markers and marked duplicate spellings are ignored.
   - **Pokémon rank:** Korean `common/ko.txt` and `story/ko.txt` from [CPokemon/swsh-text](https://github.com/CPokemon/swsh-text) (*Pokémon Sword* v1.3.0) and [CPokemon/pla-text](https://github.com/CPokemon/pla-text) (*Pokémon Legends: Arceus*), normalized and stemmed with KoNLPy/Okt, restricted to Hangul tokens, counted, and ordered by descending frequency. The upstream dumps credit [kwsch/pkNX](https://github.com/kwsch/pkNX) for extraction.
4. Both ranks remain visible. A blank means that spelling is absent from that list. The default frequency sort and maximum-rank filter use the smaller available rank; entries absent from both lists come last.

The frequency assets and a compact explanation are in `data/freq`; the KRDict conversion command is documented in `data/kr-dict_hanja/README.md`.

## Configuration

| Environment | Default |
|---|---|
| `HOST` | `::` |
| `PORT` | `8004` |
| `DATA_DIR` | `data` |

Equivalent command-line flags are available. Flags override environment values.

## Study state

- `known`: at least one matching card is not new
- `new`: matching cards are new and none are known
- `unknown`: a note exists but no matching card state is returned
- suspended cards are marked separately

AnkiConnect calls are made directly by browser JavaScript to `http://127.0.0.1:8765`. On first use, approve the website origin in Anki's permission dialog. Status reads do not alter the Anki collection.

## Selection file

- In browsers with the File System Access API, connect a JSON file once and every selection change is written to it automatically
- The file handle is remembered locally when the browser permits it
- Browsers without file-handle support fall back to manual JSON download and upload

## Server dependency

The Go server only serves the embedded web client and handles `POST /api/vocab` and `POST /api/insights/vocab`. The latter returns all dictionary entries containing any supplied character (up to 256 characters), rather than requiring every character to be selected. Hanja levels and idioms are explicit static JSON assets; Anki metadata, fields, Hanja status, idiom status, and selection files stay local to the browser.

## Test and build

```bash
make test
make build
```

The test target runs Go unit/integration/HTTP tests, JavaScript unit tests, and JavaScript syntax checks.

## Layout

- `server/vocab`: KRDict and frequency data
- `server/api`: vocabulary API and static hosting
- `server/model`: vocabulary response models
- `server/main`: executable entrypoint
- `client/data`: explicit static Hanja and idiom catalogs
- `client`: embedded Bulma interface and modular JavaScript, including direct AnkiConnect and local-file handling
- `data/idioms`: preserved source lists used to build the static idiom catalog
- `data/freq`: NIKL and Pokémon ranked Hangul lists
- `data/kr-dict_hanja`: KRDict dump, converter, and generated Hanja vocabulary TSV
