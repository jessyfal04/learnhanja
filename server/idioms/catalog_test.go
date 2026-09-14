package idioms

import "testing"

func TestEmbeddedNIKLCatalog(t *testing.T) {
	catalog, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	data := catalog.Data()
	if data.Total != 383 || len(data.Entries) != 383 {
		t.Fatalf("unexpected count: %#v", data)
	}
	if len(data.Sources) != 2 || data.Sources[0].ID != examSourceID || data.Sources[0].Total != 247 || data.Sources[1].ID != niklSourceID || data.Sources[1].Total != 214 {
		t.Fatalf("unexpected sources: %#v", data.Sources)
	}
	if data.Entries[0].Korean != "가렴주구" || data.Entries[0].Hanja != "苛斂誅求" || data.Entries[0].Page != 146 {
		t.Fatalf("unexpected first entry: %#v", data.Entries[0])
	}
	partials := make(map[string]bool)
	entries := make(map[string]struct {
		page    int
		sources int
	})
	for _, entry := range data.Entries {
		if entry.Partial {
			partials[entry.Korean] = true
		}
		entries[entry.Korean] = struct {
			page    int
			sources int
		}{entry.Page, len(entry.Sources)}
	}
	for _, korean := range []string{"금시초문", "기절초풍", "안성맞춤", "야단법석"} {
		if !partials[korean] {
			t.Fatalf("expected %s to preserve alternate or partial notation", korean)
		}
	}
	if entries["감언이설"].page != 67 || entries["감언이설"].sources != 2 {
		t.Fatalf("shared source and page were not merged: %#v", entries["감언이설"])
	}
	var foundSense bool
	for _, entry := range data.Entries {
		if entry.Korean == "야단법석" && entry.SourceForm == "야단법석02" {
			foundSense = true
		}
	}
	if !foundSense {
		t.Fatal("source sense notation was not preserved")
	}
}
