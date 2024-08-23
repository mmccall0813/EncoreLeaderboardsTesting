import sqlite from "sqlite3";
import fs from "node:fs";

if(!fs.existsSync("./data/")) fs.mkdirSync("./data");
const initDatabase = !fs.existsSync("./data/data.sqlite3")

const db = new sqlite.Database("./data/data.sqlite3");

if(initDatabase){
	console.log("Initalizing database...");
	db.run(`
		CREATE TABLE Users (
    		user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    		discord_id TEXT UNIQUE NOT NULL,
    		username TEXT NOT NULL,
    		display_name TEXT,
    		auth_key TEXT
		);
	`);
	db.run(`
		CREATE TABLE Scores (
    		playthrough_id TEXT PRIMARY KEY,
    		user_id INTEGER,
    		song_hash TEXT NOT NULL,
    		instrument TEXT,
    		score INTEGER,
    		note_count INTEGER,
    		notes_hit_perfect INTEGER,
    		notes_hit_good INTEGER,
    		misses INTEGER,
    		FOREIGN KEY (user_id) REFERENCES Users(user_id)
		);
	`);
	db.wait(() => {
		db.run(`
			CREATE INDEX idx_song_hash ON Scores(song_hash);
			CREATE INDEX idx_user_id ON Scores(user_id);
		`);
	})
};