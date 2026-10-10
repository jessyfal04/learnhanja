.PHONY: run build data test fmt docker-build docker-push docker-run production

PORT ?= 8004
GOCACHE ?= $(CURDIR)/.cache/go-build
IMAGE ?= jessyfal04/hanja
TAG ?= tagname
export COMMIT_MESSAGE

run:
	@set -a; if [ -f .env.local ]; then . ./.env.local; fi; set +a; \
	GOCACHE=$(GOCACHE) go run ./server/main -port $(PORT)

build:
	mkdir -p bin
	GOCACHE=$(GOCACHE) go build -o bin/learnhanja ./server/main

data:
	python3 scripts/build_vocabulary.py
	python3 scripts/build_cheonjamun.py

test:
	python3 scripts/build_cheonjamun.py --check
	python3 -B scripts/build_mock_exam_sentences.py --check
	GOCACHE=$(GOCACHE) go test ./...
	node --test client/lib/*.test.mjs
	find client/lib -name '*.js' -exec node --check {} \;

test-smoke:
	GOCACHE=$(GOCACHE) go test ./server/api -run TestHealthAndStaticClient -count=1

docker-build:
	docker build --tag $(IMAGE):$(TAG) .

docker-push: docker-build
	docker push $(IMAGE):$(TAG)

production:
	@test -n "$$COMMIT_MESSAGE" || { echo 'Usage: make production COMMIT_MESSAGE="your commit message"' >&2; exit 2; }
	@test "$$(git branch --show-current)" = main || { echo 'Production must run from main' >&2; exit 2; }
	$(MAKE) test
	git add -A
	git commit -m "$$COMMIT_MESSAGE"
	git push origin main
	$(MAKE) docker-push

docker-run:
	docker run --rm --publish $(PORT):8004 $(IMAGE):$(TAG)
