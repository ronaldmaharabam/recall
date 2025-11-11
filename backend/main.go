package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var db *sql.DB

func main() {
	var err error
	db, err = sql.Open("sqlite", "recall.db")
	if err != nil {
		log.Fatal(err)
	}
	createSchema()

	mux := http.NewServeMux()
	mux.HandleFunc("/get_groups", getGroups)
	mux.HandleFunc("/add_group", addGroup)
	mux.HandleFunc("/add_topic", addTopic)
	mux.HandleFunc("/add_topic_to_group", addTopicToGroup)
	mux.HandleFunc("/search_topics", searchTopics)
	mux.HandleFunc("/add_review", addReview)
	mux.HandleFunc("/scores", getScores)

	log.Println("Server running on :8080")
	log.Fatal(http.ListenAndServe(":8080", withCORS(mux)))
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

func writeJSON(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func writeErr(w http.ResponseWriter, err error, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func createSchema() {
	schema := `
CREATE TABLE IF NOT EXISTS learners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT
);

CREATE TABLE IF NOT EXISTS topics (
  title TEXT PRIMARY KEY,
  value REAL DEFAULT 1.0,
  difficulty REAL DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS groups (
  title TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS group_topics (
  group_title TEXT,
  topic_title TEXT,
  PRIMARY KEY (group_title, topic_title),
  FOREIGN KEY (group_title) REFERENCES groups(title) ON DELETE CASCADE,
  FOREIGN KEY (topic_title) REFERENCES topics(title) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id INTEGER,
  topic_title TEXT,
  score INTEGER,
  timestamp REAL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS learner_topic_state (
  learner_id INTEGER,
  topic_title TEXT,
  decay_rate REAL DEFAULT 0.693,
  last_update REAL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (learner_id, topic_title)
);
`
	if _, err := db.Exec(schema); err != nil {
		log.Fatal(err)
	}
}

// ------------------------------------------------------------
// Groups
// ------------------------------------------------------------

func getGroups(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`SELECT g.title, COUNT(gt.topic_title)
		FROM groups g
		LEFT JOIN group_topics gt ON gt.group_title = g.title
		GROUP BY g.title
		ORDER BY g.title`)
	if err != nil {
		writeErr(w, err, 500)
		return
	}
	defer rows.Close()

	type G struct {
		Title string `json:"title"`
		Count int    `json:"count"`
	}
	var out []G
	for rows.Next() {
		var g G
		rows.Scan(&g.Title, &g.Count)
		out = append(out, g)
	}
	writeJSON(w, out)
}

func addGroup(w http.ResponseWriter, r *http.Request) {
	title := strings.TrimSpace(r.URL.Query().Get("title"))
	if title == "" {
		writeErr(w, http.ErrNoLocation, 400)
		return
	}
	if _, err := db.Exec("INSERT OR IGNORE INTO groups (title) VALUES (?)", title); err != nil {
		writeErr(w, err, 500)
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

// ------------------------------------------------------------
// Topics
// ------------------------------------------------------------

func addTopic(w http.ResponseWriter, r *http.Request) {
	title := strings.TrimSpace(r.URL.Query().Get("title"))
	if title == "" {
		writeErr(w, http.ErrNoLocation, 400)
		return
	}
	groupsParam := r.URL.Query().Get("groups")
	var groups []string
	if groupsParam != "" {
		for _, g := range strings.Split(groupsParam, ",") {
			g = strings.TrimSpace(g)
			if g != "" {
				groups = append(groups, g)
			}
		}
	}
	_, _ = db.Exec("INSERT OR IGNORE INTO topics (title) VALUES (?)", title)
	for _, g := range groups {
		_, _ = db.Exec("INSERT OR IGNORE INTO group_topics (group_title, topic_title) VALUES (?,?)", g, title)
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

func addTopicToGroup(w http.ResponseWriter, r *http.Request) {
	title := strings.TrimSpace(r.URL.Query().Get("title"))
	if title == "" {
		writeErr(w, http.ErrNoLocation, 400)
		return
	}
	groupsParam := r.URL.Query().Get("groups")
	if groupsParam == "" {
		writeErr(w, http.ErrNoLocation, 400)
		return
	}
	for _, g := range strings.Split(groupsParam, ",") {
		g = strings.TrimSpace(g)
		if g == "" {
			continue
		}
		_, _ = db.Exec("INSERT OR IGNORE INTO group_topics (group_title, topic_title) VALUES (?,?)", g, title)
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

func searchTopics(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	like := "%" + q + "%"
	rows, err := db.Query(`
		SELECT t.title, GROUP_CONCAT(gt.group_title, ',') as groups
		FROM topics t
		LEFT JOIN group_topics gt ON gt.topic_title = t.title
		WHERE t.title LIKE ?
		GROUP BY t.title
		ORDER BY t.title
		LIMIT 100`, like)
	if err != nil {
		writeErr(w, err, 500)
		return
	}
	defer rows.Close()
	type R struct {
		Title  string `json:"title"`
		Groups string `json:"groups"`
	}
	var out []R
	for rows.Next() {
		var r0 R
		rows.Scan(&r0.Title, &r0.Groups)
		out = append(out, r0)
	}
	writeJSON(w, out)
}

// ------------------------------------------------------------
// Adaptive Review System
// ------------------------------------------------------------

func addReview(w http.ResponseWriter, r *http.Request) {
	learnerID, _ := strconv.Atoi(r.URL.Query().Get("learner"))
	if learnerID == 0 {
		learnerID = 1
	}
	title := r.URL.Query().Get("title")
	score, _ := strconv.Atoi(r.URL.Query().Get("score"))
	if score < 0 {
		score = 0
	} else if score > 3 {
		score = 3
	}
	now := float64(time.Now().Unix())

	var decayRate, lastT float64
	err := db.QueryRow(`SELECT decay_rate, last_update FROM learner_topic_state
		WHERE learner_id=? AND topic_title=?`,
		learnerID, title).Scan(&decayRate, &lastT)

	isNew := false
	if err == sql.ErrNoRows {
		// brand new topic — never reviewed before
		isNew = true
		decayRate = math.Log(2) / 1.0 // baseline 1-day decay
		lastT = now
	}

	currentHalf := math.Log(2) / decayRate
	dt := (now - lastT) / 86400.0
	pBefore := math.Exp(-decayRate * dt)

	var nextHalf float64

	if isNew {
		// ✅ brand new → start at 1-day interval, not doubled
		nextHalf = 1
	} else {
		switch {
		case score == 0:
			nextHalf = 1
		case score == 3:
			nextHalf = currentHalf * 2
		default:
			scale := 1.0 + float64(score)/3.0
			nextHalf = currentHalf * scale
		}
	}

	newDecay := math.Log(2) / nextHalf

	_, _ = db.Exec(`INSERT INTO learner_topic_state (learner_id, topic_title, decay_rate, last_update)
		VALUES (?,?,?,?)
		ON CONFLICT(learner_id, topic_title)
		DO UPDATE SET decay_rate=excluded.decay_rate, last_update=excluded.last_update`,
		learnerID, title, newDecay, now)

	_, _ = db.Exec(`INSERT INTO reviews (learner_id, topic_title, score, timestamp)
		VALUES (?,?,?,?)`, learnerID, title, score, now)

	writeJSON(w, map[string]any{
		"status":              "ok",
		"topic":               title,
		"score":               score,
		"is_new":              isNew,
		"p_before":            pBefore,
		"next_half":           nextHalf,
		"next_review_in_days": nextHalf,
	})
}

// ------------------------------------------------------------
// Scores & Forgetfulness
// ------------------------------------------------------------

func getScores(w http.ResponseWriter, r *http.Request) {
	learnerID, _ := strconv.Atoi(r.URL.Query().Get("learner"))
	if learnerID == 0 {
		learnerID = 1
	}
	q := r.URL.Query().Get("q")
	groupsParam := r.URL.Query().Get("groups")
	like := "%" + q + "%"

	base := `
		SELECT t.title, t.value, t.difficulty, s.decay_rate, s.last_update
		FROM topics t
		LEFT JOIN learner_topic_state s ON s.topic_title = t.title AND s.learner_id = ?
	`
	args := []any{learnerID}

	if groupsParam != "" {
		groups := strings.Split(groupsParam, ",")
		validGroups := []string{}
		for _, g := range groups {
			if g = strings.TrimSpace(g); g != "" {
				validGroups = append(validGroups, g)
			}
		}
		if len(validGroups) > 0 {
			groupArgs := make([]any, len(validGroups))
			for i, g := range validGroups {
				groupArgs[i] = g
			}
			ph := strings.Repeat("?,", len(validGroups))
			ph = strings.TrimRight(ph, ",")
			args = append(args, groupArgs...)
			base += `
				INNER JOIN (
					SELECT topic_title
					FROM group_topics
					WHERE group_title IN (` + ph + `)
					GROUP BY topic_title
					HAVING COUNT(DISTINCT group_title) = ` + strconv.Itoa(len(validGroups)) + `
				) gx ON gx.topic_title = t.title
			`
		}
	}

	base += " WHERE t.title LIKE ?"
	args = append(args, like)

	rows, err := db.Query(base, args...)
	if err != nil {
		writeErr(w, err, 500)
		return
	}
	defer rows.Close()

	type Result struct {
		Title       string  `json:"title"`
		Score       float64 `json:"score"`
		Forgetness  float64 `json:"forgetness"`
		LastUpdated float64 `json:"last_updated"`
	}

	now := float64(time.Now().Unix())
	var reviewed, unreviewed []Result

	for rows.Next() {
		var title string
		var value, diff float64
		var decay, last sql.NullFloat64
		rows.Scan(&title, &value, &diff, &decay, &last)
		if !decay.Valid {
			unreviewed = append(unreviewed, Result{Title: title})
			continue
		}
		dt := (now - last.Float64) / 86400.0
		p := math.Exp(-decay.Float64 * dt)
		f := 1 - p
		U := value * f / (1 + diff)
		reviewed = append(reviewed, Result{
			Title:       title,
			Score:       U,
			Forgetness:  f,
			LastUpdated: last.Float64,
		})
	}

	sort.Slice(reviewed, func(i, j int) bool { return reviewed[i].Score > reviewed[j].Score })
	writeJSON(w, map[string]any{
		"to_review":  reviewed,
		"unreviewed": unreviewed,
	})
}

