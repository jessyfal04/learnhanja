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
- `server/vocab`: KRDict and frequency data
- `server/api`: HTTP routes
- `server/model`: shared response models
- `server/main`: executable entrypoint
- `client`: embedded Bulma interface and modular JavaScript
