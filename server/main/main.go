package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	clientassets "hanjavocab/client"
	"hanjavocab/server/api"
	"hanjavocab/server/vocab"
)

func main() {
	host := flag.String("host", env("HOST", "::"), "listen host")
	port := flag.String("port", env("PORT", "8004"), "listen port")
	dataDir := flag.String("data-dir", env("DATA_DIR", "data"), "data directory")
	flag.Parse()

	if err := validatePort(*port); err != nil {
		log.Fatal(err)
	}
	store, err := vocab.Load(*dataDir)
	if err != nil {
		log.Fatalf("load vocabulary: %v", err)
	}
	server := api.NewServer(store, clientassets.Files)
	address := net.JoinHostPort(*host, *port)

	httpServer := &http.Server{
		Addr:              address,
		Handler:           server.ServeMux(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(ctx)
	}()

	log.Printf("Hanja Vocab listening on http://%s", address)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func validatePort(value string) error {
	port, err := strconv.Atoi(value)
	if err != nil || port < 1 || port > 65535 {
		return fmt.Errorf("invalid port %q", value)
	}
	return nil
}
