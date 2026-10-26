# LearnHanja

LearnHanja is a self-hosted web app for studying Korean Hanja.

- Select characters from the 3,500-character 어문회 catalog
- Overlay your local Anki study state
- Discover KRDict vocabulary made from the selected characters
- Read the 천자문 as an Anki-aware, ordered learning path
- Browse and filter 447 unique 사자성어
- Explore readings, meanings, radicals, stroke counts, related words, and idioms
- Practice known Hanja and Migaku vocabulary with two browser-only games
- Read Korean with optional Hanja substitutions in **한자 몰입 읽기**, including **문맥 복습** for recently missed 독음 cards
- Generate TOPIK II PBT reading questions for a selected part, or practice locally extracted past-paper EPUBs, one question at a time with immediate feedback, an elapsed clock, and browser-local history
- Save your selection as a local JSON file

The interface is in Korean. Anki is optional: the catalogs, vocabulary search, and character exploration work without it.

## Why the client/server split matters

LearnHanja keeps Anki and Migaku study state in the browser. The Go server serves static catalogs and handles optional AI reading and mock-exam requests.

### Done in the browser (client side)

- Render the interface and hold the current selection
- Lazily load the static Hanja, idiom, character-insight, and vocabulary catalogs
- Find words made entirely from the selected Hanja
- Find words containing any Hanja queried in 한자 탐구
- Rank, filter, and sort vocabulary and idioms
- Connect directly to AnkiConnect at `http://127.0.0.1:8765`
- Read deck names, note types, fields, and card states from local Anki
- Derive learned, new, suspended, and unmatched study states
- Read and write local JSON selection files
- Remember an approved file handle in the browser, when supported
- Convert pasted Korean text to conservative, unambiguous KRDict Hanja spellings without a server request
- Store contextual reading exposure and completed sessions in local browser storage

### Done by the Go server (server side)

- Serve the embedded HTML, CSS, JavaScript, and static JSON catalogs
- Expose a health-check endpoint
- Validate AI reader targets against the bundled KRDict catalog and call OpenAI Responses API when configured

### Deliberately not sent to the server

- Anki deck names
- Note-type and field names
- Note IDs or card states
- Learned/new/suspended status maps
- Selection-file contents or file handles
- AnkiConnect credentials or configuration
- Selected or queried Hanja, except the small target-word set deliberately sent for an AI reading request
- Vocabulary searches and results

This design lets a remotely hosted LearnHanja page talk to Anki running on the learner's own computer. AnkiConnect must allow the website's origin, but the LearnHanja server itself never sits between the browser and Anki. Vocabulary searches also remain in the browser after the static catalog has loaded.

The server has no accounts or user database. AI reading requests send the chosen subject, length, up to 40 target words, up to 35 familiar words, and up to 8 recent words through the Go server to OpenAI. They do not send the whole Anki collection, Migaku database, or pasted offline text. The reader endpoint accepts same-origin browser requests and limits each client address to 20 generations per hour and the whole server to 60 per day. Browser exposure counts stay local. Server logs include request paths, not passage bodies. A public deployment should restrict access at its reverse proxy if stronger access control is needed.

## Quick start

### TOPIK II reading papers

Build the local reading bank from the TOPIK II Migaku EPUB directory before starting the app:

```bash
python3 scripts/build_topik_reading.py /path/to/topik-epubs
```

The builder requires `*_TOPIK_II_Reading_Listening_Migaku.epub` files with all 50 reading questions, four choices, and answer entries. It writes `client/data/topik-reading.json`, including source images, for the separate **TOPIK** tab. AI practice is the default there: choose a reading question part (1–2 through 42–50) and generate new Korean passages, questions, four choices, and explanations through the server's existing `OPENAI_API_KEY`. Practice follows the Hanja single-question format: answer, see feedback, then continue. The clock counts elapsed time without a limit. Generated answer quality and difficulty are not officially calibrated. Choose **기출 EPUB** for the same one-question flow with a past paper. Scores cover only questions attempted. Neither result predicts a TOPIK II level. EPUB OCR text should be checked against its source page when a past question appears malformed.

