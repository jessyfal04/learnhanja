package levels

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"unicode/utf8"

	"hanjavocab/server/model"
)

//go:embed levels.json
var catalogJSON []byte

type Catalog struct {
	data model.LevelCatalog
}

func Load() (*Catalog, error) {
	var data model.LevelCatalog
	if err := json.Unmarshal(catalogJSON, &data); err != nil {
		return nil, fmt.Errorf("decode embedded level catalog: %w", err)
	}
	seen := make(map[string]bool, data.Total)
	count := 0
	for _, group := range data.Groups {
		if group.Level == "" {
			return nil, fmt.Errorf("level catalog contains an empty level")
		}
		for _, character := range group.Characters {
			r, size := utf8.DecodeRuneInString(character)
			if r == utf8.RuneError || size != len(character) || !isHanja(r) {
				return nil, fmt.Errorf("level %s contains invalid character %q", group.Level, character)
			}
			if seen[character] {
				return nil, fmt.Errorf("level catalog contains duplicate character %q", character)
			}
			seen[character] = true
			count++
		}
	}
	if count != data.Total {
		return nil, fmt.Errorf("level catalog declares %d characters but contains %d", data.Total, count)
	}
	return &Catalog{data: data}, nil
}

func (c *Catalog) Data() model.LevelCatalog {
	return c.data
}

func isHanja(r rune) bool {
	return r >= 0x3400 && r <= 0x9fff || r >= 0xf900 && r <= 0xfaff
}
