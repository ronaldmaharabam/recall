#!/bin/bash

SESSION="tech"
BASE="/home/aron/work/tech"

tmux new-session -d -s "$SESSION" -c "$BASE"

tmux split-window -h -t "$SESSION" -c "$BASE/frontend" 'bun run dev'
tmux select-pane -t 0
tmux send-keys -t "$SESSION" "cd $BASE/backend && go run main.go" C-m

tmux new-window -t "$SESSION" -c "$BASE"

tmux attach -t "$SESSION"

