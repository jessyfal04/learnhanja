FROM golang:1.24-alpine AS build

WORKDIR /src
COPY go.mod ./
COPY client ./client
COPY server ./server
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/learnhanja ./server/main

FROM alpine:3.22

RUN apk add --no-cache ca-certificates \
	&& addgroup -S app \
	&& adduser -S -G app app
WORKDIR /app
COPY --from=build /out/learnhanja ./learnhanja
USER app
EXPOSE 8004
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD wget --quiet --spider http://127.0.0.1:8004/healthz || exit 1
ENTRYPOINT ["./learnhanja"]
