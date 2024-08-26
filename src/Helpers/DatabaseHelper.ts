import sqlite from "sqlite3";
import fs from "node:fs";
import crypto from "node:crypto";

type User = {
    user_id: number;
    discord_id: string;
    username: string;
    display_name: string;
    auth_key: string;
}

interface ScoreSubmission {
    song_hash: string;
    instrument: string;
    score: number;
    note_count: number;
    notes_hit_perfect: number;
    notes_hit_good: number;
    misses: number;
    strikes: number;
    difficulty: number;
}

interface Score extends ScoreSubmission  {
    playthrough_id: string;
    user_id: number;
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
                    strikes INTEGER,
                    difficulty INTEGER,
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
            this.db.each("SELECT * FROM Users WHERE discord_id = ?", id, (err, row: User) => {
                res(row);
                resolved = true;
            }, () => {if(!resolved) res(null)});
        });
    };
    getUserByUserId(id: number): Promise<User | null> {
        return new Promise((res) => {
            let resolved = false;
            this.db.each("SELECT * FROM Users WHERE user_id = ?", id, (err, row: User) => {
                res(row);
                resolved = true;
            }, () => {if(!resolved) res(null)});
        });
    };
    getUserByAuthKey(auth_key: string): Promise<User | null> {
        return new Promise((res) => {
            let resolved = false;
            this.db.each("SELECT * FROM Users WHERE auth_key = ?", auth_key, (err, row: User) => {
                res(row);
                resolved = true;
            }, () => {if(!resolved) res(null)});
        });
    }
    addUser(discord_id: string, username: string, display_name: string, auth_key: string): Promise<boolean>{
        return new Promise((res) => {
            this.db.run(`INSERT INTO Users ("discord_id", "username", "display_name", "auth_key") VALUES (?, ?, ?, ?)`, [discord_id, username, display_name, auth_key], (err) => {
                if(!err) res(true); else res(false);
            })
        })
    }
    getLeaderboard(song_hash: string, instrument: string, page = 1): Promise<Score[]> {
        return new Promise( (res) => {
            let items: Score[] = [];
            this.db.each(
                `SELECT * FROM Scores WHERE song_hash = ? AND instrument = ? LIMIT 10 OFFSET ?`, 
                [song_hash, instrument, (page - 1) * 10],
                (err, score: Score) => {
                    items.push(score);
                },
                () => {
                    res(items)
                }
            )
        });
    }
    doesSongHaveLeaderboard(song_hash: string): Promise<boolean> {
        return new Promise( (res) => {
            let exists = false;
            this.db.each(
                `SELECT * FROM Scores WHERE song_hash = ? LIMIT 1`,
                [song_hash],
                (err, score: Score) => {
                    exists = true;
                },
                () => {
                    res(exists);
                }
            )
        })
    }
    submitLeaderboardScore(data: ScoreSubmission, user_id: number): Promise<boolean> {
        let uuid = crypto.randomUUID();
        return new Promise( (res) => {
            this.db.run(`INSERT INTO Scores VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                [uuid, user_id, data.song_hash, data.instrument, data.score, data.note_count, data.notes_hit_perfect, data.notes_hit_good, data.misses, data.strikes, data.difficulty],
                (err) => {if(err) res(false); else res(true);}
            )
        })
    }
    removeExistingScore(user_id: number, song_hash: string, instrument: string): Promise<boolean> {
        return new Promise( (res) => {
            this.db.run(`DELETE FROM Scores WHERE user_id = ? AND song_hash = ? AND instrument = ?`,
                [user_id, song_hash, instrument],
                (err) => {if(err) res(false); else res(true);}
            );
        })
    }
    async getUserScoreAndPosition(user_id: number, song_hash: string, instrument: string){
        let songLeaderboard: Score[] = await new Promise( (res) => {
            let lb: Score[] = [];
            this.db.each(`SELECT * FROM Scores WHERE song_hash = ? AND instrument = ?`,
                [song_hash, instrument],
                (err, score: Score) => {
                    lb.push(score);
                },
                () => {
                    res(lb);
                }
            )
        });
        let pos = songLeaderboard.map( (s) => s.user_id ).indexOf(user_id);

        return {
            pos: pos,
            score: songLeaderboard[pos] || null
        }
    }
}