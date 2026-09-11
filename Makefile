.PHONY: run build test fmt

PORT ?= 8004
GOCACHE ?= $(CURDIR)/.cache/go-build

run:
	GOCACHE=$(GOCACHE) go run ./server/main -port $(PORT)

build:
	mkdir -p bin
	GOCACHE=$(GOCACHE) go build -o bin/hanja-vocab ./server/main

test:
	GOCACHE=$(GOCACHE) go test ./...
	node --test client/lib/*.test.mjs
	find client/lib -name '*.js' -exec node --check {} \;

test-smoke:
	GOCACHE=$(GOCACHE) go test ./server/api -run TestHealthAndStaticClient -count=1
