package storage

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"hanjavocab/server/model"
)

func TestSaveLoadListDelete(t *testing.T) {
	store, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	selection := model.SavedSelection{
		Deck: "Hanja", NoteType: "Hanja", CharacterField: "Char",
		Selected: []string{"日", "人", "人"},
	}
	saved, err := store.Save("daily", selection)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Version != 1 || saved.SavedAt.IsZero() || len(saved.Selected) != 2 {
		t.Fatalf("unexpected saved selection: %#v", saved)
	}
	loaded, err := store.Load("daily")
	if err != nil || loaded.Deck != "Hanja" || len(loaded.Selected) != 2 {
		t.Fatalf("unexpected loaded selection: %#v, %v", loaded, err)
	}
	list, err := store.List()
	if err != nil || len(list) != 1 || list[0].Name != "daily" || list[0].Selected != 2 {
		t.Fatalf("unexpected list: %#v, %v", list, err)
	}
	if err := store.Delete("daily"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Load("daily"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestSaveRejectsInvalidNamesAndCharacters(t *testing.T) {
	dataDir := t.TempDir()
	store, err := New(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	valid := model.SavedSelection{Deck: "Hanja", NoteType: "Hanja", CharacterField: "Char"}
	if _, err := store.Save("../escape", valid); err == nil {
		t.Fatal("expected invalid name error")
	}
	valid.Selected = []string{"not-hanja"}
	if _, err := store.Save("invalid", valid); err == nil {
		t.Fatal("expected invalid character error")
	}
	if _, err := os.Stat(filepath.Join(dataDir, "escape.json")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("unexpected escaped file: %v", err)
	}
}

func TestSaveWorksWithoutAnkiConfiguration(t *testing.T) {
	store, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Save("offline", model.SavedSelection{Selected: []string{"人"}}); err != nil {
		t.Fatal(err)
	}
}

func TestListSkipsCorruptFiles(t *testing.T) {
	dataDir := t.TempDir()
	store, err := New(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "saves", "broken.json"), []byte("{"), 0o644); err != nil {
		t.Fatal(err)
	}
	list, err := store.List()
	if err != nil || len(list) != 0 {
		t.Fatalf("unexpected list: %#v, %v", list, err)
	}
}
