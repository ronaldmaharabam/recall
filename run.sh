#!/bin/bash

GO_DIR="/home/aron/work/tech/backend"
BUN_DIR="/home/aron/work/tech/frontend"

cd "$GO_DIR"
go run main.go &
GO_PID=$!

cd "$BUN_DIR"
bun run dev &
BUN_PID=$!

wait $GO_PID $BUN_PID
