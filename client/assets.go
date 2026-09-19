package client

import "embed"

//go:embed data/*.json data/*.txt index.html lib/*.js style/*.css
var Files embed.FS
