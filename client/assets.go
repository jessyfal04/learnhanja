package client

import "embed"

//go:embed data/*.json index.html lib/*.js style/*.css
var Files embed.FS
