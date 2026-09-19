package model

type VocabEntry struct {
	Hanja       string   `json:"hanja"`
	Hangul      string   `json:"hangul"`
	Meanings    []string `json:"meanings"`
	Definitions []string `json:"definitions"`
	PokemonRank int      `json:"pokemonRank"`
	NIKLRank    int      `json:"niklRank"`
}

type VocabResult struct {
	Entries []VocabEntry `json:"entries"`
	Total   int          `json:"total"`
}
