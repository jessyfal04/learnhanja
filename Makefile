.PHONY: run build test fmt docker-build docker-push docker-run

PORT ?= 8004
GOCACHE ?= $(CURDIR)/.cache/go-build
IMAGE ?= jessyfal04/hanja
TAG ?= tagname

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

docker-build:
	docker build --tag $(IMAGE):$(TAG) .

docker-push: docker-build
	docker push $(IMAGE):$(TAG)

docker-run:
	docker run --rm --publish $(PORT):8004 $(IMAGE):$(TAG)
