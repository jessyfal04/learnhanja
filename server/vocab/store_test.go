package vocab

import (
	"os"
	"path/filepath"
	"testing"

	"learnhanja/server/model"
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

func TestRelatedIncludesWordsBeyondSelectionWithoutDuplicates(t *testing.T) {
	store := &Store{entries: []model.VocabEntry{
		{Hanja: "族譜", Hangul: "족보", NIKLRank: 20},
		{Hanja: "家族", Hangul: "가족", NIKLRank: 2},
		{Hanja: "出入", Hangul: "출입"},
		{Hanja: "金屬", Hangul: "금속", NIKLRank: 40},
		{Hanja: "𠀀", Hangul: "test"},
	}}
	result := store.Related([]string{"族", "譜"})
	if result.Total != 2 || result.Entries[0].Hanja != "家族" {
		t.Fatalf("related = %+v", result)
	}
	if store.Search([]string{"族", "譜"}, 100).Total != 1 {
		t.Fatal("selection search should still require every character")
	}
	if store.Related([]string{"金"}).Total != 1 || store.Related([]string{"𠀀"}).Total != 1 {
		t.Fatal("compatibility or supplementary Han lookup failed")
	}
	if store.Related([]string{"abc"}).Total != 0 {
		t.Fatal("non-Han input matched words")
	}
}

func TestRelatedWithRealExample(t *testing.T) {
	store, err := Load("../../data")
	if err != nil {
		t.Fatal(err)
	}
	result := store.Related([]string{"旣", "出", "族", "譜"})
	found := map[string]bool{}
	for _, entry := range result.Entries {
		found[entry.Hanja] = true
	}
	for _, word := range []string{"族譜", "家族", "旣存", "出發"} {
		if !found[word] {
			t.Fatalf("missing %s in example results", word)
		}
	}
}

func TestKoreanDefinitionsArePreservedAndDeduplicated(t *testing.T) {
	path := filepath.Join(t.TempDir(), "words.tsv")
	writeFixture(t, path, "word\thanja\tmeaning_en\tdefinition_ko\n"+
		"가족\t家族\tfamily\t부모, 자식, 형제, 배우자 등으로 이루어진 집안의 사람들.\n"+
		"가족\t家族\tfamily\t부모, 자식, 형제, 배우자 등으로 이루어진 집안의 사람들.\n"+
		"가족\t家族\thousehold\t집안의 구성원.\n")
	entries, err := loadEntries(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || len(entries[0].Definitions) != 2 || entries[0].Definitions[1] != "집안의 구성원." {
		t.Fatalf("Korean definitions not preserved: %+v", entries)
	}
}
