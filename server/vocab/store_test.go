package vocab

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadAndSearchMergesSensesAndFiltersCharacters(t *testing.T) {
	dataDir := t.TempDir()
	writeFixture(t, filepath.Join(dataDir, "kr-dict_hanja", "krdict_hanja.tsv"),
		"target_code\tword\tsup_no\thanja\tpos\tdefinition_ko\tmeaning_en\n"+
			"1\t인\t1\t人\tn\tx\tperson\n"+
			"2\t인\t2\t人\tn\tx\tname\n"+
			"3\t인인\t1\t人人\tn\tx\tpeople\n"+
			"4\t인일\t1\t人日\tn\tx\tday\n")
	writeFixture(t, filepath.Join(dataDir, "freq", "Pokémon.json"), `["인인","인"]`)
	writeFixture(t, filepath.Join(dataDir, "freq", "NIKL.json"), `["인"]`)

	store, err := Load(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	result := store.Search([]string{"人"}, 10)
	if result.Total != 2 || len(result.Entries) != 2 {
		t.Fatalf("unexpected result: %#v", result)
	}
	entry := result.Entries[0]
	if entry.Hanja != "人" || len(entry.Meanings) != 2 || entry.Meanings[0] != "person" || entry.Meanings[1] != "name" {
		t.Fatalf("senses were not preserved: %#v", entry)
	}
	if entry.PokemonRank != 2 || entry.NIKLRank != 1 {
		t.Fatalf("unexpected ranks: %#v", entry)
	}
}

func TestSearchLimitAndEmptySelection(t *testing.T) {
	store := &Store{entries: nil}
	if result := store.Search(nil, 10); result.Total != 0 || len(result.Entries) != 0 {
		t.Fatalf("unexpected empty result: %#v", result)
	}
}

func TestLoadFailsWhenDataIsMissing(t *testing.T) {
	if _, err := Load(t.TempDir()); err == nil {
		t.Fatal("expected missing data error")
	}
}

func writeFixture(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
