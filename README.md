# Hanja Vocab

Go web app for selecting a fixed Hanja level catalog, optionally overlaying Anki state, and building KRDict vocabulary.

## Run

Requirements: Go 1.24+. Anki with AnkiConnect is optional and only supplies study state.

```bash
make run
```

Open `https://local.jessyfal04.dev`. The server listens on all interfaces at port `8004` so the VPS can reach it through WireGuard. For direct access, use `http://127.0.0.1:8004`.

```bash
go run ./server/main -port 8090
```

The catalog contains 3,500 embedded characters in 14 어문회 levels. Choose an Anki deck, a compatible note type, and its Hanja field to overlay status.

The 사자성어 view combines the 247-entry *꼭 시험에 나오는 고사성어 목록* with the existing 214 entries in section 4.3 of the National Institute of Korean Language report *한국어 교육 어휘 내용 개발(3단계)*. Shared idioms are shown once, producing 383 unique entries. The exam list is the default source; source filtering keeps either original list available, and the exam source's page number is shown in the table. The view also supports Hangul/Hanja filtering, source-order or alphabetical sorting, selection coverage, and adding an idiom's Hanja to the active selection.

Source: [국립국어원 report page](https://www.korean.go.kr/front/reportData/reportDataView.do?report_seq=800), 공공누리 제4유형 (출처표시, 비상업적 이용, 변경금지).

## Configuration

| Environment | Default |
|---|---|
| `HOST` | `::` |
| `PORT` | `8004` |
| `ANKI_URL` | `http://127.0.0.1:8765` |
| `DATA_DIR` | `data` |

Equivalent command-line flags are available. Flags override environment values.

## Study state

- `known`: at least one matching card is not new
- `new`: matching cards are new and none are known
- `unknown`: a note exists but no matching card state is returned
- suspended cards are marked separately

AnkiConnect calls are made by Go, not browser JavaScript. Tests use a mock server and never alter the Anki collection.

## Save selections

- `Save JSON file` uses the browser File System Access API when available
- Browsers without picker support fall back to JSON download/upload
- The local save API stores validated, atomic JSON files under `data/saves`

## Test and build

```bash
make test
make build
```

The test target runs Go unit/integration/HTTP tests, JavaScript unit tests, and JavaScript syntax checks.

## Layout

- `server/anki`: AnkiConnect client and status mapping
- `server/levels`: embedded immutable level catalog
- `server/idioms`: validated embedded exam and NIKL idiom catalogs
- `server/vocab`: KRDict and frequency data
- `server/api`: HTTP routes
- `server/model`: shared response models
- `server/main`: executable entrypoint
- `client`: embedded Bulma interface and modular JavaScript
