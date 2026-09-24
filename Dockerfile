FROM golang:1.24-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY client ./client
COPY server ./server
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/hanja-vocab ./server/main

FROM alpine:3.22

RUN apk add --no-cache ca-certificates \
	&& addgroup -S app \
	&& adduser -S -G app app
WORKDIR /app
COPY --from=build /out/hanja-vocab ./hanja-vocab
COPY data/kr-dict_hanja/krdict_hanja.tsv ./data/kr-dict_hanja/krdict_hanja.tsv
COPY data/freq/NIKL.json data/freq/Pokémon.json ./data/freq/
USER app
EXPOSE 8004
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD wget --quiet --spider http://127.0.0.1:8004/healthz || exit 1
ENTRYPOINT ["./hanja-vocab"]
