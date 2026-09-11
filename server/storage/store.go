package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"hanjavocab/server/model"
)

var saveNamePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)

var ErrNotFound = errors.New("saved selection not found")

type Store struct {
	dir string
}

func New(dataDir string) (*Store, error) {
	dir := filepath.Join(dataDir, "saves")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create save directory: %w", err)
	}
	return &Store{dir: dir}, nil
}

func (s *Store) List() ([]model.SavedSelectionInfo, error) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, fmt.Errorf("list saved selections: %w", err)
	}
	result := make([]model.SavedSelectionInfo, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		name := strings.TrimSuffix(entry.Name(), ".json")
		selection, err := s.Load(name)
		if err != nil {
			continue
		}
		result = append(result, model.SavedSelectionInfo{Name: name, SavedAt: selection.SavedAt, Selected: len(selection.Selected)})
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].SavedAt.After(result[j].SavedAt)
	})
	return result, nil
}

func (s *Store) Load(name string) (model.SavedSelection, error) {
	path, err := s.path(name)
	if err != nil {
		return model.SavedSelection{}, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return model.SavedSelection{}, ErrNotFound
	}
	if err != nil {
		return model.SavedSelection{}, fmt.Errorf("read saved selection: %w", err)
	}
	var selection model.SavedSelection
	if err := json.Unmarshal(data, &selection); err != nil {
		return model.SavedSelection{}, fmt.Errorf("decode saved selection: %w", err)
	}
	if err := validateSelection(selection); err != nil {
		return model.SavedSelection{}, fmt.Errorf("invalid saved selection: %w", err)
	}
	return selection, nil
}

func (s *Store) Save(name string, selection model.SavedSelection) (model.SavedSelection, error) {
	path, err := s.path(name)
	if err != nil {
		return model.SavedSelection{}, err
	}
	selection.Version = 1
	selection.SavedAt = time.Now().UTC()
	selection.Selected = uniqueCharacters(selection.Selected)
	if err := validateSelection(selection); err != nil {
		return model.SavedSelection{}, err
	}

	temporary, err := os.CreateTemp(s.dir, ".selection-*.tmp")
	if err != nil {
		return model.SavedSelection{}, fmt.Errorf("create temporary save: %w", err)
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	encoder := json.NewEncoder(temporary)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(selection); err != nil {
		_ = temporary.Close()
		return model.SavedSelection{}, fmt.Errorf("encode saved selection: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return model.SavedSelection{}, fmt.Errorf("sync saved selection: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return model.SavedSelection{}, fmt.Errorf("close saved selection: %w", err)
	}
	if err := os.Rename(temporaryName, path); err != nil {
		return model.SavedSelection{}, fmt.Errorf("replace saved selection: %w", err)
	}
	return selection, nil
}

func (s *Store) Delete(name string) error {
	path, err := s.path(name)
	if err != nil {
		return err
	}
	if err := os.Remove(path); errors.Is(err, os.ErrNotExist) {
		return ErrNotFound
	} else if err != nil {
		return fmt.Errorf("delete saved selection: %w", err)
	}
	return nil
}

func (s *Store) path(name string) (string, error) {
	name = strings.TrimSpace(name)
	if !saveNamePattern.MatchString(name) {
		return "", fmt.Errorf("save name must use 1-64 letters, numbers, dots, dashes, or underscores")
	}
	return filepath.Join(s.dir, name+".json"), nil
}

func validateSelection(selection model.SavedSelection) error {
	if len(selection.Selected) > 5000 {
		return fmt.Errorf("at most 5000 characters can be saved")
	}
	for _, value := range selection.Selected {
		r, size := utf8.DecodeRuneInString(value)
		if r == utf8.RuneError || size != len(value) || !isHanja(r) {
			return fmt.Errorf("invalid Hanja character %q", value)
		}
	}
	return nil
}

func uniqueCharacters(values []string) []string {
	seen := make(map[string]bool, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	sort.Strings(result)
	return result
}

func isHanja(r rune) bool {
	return r >= 0x3400 && r <= 0x9fff || r >= 0xf900 && r <= 0xfaff
}
