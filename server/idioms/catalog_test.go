package idioms

import "testing"

func TestEmbeddedNIKLCatalog(t *testing.T) {
	catalog, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	data := catalog.Data()
	if data.Total != 214 || len(data.Entries) != 214 {
		t.Fatalf("unexpected count: %#v", data)
	}
	if data.Entries[0].Korean != "각양각색" || data.Entries[0].Hanja != "各樣各色" {
		t.Fatalf("unexpected first entry: %#v", data.Entries[0])
	}
	partials := make(map[string]bool)
	for _, entry := range data.Entries {
		if entry.Partial {
			partials[entry.Korean] = true
		}
	}
	for _, korean := range []string{"금시초문", "기절초풍", "안성맞춤", "야단법석"} {
		if !partials[korean] {
			t.Fatalf("expected %s to preserve alternate or partial notation", korean)
		}
	}
	if data.Entries[106].Korean != "야단법석" || data.Entries[106].SourceForm != "야단법석02" {
		t.Fatalf("source sense notation was not preserved: %#v", data.Entries[106])
	}
}
