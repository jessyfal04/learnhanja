package vocab

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"

	"learnhanja/server/model"
)

const DefaultLimit = 500

type Store struct {
	entries []model.VocabEntry
}

func Load(dataDir string) (*Store, error) {
	entries, err := loadEntries(filepath.Join(dataDir, "kr-dict_hanja", "krdict_hanja.tsv"))
	if err != nil {
		return nil, err
	}
	pokemon, err := loadRanks(filepath.Join(dataDir, "freq", "Pokémon.json"))
	if err != nil {
		return nil, err
	}
	nikl, err := loadRanks(filepath.Join(dataDir, "freq", "NIKL.json"))
	if err != nil {
		return nil, err
	}
	for i := range entries {
		entries[i].PokemonRank = pokemon[entries[i].Hangul]
		entries[i].NIKLRank = nikl[entries[i].Hangul]
	}
	return &Store{entries: entries}, nil
}

func (s *Store) Search(characters []string, limit int) model.VocabResult {
	allowed := make(map[rune]bool)
	for _, value := range characters {
		for _, r := range value {
			if isHanja(r) {
				allowed[unifyRune(r)] = true
			}
		}
	}
	if limit <= 0 {
		limit = DefaultLimit
	}
	if limit > 5000 {
		limit = 5000
	}

	entries := make([]model.VocabEntry, 0)
	for _, entry := range s.entries {
		if wordAllowed(entry.Hanja, allowed) {
			entries = append(entries, entry)
		}
	}
	sort.SliceStable(entries, func(i, j int) bool {
		a, b := bestRank(entries[i]), bestRank(entries[j])
		if a != b {
			return a < b
		}
		if entries[i].Hangul != entries[j].Hangul {
			return entries[i].Hangul < entries[j].Hangul
		}
		return entries[i].Hanja < entries[j].Hanja
	})
	result := model.VocabResult{Total: len(entries)}
	if len(entries) > limit {
		entries = entries[:limit]
	}
	result.Entries = entries
	return result
}

func (s *Store) Related(characters []string) model.VocabResult {
	wanted := make(map[rune]bool)
	for _, character := range characters {
		for _, r := range normalizeHanja(character) {
			if isHanja(r) {
				wanted[r] = true
			}
		}
	}
	entries := make([]model.VocabEntry, 0)
	for _, entry := range s.entries {
		for _, r := range entry.Hanja {
			if wanted[r] {
				entries = append(entries, entry)
				break
			}
		}
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if bestRank(entries[i]) != bestRank(entries[j]) {
			return bestRank(entries[i]) < bestRank(entries[j])
		}
		return entries[i].Hangul < entries[j].Hangul
	})
	return model.VocabResult{Entries: entries, Total: len(entries)}
}

func loadEntries(path string) ([]model.VocabEntry, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open vocabulary TSV: %w", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.Comma = '\t'
	reader.FieldsPerRecord = -1
	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("read vocabulary TSV header: %w", err)
	}
	columns := make(map[string]int, len(header))
	for i, name := range header {
		columns[strings.TrimSpace(name)] = i
	}
	for _, required := range []string{"word", "hanja", "meaning_en"} {
		if _, ok := columns[required]; !ok {
			return nil, fmt.Errorf("vocabulary TSV missing %q column", required)
		}
	}

	entries := make([]model.VocabEntry, 0)
	byKey := make(map[string]int)
	meaningSets := make([]map[string]bool, 0)
	definitionSets := make([]map[string]bool, 0)
	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read vocabulary TSV: %w", err)
		}
		hanja := normalizeHanja(column(row, columns["hanja"]))
		hangul := strings.TrimSpace(column(row, columns["word"]))
		meaning := strings.TrimSpace(column(row, columns["meaning_en"]))
		definition := ""
		if index, exists := columns["definition_ko"]; exists {
			definition = strings.TrimSpace(column(row, index))
		}
		if hanja == "" || hangul == "" || !hanjaOnly(hanja) {
			continue
		}
		key := hanja + "\x00" + hangul
		index, ok := byKey[key]
		if !ok {
			index = len(entries)
			byKey[key] = index
			entries = append(entries, model.VocabEntry{Hanja: hanja, Hangul: hangul})
			meaningSets = append(meaningSets, make(map[string]bool))
			definitionSets = append(definitionSets, make(map[string]bool))
		}
		if meaning != "" && !meaningSets[index][meaning] {
			meaningSets[index][meaning] = true
			entries[index].Meanings = append(entries[index].Meanings, meaning)
		}
		if definition != "" && !definitionSets[index][definition] {
			definitionSets[index][definition] = true
			entries[index].Definitions = append(entries[index].Definitions, definition)
		}
	}
	return entries, nil
}

func loadRanks(path string) (map[string]int, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read frequency data: %w", err)
	}
	var words []string
	if err := json.Unmarshal(data, &words); err != nil {
		return nil, fmt.Errorf("decode frequency data: %w", err)
	}
	ranks := make(map[string]int, len(words))
	for i, word := range words {
		if word == "" || word == "NULL" || strings.Contains(strings.ToUpper(word), "_DUP") {
			continue
		}
		if _, exists := ranks[word]; !exists {
			ranks[word] = i + 1
		}
	}
	return ranks, nil
}

func column(row []string, index int) string {
	if index < 0 || index >= len(row) {
		return ""
	}
	return row[index]
}

func wordAllowed(word string, allowed map[rune]bool) bool {
	if len(allowed) == 0 {
		return false
	}
	for _, r := range word {
		if !allowed[unifyRune(r)] {
			return false
		}
	}
	return true
}

func bestRank(entry model.VocabEntry) int {
	best := entry.PokemonRank
	if best == 0 || entry.NIKLRank > 0 && entry.NIKLRank < best {
		best = entry.NIKLRank
	}
	if best == 0 {
		return int(^uint(0) >> 1)
	}
	return best
}

func hanjaOnly(value string) bool {
	for _, r := range value {
		if !isHanja(r) {
			return false
		}
	}
	return value != ""
}

func isHanja(r rune) bool {
	return unicode.Is(unicode.Han, r)
}

func normalizeHanja(value string) string {
	return norm.NFKC.String(strings.TrimSpace(value))
}

func unifyRune(r rune) rune {
	return []rune(norm.NFKC.String(string(r)))[0]
}
