package model

import "time"

type AnkiMetadata struct {
	Connected bool     `json:"connected"`
	Version   int      `json:"version"`
	Decks     []string `json:"decks"`
	NoteTypes []string `json:"noteTypes"`
}

type CharacterStatus string

const (
	StatusKnown   CharacterStatus = "known"
	StatusNew     CharacterStatus = "new"
	StatusUnknown CharacterStatus = "unknown"
)

type CharacterStatusInfo struct {
	Status    CharacterStatus `json:"status"`
	Suspended bool            `json:"suspended"`
	NoteCount int             `json:"noteCount"`
}

type AnkiStatus struct {
	Characters map[string]CharacterStatusInfo `json:"characters"`
	Known      int                            `json:"known"`
	New        int                            `json:"new"`
	Unknown    int                            `json:"unknown"`
	Total      int                            `json:"total"`
}

type AnkiIdiomStatus struct {
	Idioms  map[string]CharacterStatusInfo `json:"idioms"`
	Known   int                            `json:"known"`
	New     int                            `json:"new"`
	Unknown int                            `json:"unknown"`
	Total   int                            `json:"total"`
}

type CatalogGroup struct {
	Level      string   `json:"level"`
	Characters []string `json:"characters"`
}

type LevelCatalog struct {
	Source string         `json:"source"`
	Total  int            `json:"total"`
	Groups []CatalogGroup `json:"groups"`
}

type Idiom struct {
	Korean       string         `json:"korean"`
	Hanja        string         `json:"hanja"`
	Partial      bool           `json:"partial"`
	SourceForm   string         `json:"sourceForm,omitempty"`
	Sources      []string       `json:"sources"`
	SourceOrders map[string]int `json:"sourceOrders"`
	Page         int            `json:"page,omitempty"`
}

type IdiomSource struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ShortName string `json:"shortName"`
	SourceURL string `json:"sourceUrl,omitempty"`
	License   string `json:"license,omitempty"`
	Total     int    `json:"total"`
}

type IdiomCatalog struct {
	Sources []IdiomSource `json:"sources"`
	Total   int           `json:"total"`
	Entries []Idiom       `json:"entries"`
}

type VocabEntry struct {
	Hanja       string   `json:"hanja"`
	Hangul      string   `json:"hangul"`
	Meanings    []string `json:"meanings"`
	PokemonRank int      `json:"pokemonRank"`
	NIKLRank    int      `json:"niklRank"`
}

type VocabResult struct {
	Entries []VocabEntry `json:"entries"`
	Total   int          `json:"total"`
}

type SavedSelection struct {
	Version        int       `json:"version"`
	SavedAt        time.Time `json:"savedAt"`
	Deck           string    `json:"deck"`
	NoteType       string    `json:"noteType"`
	CharacterField string    `json:"characterField"`
	Selected       []string  `json:"selected"`
}

type SavedSelectionInfo struct {
	Name     string    `json:"name"`
	SavedAt  time.Time `json:"savedAt"`
	Selected int       `json:"selected"`
}
