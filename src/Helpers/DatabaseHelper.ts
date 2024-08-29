import sqlite from "sqlite3";
import fs from "node:fs";
import crypto from "node:crypto";

type User = {
    user_id: number;
    discord_id: string;
    username: string;
    display_name: string;
    auth_key: string;
    blacklisted: number;
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

export interface Song {
    song_hash: string,
    title: string,
    artist: string, 
    album: string,
    charters: string,
    source: string,
    diff_drums: number,
    diff_bass: number,
    diff_guitar: number,
    diff_vocals: number,
    diff_plastic_drums: number,
    diff_plastic_bass: number,
    diff_plastic_guitar: number,
    song_length: number
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
                    auth_key TEXT,
                    blacklisted INTEGER DEFAULT 0
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
                    FOREIGN KEY (user_id) REFERENCES Users(user_id),
                    FOREIGN KEY (song_hash) REFERENCES Songs(song_hash)
                );
            `);
            this.db.run(`
                CREATE TABLE Songs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    song_hash TEXT,
                    title TEXT,
                    artist TEXT,
                    album TEXT,
                    charters TEXT,
                    source TEXT,
                    diff_drums INTEGER,
                    diff_bass INTEGER,
                    diff_guitar INTEGER,
                    diff_vocals INTEGER,
                    diff_plastic_drums INTEGER,
                    diff_plastic_bass INTEGER,
                    diff_plastic_guitar INTEGER,
                    song_length INTEGER
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
                `SELECT * FROM Scores WHERE song_hash = ? AND instrument = ? LIMIT 10 OFFSET ? ORDER BY Score DESC`, 
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
                `SELECT * FROM Songs WHERE song_hash = ?`,
                [song_hash],
                (err) => {
                    exists = true;
                },
                () => {
                    res(exists);
                }
            )
        });
    }
    createSong(data: Song): Promise<boolean> {
        return new Promise( (res) => {
            this.db.run(
                `INSERT INTO Songs ("song_hash","title","artist","album","charters","source","diff_drums","diff_bass","diff_guitar","diff_vocals","diff_plastic_drums","diff_plastic_bass","diff_plastic_guitar","song_length") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [data.song_hash, data.title, data.artist, data.album, data.charters, data.source, data.diff_drums, data.diff_bass, data.diff_guitar, data.diff_vocals, data.diff_plastic_drums, data.diff_plastic_bass, data.diff_plastic_guitar, data.song_length],
                (err) => {
                    if(!err) res(true); else res(false);
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
            this.db.each(`SELECT * FROM Scores WHERE song_hash = ? AND instrument = ? ORDER BY Score DESC`,
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
            pos: pos+1,
            score: songLeaderboard[pos] || null
        }
    }
    getAllSongs(): Promise<Song[]> {
        return new Promise( (res) => {
            let songs: Song[] = [];
            this.db.each(`SELECT * FROM Songs`, (err, song: Song) => {
                songs.push(song);
            }, () => {
                res(songs);
            })
        })
    }
}