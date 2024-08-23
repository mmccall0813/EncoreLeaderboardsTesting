import sqlite from "sqlite3";
import fs from "node:fs";

type User = {
    user_id: number;
    discord_id: string;
    username: string;
    display_name: string;
    auth_key: string;
}

export class DatabaseHelper {
    db: sqlite.Database;
    constructor(){
        if(!fs.existsSync("./data/")) fs.mkdirSync("./data");
        const initDatabase = !fs.existsSync("./data/data.sqlite3")

        this.db = new sqlite.Database("./data/data.sqlite3");

        if(initDatabase){
            console.log("Initalizing database...");
            this.db.run(`
                CREATE TABLE Users (
                    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    discord_id TEXT UNIQUE NOT NULL,
                    username TEXT NOT NULL,
                    display_name TEXT,
                    auth_key TEXT
                );
            `);
            this.db.run(`
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
            this.db.wait(() => {
                this.db.run(`
                    CREATE INDEX idx_song_hash ON Scores(song_hash);
                `);
                this.db.run(`
                    CREATE INDEX idx_user_id ON Scores(user_id);
                `);
            });
        }
    }
    getUserByDiscordId(id: string): Promise<User | null> {
        return new Promise((res) => {
            let resolved = false;
            this.db.each("SELECT * FROM Users WHERE discord_id = ?", id, (err, row) => {
                res(row as User);
                resolved = true;
            }, () => {if(!resolved) res(null)});
        });
    };
    getUserByUserId(id: number): Promise<User | null> {
        return new Promise((res) => {
            let resolved = false;
            this.db.each("SELECT * FROM Users WHERE user_id = ?", id, (err, row) => {
                res(row as User);
                resolved = true;
            }, () => {if(!resolved) res(null)});
        });
    };
    addUser(discord_id: string, username: string, display_name: string, auth_key: string): Promise<boolean>{
        return new Promise((res) => {
            this.db.run(`INSERT INTO Users ("discord_id", "username", "display_name", "auth_key") VALUES (?, ?, ?, ?)`, [discord_id, username, display_name, auth_key], (err) => {
                if(!err) res(true); else res(false);
            })
        })
    }
}