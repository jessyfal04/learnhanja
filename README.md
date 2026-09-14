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

The static catalog contains 3,500 characters in 14 어문회 levels. The first tab contains local Anki and file connections; character selection is kept in the second tab. Choose an Anki deck, a compatible note type, and its Hanja field to overlay status.

The 사자성어 view combines the 247-entry *꼭 시험에 나오는 고사성어 목록* with the existing 214 entries in section 4.3 of the National Institute of Korean Language report *한국어 교육 어휘 내용 개발(3단계)*. Shared idioms are shown once, producing 383 unique entries. The exam list is the default source; source filtering keeps either original list available, and the exam source's page number is shown in the table. A separate Anki deck, note type, and whole-idiom field can overlay known/new status. Hanja compatibility forms are normalized when matching. The view also supports Hangul/Hanja filtering, page/source-order or alphabetical sorting, selection coverage, and adding an idiom's Hanja to the active selection.

Source: [국립국어원 report page](https://www.korean.go.kr/front/reportData/reportDataView.do?report_seq=800), 공공누리 제4유형 (출처표시, 비상업적 이용, 변경금지).

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

The Go server only serves the embedded web client and handles `POST /api/vocab`. Hanja levels and idioms are explicit static JSON assets; Anki metadata, fields, Hanja status, idiom status, and selection files stay local to the browser.

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