### Requirements

- Go 1.24 or newer
- Node.js, only for the JavaScript tests
- Anki plus [AnkiConnect](https://ankiweb.net/shared/info/2055492159), only for the optional study-state overlay

### Run from source

```bash
make run
```

Then open <http://127.0.0.1:8004>.

- `make run` loads `OPENAI_API_KEY` from `.env.local` when that file exists
- `make docker-run` passes the ignored `.env.local` into the container when present
- The default listen address is `::`, so the app is reachable through any network interface
- To restrict it to the same machine, run `go run ./server/main -host 127.0.0.1`
- To change the port, run `go run ./server/main -port 8090`

### Run with Docker

```bash
make docker-build
make docker-run
```

Then open <http://127.0.0.1:8004>.

- Default image: `jessyfal04/hanja:tagname`
- Custom image: `make docker-build IMAGE=example/learnhanja TAG=latest`
- Custom port: `make docker-run PORT=8090`

### 한자 몰입 읽기

Open **연결 및 저장** and refresh the 독음 deck and Migaku words, then open **한자 몰입 읽기**. Choose a subject and length and press **오늘 틀린 한자로 읽기** to retrieve cards answered Again today in the selected 독음 deck. **다른 한자 선택** offers recently introduced cards, selected characters, all active learned 독음 characters, and the cumulative 상공회의소 3급 list. If Anki is disconnected, enter Hanja there manually. Migaku data is optional.

For a source checkout, set `OPENAI_API_KEY` in the ignored `.env.local` before `make run` or `make docker-run`. The API key remains on the Go server. If deploying through another process, provide that environment variable to the process.

Open **내 글 붙여넣기 · 오프라인** to convert Korean text. Dictionary matching happens only in the browser, preserves the original text, and leaves ambiguous or unsupported words unchanged. The default uses learned 독음 characters; manual characters can supplement them. **혼용문**, **한글**, and **독음 연습** switch the same passage without regeneration. Click a word for Korean and available English meanings, character breakdown, Anki and Migaku status, and a link to 한자 탐구. Copy the Hangul version for Migaku. Complete the reading to store exposure counts locally; seeing a character does not mark it learned in Anki. AI reading targets approximately 90–95% familiar vocabulary as a heuristic, not a measured guarantee. This reader is for modern Korean mixed-script text; classical 한문 requires a separate aligned-text mode.

## How to use it

### 1. Connect Anki (optional)

- Start Anki with AnkiConnect installed
- Open **연결 및 저장**
- Choose the Hanja deck, note type, and character field
- Optionally choose a separate idiom deck, note type, and whole-idiom field
- Approve the website origin when AnkiConnect asks
- Press **한자 상태 새로고침** or **사자성어 상태 새로고침**

LearnHanja only reads Anki data. It never creates, edits, suspends, or deletes cards.

Character states mean:

- **학습함 / known** — at least one matching card is not new
- **새 카드 / new** — matching cards are new and none are known
- **상태 없음 / unknown** — a note exists but no matching card state was returned
- **일시 중단 / suspended** — shown separately from whether the card is learned or new

The initial Anki connection and the **한자 상태 새로고침** button automatically select only active learned catalog characters. New and suspended cards are not automatically selected. Loading a saved selection restores that file instead of replacing it with the automatic Anki selection.

Anki connection and study status load when the page opens. Later updates are manual: use **앙키 새로고침** in the header to refresh connection, character, idiom, and auxiliary deck statuses without replacing the current Hanja selection.

If LearnHanja is served from another origin, add that origin to AnkiConnect's `webCorsOriginList`.

### Known Korean words from Migaku

- In **연결 및 저장 → 아는 단어 출처**, load a UTF-8 TXT file with one Korean word per line, or enter a local port (default `8766`, AnkiConnect's default port plus one)
- LearnHanja automatically tries port `8766` at startup; the same button can retry the connection later
- Generate a TXT file from Migaku's Chrome database:

```bash
python3 scripts/extract_migaku_known_korean.py --txt-output known_words.txt --format text > /dev/null
```

The command prints `migakuCounts` to stderr with word-level known, learning, tracked, and ignored totals. Tracked words are counted independently; an ignored entry is excluded from the ignored total when the same word also has a known entry. For a readable JSON file containing the counts and all four word lists, run:

```bash
python3 scripts/extract_migaku_known_korean.py --stats > .migaku
```

- Or start its local bridge, then press **포트에서 불러오기**:

```bash
python3 scripts/extract_migaku_known_korean.py --serve --port 8766
```

The bridge reads Migaku's Korean `KNOWN` and marked (`tracked`) words from the latest Chrome IndexedDB blob on each request. Use `--database /path/to/core.db` for an already extracted database and `--allow-origin https://your-site.example` when using a different website origin. The browser keeps the loaded words in memory. The vocabulary table colors known words green, marked words purple, and highlights unknown words whose Hanja are all actively learned in Anki as yellow study recommendations. Filter the table to all, known, or unknown words; marked words and study recommendations count as unknown. The **학습 추천 · 빈도순** sort places yellow targets first, then marked words, each by its aggregate mean frequency rank. Reload the source to reflect Migaku changes.

### 2. Select Hanja

- Browse characters grouped into 14 어문회 levels
- Toggle individual characters or an entire level
- Select all active learned or active new characters reported by Anki
- Clear the current selection at any time
- See suspended learned cards and suspended new cards separately

Every selection change schedules a vocabulary refresh in the background, so the result is ready in **어휘** without moving you away from the current tab.

### 3. Discover vocabulary

- See words whose full Hanja spelling can be formed from the selection
- Search by Hanja, Hangul, or meaning
- Sort by frequency, Hanja, Hangul, or English meaning
- Limit results by maximum frequency rank
- Open a word directly in **한자 탐구**

Three independent rankings contribute to the aggregate frequency:

- **NIKL rank** — position in the National Institute of Korean Language's *현대 국어 사용 빈도 조사*
- **Pokémon rank** — frequency in normalized Korean game text from *Pokémon Sword* and *Pokémon Legends: Arceus*
- **HermitDave rank** — position in the 2018 Korean 50K list from *FrequencyWords*

The table shows the arithmetic mean of available exact-match ranks followed by an ⓘ detail button. Hover or focus the button to see the mean, median, and all three source ranks. The default frequency sort and rank filter use the mean.

### 4. Follow the 천자문 learning path

- Read 1,000 source characters as 125 ordered eight-character sentences
- See Korean readings, current Anki state, selection state, and 어문회-catalog coverage
- Sort by the original order or by the closest incomplete sentence
- Filter to incomplete, completed, or currently selected sentences
- Add all eight characters to the current vocabulary selection
- Open an individual character or an entire sentence in **한자 탐구**

The displayed source glyph and its Korean study-match glyph are stored separately. Historical, compatibility, and textual variants remain visible instead of being silently rewritten for Anki matching.

### 5. Browse 사자성어

- Browse 447 unique idioms from four source lists
- Filter by Hangul or Hanja
- Filter by original source without losing the combined catalog
- Filter cumulatively by 어문회 level
- Show only idioms composed of selected characters
- Sort by Hangul, Hanja, or source order
- Overlay Anki state from a separately configured idiom field
- Add an idiom's characters to the current selection
- Open its Hanja directly in **한자 탐구**

Shared idioms appear once but retain every source label. The assigned level is the hardest character in the idiom; 7급 therefore also includes 8급. Partial spellings, alternate spellings, and entries containing characters outside the catalog appear under **급수 미상**.

### 6. Explore characters

In **한자 탐구**, paste a Hanja character, word, or mixed sentence, or enter an exact Hangul word. Hangul searches resolve exact dictionary spellings, offer a choice for homophones, and can combine catalog components such as `인공` + `지능` → `人工知能`.

- Analyze up to 64 distinct Hanja at once
- See Korean 훈음, Unihan `kDefinition`, level, radical, and stroke count
- Overlay the current Anki state on each level badge
- Find KRDict words containing any analyzed character
- Narrow results to one character or search the result text
- See related idioms and their source information
- Add one character or all analyzed characters to the selection

Lookup does not change the selection until an add button is pressed. Compatibility forms are normalized with NFKC for matching while the original input remains visible. Simplified/traditional forms and other distinct variants are not automatically merged.

### 7. Play games

The **게임** tab derives every round from the current Anki character state and Migaku known, unknown, and marked words. It does not write to Anki or Migaku.

- **혼용문** asks for the exact Hanja spelling of one Korean word from its Korean definition. A first mistake allows another try; a second mistake reveals and requeues the word.
- **어휘 맞추기** makes four-pair or six-pair Hangul/Hanja boards. Unknown words prioritize Migaku marks and frequency, then reveal Korean and English definitions after a match.
- Both games independently filter source (`vocabulary`, `idioms`, or mixed), word knowledge (`known`, `unknown`, or mixed), and character knowledge (`known Hanja only` or all Hanja). This supports word-only, character-only, idiom-only, and combined practice.
- Both games randomize a broad useful pool, hold recent cards back, and balance repeated character exposure in memory for the current page session.

### 8. Save a selection

- Chromium-based browsers can connect a JSON file once and update it automatically
- The approved file handle can be remembered locally with IndexedDB
- Browsers without the File System Access API fall back to manual JSON download/upload
- Selection files include the chosen deck, note type, character field, selected Hanja, and save time
- Files stay on the user's computer and are not uploaded to LearnHanja

## Server routes

- `GET /healthz`
  - Output: `ok`
- `GET /`
  - Serves the embedded client and its static assets

There are no vocabulary or Anki API routes. The app can also be adapted to a static host if the health check and standalone Go binary are not needed.

## Data sources

### Hanja levels and insights

- `client/data/levels.json`
  - Static snapshot of the 어문회 `Grade` field from 2026-09-09
  - 3,500 characters across 14 levels
- `client/data/levels-sangong.json`
  - Static snapshot of Anki `상공회의소::9` through `상공회의소::3` tags from 2026-10-09
  - 1,800 official characters in 7 exclusive grade groups; the Anki grade tags are cumulative
  - Two additional `info::variant` forms (`鍾`, `隣`) are listed beside their tagged counterparts (`鐘`, `鄰`), for 1,802 selectable forms in total. The 6급 list keeps `豐` and excludes `豊`
- `client/data/mock-exam.json`
  - Each grade has its own nested entry. All mock-exam character meanings and sounds come from the preserved Anki `MeaningNew` snapshot. `9.characters` keeps all 50 tagged characters; `9.format` keeps only that grade's timing, question order, and scoring
  - `8.characters` keeps the 150 cumulative 9급+8급 Anki characters. `8.format` defines 50 questions across 12 types, 30 minutes, 250 points, and a 150-point passing score. Each 독해 section has its own `readingContext` (text kind, target word length, minimum and maximum text length), so a later grade can mix sentences and longer passages
  - `6.characters` keeps the 450 official cumulative characters, using the local `MeaningNew` snapshot in `data/mock-exam/anki-meaning-new.json`. The exam data removes vowel-length marks and parenthetical glosses from question-facing 훈음 while retaining alternate sounds separately. The 6급 paper has 90 questions in 40 minutes, worth 480 points with 288 to pass; the last two questions share one GPT-generated reading passage
  - The Go server requests each 독해 text from GPT when `OPENAI_API_KEY` is configured (`OPENAI_MODEL` optionally overrides `gpt-6-luna`). The key stays on the server. The verified target word, reading, and meaning come from the vocabulary catalog; the server rejects text with missing/repeated target Hanja, other Hanja, exposed reading, or an out-of-range length. The per-section `readingContext` controls sentence or passage length independently for later grades
  - Mock-exam reading generation requires `OPENAI_API_KEY`. The paired 6급 passage questions choose a fresh combination from eligible grade vocabulary and distinct, unambiguous character meanings, then generate one shared passage with GPT. The paper JSON fixes the question structure, not passage targets
  - Vocabulary questions reuse the existing selected-Hanja search over `client/data/vocabulary.json`, keeping unambiguous two-character words made entirely from the grade's Hanja with a two-syllable Korean reading and a definition; the current 9급 pool has 91 words. Distractors prefer related Hanja, readings, meanings, and plausible radical shapes instead of arbitrary choices
  - The 2013년 2회 and 2017년 1회 9급 papers share a 30-question, 30-minute order across ten question types; `9.format.sections` stores those counts
  - 9급 scoring follows the [KCCI guide](https://license.korcham.net/co/examguide.do?cd=0401&mm=53): 20 한자 questions at 4 points, 10 어휘 questions at 6 points, and a passing score of 84/140; each grade defines its own `format.scoring` map
  - The 모의시험 tab provides immediate-feedback single-question practice and a timed full exam, then a colored standalone HTML report with date, score, answers, and errors. Every result includes a short weakness summary for missed Hanja, missed types, confused readings, and Hanja versus vocabulary errors
  - The Bulma checkbox for 독음 부분 연습 limits question targets to active learned characters in the configured Anki 독음 deck and vocabulary made only from those characters. Five-choice distractors remain available from the full grade. A partial paper keeps the configured type order, reduces counts and time to its available targets, and scales the 60% passing threshold as a practice criterion
  - Downloaded report names include grade, mode, scope, score, finish time to the millisecond, and a per-session download number
  - The compact question map shows the configured types in paper order with number ranges and answer counts, and supports direct jumps; it stays hidden when practice is limited to one type. Every mock session has the red stop button on the left. Hold it or the result screen's restart button for 1.2 seconds; both show a fill gauge and cancel on early release
  - The 9급 bank's 50 characters match the [KCCI grade list](https://license.korcham.net/co/examguide02Sub.do?cd=0401&mm=53&num=2948011) after normalizing its compatibility glyph 車 to 車; generation tests cover every character and eligible dictionary word in every applicable question type and reject multiple valid choices within the bank
  - To add a level, add `data/mock-exam/grades/<grade>/paper.json`, rebuild `client/data/mock-exam.json` with `scripts/build_mock_exam_level.py`, and add its value and label to `client/lib/mock-exam-levels.js`. The paper spec defines section order, scoring, and per-section reading contexts. `data/mock-exam/paper.schema.json` is validated by the builder (install `requirements-dev.txt` for the Python test/build tools). Picture questions randomly use available Commons old-script SVGs (`seal`, `bronze`, `oracle`, `ancient`, `bigseal`). Wiktionary-linked SVG filenames that do not follow the usual suffix pattern are listed with their source pages in `client/data/mock-exam-old-script-files.json`; the temporary server cache distinguishes every character, form, and SVG variant. Run `python3 scripts/fetch_old_script_glyphs.py` to inventory all 6급 forms, or add `--reuse --download` to populate the ignored base64 cache at `out/old-script-6/`. The single character meaning source is `data/mock-exam/anki-meaning-new.json`. The question engine, dictionary vocabulary, timer, and report are shared
  - Every grade uses the preserved Anki `MeaningNew` snapshot, which can be overridden with `--meaning-new` and a JSON mapping (for example `{"右":"오른쪽 우"}`). The builder rejects missing meanings instead of substituting another source
- `client/data/insights.json`
  - Korean 훈음, radicals, and stroke counts from local `HanjaLevels` data
  - Korean readings, stroke counts, and English `kDefinition` from [Unicode Unihan 17.0.0](https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip)
  - Chinese/Japanese readings and foreign study references intentionally excluded
- 旣/既 variant link
  - Sourced from the [Taiwan Ministry of Education character-variant dictionary](https://dict.variants.moe.edu.tw/dictView.jsp?ID=19555&la=0)
- Unicode terms
  - Included in [`client/data/unicode-license.txt`](client/data/unicode-license.txt)

Rebuild the self-contained insights asset with a local learnCJK data export and the pinned Unihan archive:

```bash
python3 scripts/build_insights.py \
  --cjk-data /path/to/learnCJK.dev/backend/data \
  --unihan /path/to/Unihan-17.0.0.zip
```

The running app does not depend on the other checkout or on Python.

### Vocabulary

- Source: the 2025-12-19 XML ZIP from the official [KRDict full-dictionary download](https://krdict.korean.go.kr/download/downloadPopup)
- The app does not scrape the KRDict website
- Rows without a pure-Hanja spelling are excluded
- Identical Hanja/Hangul pairs are deduplicated
- English meanings and Korean definitions from duplicate rows are merged
- `scripts/build_vocabulary.py` pre-merges words and ranks into `client/data/vocabulary.json`
- The compact catalog contains 22,207 entries and is about 2.7 MB uncompressed
- The browser loads it lazily when vocabulary is first needed, then keeps it in memory
- Browser JavaScript performs both selection searches and 한자 탐구 related-word searches

See [`data/kr-dict_hanja/README.md`](data/kr-dict_hanja/README.md) for conversion details.

Rebuild the browser catalog with:

```bash
make data
```

### 천자문

- Original work: Zhou Xingsi's public-domain *Thousand Character Classic*
- Transcription: [Chinese Wikisource revision 5752664](https://zh.wikisource.org/w/index.php?title=千字文&oldid=5752664), available under CC BY-SA 4.0
- `data/cheonjamun/wikisource.txt` preserves the 125 source lines and textual-variant markup
- `scripts/build_cheonjamun.py` validates 1,000 unique displayed characters and generates explicit Korean study matches in `client/data/cheonjamun.json`

Rebuild and verify this self-contained asset with:

```bash
python3 scripts/build_cheonjamun.py
python3 scripts/build_cheonjamun.py --check
```

### Frequency ranks

- **NIKL:** National Institute of Korean Language, *현대 국어 사용 빈도 조사*
- **Pokémon:** Korean text from [CPokemon/swsh-text](https://github.com/CPokemon/swsh-text) and [CPokemon/pla-text](https://github.com/CPokemon/pla-text)
- The upstream Pokémon dumps credit [kwsch/pkNX](https://github.com/kwsch/pkNX) for extraction
- The game text was normalized, stemmed with KoNLPy/Okt, restricted to Hangul tokens, counted, and ranked

See [`data/freq/README.md`](data/freq/README.md) for processing details.

### Idioms

- 247 entries from *꼭 시험에 나오는 고사성어*
- 214 entries from section 4.3 of NIKL's *한국어 교육 어휘 내용 개발(3단계)*
- 75 entries from Darakwon's *한자능력검정시험 마스터 6급·6급Ⅱ*
- 76 entries from Sidae Education's *어문회 한자능력검정시험 6급 한 권으로 끝내기*
- 447 unique entries after merging shared idioms
- Original inputs preserved in `data/idioms`
- Merged browser catalog generated at `client/data/idioms.json`

Rebuild the merged catalog with:

```bash
python3 scripts/merge_idiom_sources.py
```

See [`data/idioms/README.md`](data/idioms/README.md) for full provenance. The NIKL report is available from the [National Institute of Korean Language](https://www.korean.go.kr/front/reportData/reportDataView.do?report_seq=800) under 공공누리 제4유형 (출처표시, 비상업적 이용, 변경금지).

## Configuration

- `HOST`
  - Default: `::`
  - Server listen address
- `PORT`
  - Default: `8004`
  - Server listen port

Equivalent command-line flags are available. Flags override environment variables.

## Development

Run the complete test suite:

```bash
make test
```

This runs:

- Go unit tests
- Go HTTP and integration tests
- JavaScript unit tests
- JavaScript syntax checks

Build the executable:

```bash
make build
```

The output is written to `bin/learnhanja`.

## Repository layout

- `client/`
  - Browser interface and embedded static assets
  - `client/lib/` contains UI, vocabulary search, filtering, AnkiConnect, status, and persistence modules
  - `client/data/` contains the Hanja, idiom, insight, and compact vocabulary catalogs
- `server/`
  - `server/api/` contains the health check and static-file serving
  - `server/main/` is the executable entry point
- `data/`
  - `data/kr-dict_hanja/` contains the source archive, converter, and generated TSV
  - `data/freq/` contains ranked Hangul frequency lists
  - `data/idioms/` preserves the idiom source lists
- `scripts/`
  - Static-data build tools
