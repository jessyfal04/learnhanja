package client

import "embed"

//go:embed index.html lib/*.js style/*.css
var Files embed.FS
