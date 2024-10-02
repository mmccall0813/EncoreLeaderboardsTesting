import { DatabaseHelper, ScoreSubmission, User } from "./Helpers/DatabaseHelper";
import express, {NextFunction, Request, RequestHandler, Response} from "express";
import bodyParser from "body-parser";
import axios from "axios";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {Record, String as RString, Number as RNumber} from "runtypes";
import { LeaderboardBot as DiscordBot } from "./Helpers/DiscordBot";

const DBHelper = new DatabaseHelper();
const app = express();
const config = JSON.parse(readFileSync("./config.json").toString());

const blacklist = (existsSync("./blacklist.txt") ? readFileSync("./blacklist.txt").toString().split("\n") : []);

interface AuthorizedRequest extends Request {
    user?: User;
}

const requireAuthentication: RequestHandler = async (req: AuthorizedRequest, res: Response, next: NextFunction) => {
    let apikey = req.headers?.authorization;
    if(!apikey) return res.status(400).send("Missing authorization header. (must be your API key encoded in base64)");
    
    let decoded = apikey.replace("Bearer ", "");
    let user = await DBHelper.getUserByAuthKey(decoded);

    if(!user) return res.status(401).send("Invalid authorization header. (must be a valid API key encoded in base64)");
    if(user.blacklisted === 1) return res.status(403).send("You are blacklisted from making requests to this API.");
    req.user = user;

    next();
}

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get("/discord-auth/onboarding", async (req: Request, res: Response) => {
	let code = req.query.code as string;
	let apiUrl = "https://discord.com/api/v10/oauth2";
	let params = new URLSearchParams();

	params.append("client_id", config.discord.client_id as string);
    params.append("client_secret", config.discord.client_secret as string);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", config.discord.redirect_uri as string);

	let tokenReq; 
    try { 
        tokenReq = await axios.post(apiUrl + "/token", params);
    } catch(err){
        return res.status(403).end(); // something went wrong
    }
	let tokenData : {access_token: string, token_type: StringConstructor, expires_in: number, refresh_token: string, scope: string} = tokenReq.data;

    let infoResponse = await axios.get(apiUrl + "/@me", {
        "headers": {
            Authorization: "Bearer " + tokenData.access_token
        }
    });

	let possibleAccount = await DBHelper.getUserByDiscordId(infoResponse.data.user.id);
	let apiKey = possibleAccount?.auth_key || crypto.randomBytes(32).toString('hex');
	if(!possibleAccount){
		await DBHelper.addUser(infoResponse.data.user.id, infoResponse.data.user.username, infoResponse.data.user.global_name || infoResponse.data.user.username, apiKey);
	}

	// todo: create a less ugly page for this
	res.send("Your API key is: " + apiKey);
});

type apiScore = {
    submitter: {
        display_name: string,
        username: string,
        discord_id: string
    },
    run: {
        uuid: string,
        score: number,
        note_count: number,
        notes_hit_perfect: number,
        notes_hit_good: number,
        misses: number,
        strikes: number
        instrument: string,
        difficulty: number
    },
    leaderboard: {
        position: number
    }
}

app.get("/leaderboards/song/:hash", async (req: Request, res: Response) => {
    let hash = req.params.hash;
    let instrument = req.query["instrument"] as string;
    let page = parseInt( req.query["page"] as string || "1" );

    if(Number.isNaN(page) || page <= 0) return res.status(400).send(`Invalid page parameter. (must be greater than 0, got ${page})`);
    if(!instrument) return res.status(400).send(`No instrument parameter found.`);

    let doesSongExist = await DBHelper.doesSongExist(hash);

    if(!doesSongExist) return res.status(404).send("Song hash doesn't have a leaderboard associated with it");

    let data = await DBHelper.getScores(hash, instrument, page);
    let totalScores = await DBHelper.getScoreCount(hash, instrument);

    let toSend = {
        scores: await Promise.all(data.map( async (score, index) => {
            let user = await DBHelper.getUserByUserId(score.user_id);
            return {
                submitter: {
                    display_name: user?.display_name,
                    username: user?.username,
                    discord_id: user?.discord_id
                },
                run: {
                    uuid: score.playthrough_id,
                    score: score.score,
                    note_count: score.note_count,
                    notes_hit_good: score.notes_hit_good,
                    notes_hit_perfect: score.notes_hit_perfect,
                    misses: score.misses,
                    strikes: score.strikes,
                    instrument: score.instrument,
                    difficulty: score.difficulty
                },
                leaderboard: {
                    position: ((page - 1) * 10) + index + 1
                }
            } as apiScore;
        })),
        context: {
            current_page: page,
            total_pages: Math.ceil(totalScores / 10),
            total_scores: totalScores
        }
    };

    res.json(toSend);
});

const LeaderboardSubmission = Record({
	score: RNumber,
	note_count: RNumber,
	notes_hit_perfect: RNumber,
	notes_hit_good: RNumber,
	misses: RNumber,
	strikes: RNumber,
	instrument: RString,
	difficulty: RNumber
});

app.post("/leaderboards/song/:hash/submit", requireAuthentication, async (req: AuthorizedRequest, res: Response) => {
	if(typeof req.body !== "object" || !LeaderboardSubmission.validate(req.body).success) return res.sendStatus(400);
	let data = LeaderboardSubmission.check(req.body);
    let hash = req.params.hash;

    if(blacklist.includes(hash)) return res.sendStatus(403);
	if(!req.user || req.user.blacklisted === 1) return res.sendStatus(401);
    if(!await DBHelper.doesSongExist(hash)) return res.status(404).send("Song hash doesn't have a leaderboard associated with it")

	await DBHelper.removeExistingScore(req.user.user_id, hash, data.instrument);
	
	let toSubmit: ScoreSubmission = {...data, song_hash: hash};
	let success = await DBHelper.submitLeaderboardScore(toSubmit, req.user.user_id);
	if(success) res.sendStatus(200); else res.sendStatus(520);
});

const SongSubmission = Record({
    title: RString,
    artist: RString, 
    album: RString,
    charters: RString,
    source: RString,
    diff_drums: RNumber,
    diff_bass: RNumber,
    diff_guitar: RNumber,
    diff_vocals: RNumber,
    diff_plastic_drums: RNumber,
    diff_plastic_bass: RNumber,
    diff_plastic_guitar: RNumber,
    song_length: RNumber
});

app.post("/leaderboards/song/:hash/create", requireAuthentication, async (req: AuthorizedRequest, res: Response) => {
    if(typeof req.body !== "object" || !SongSubmission.validate(req.body).success) return res.sendStatus(400);
    let data = SongSubmission.check(req.body);
    let hash = req.params.hash;

    if(blacklist.includes(hash)) return res.status(403).send("That song is blacklisted.");
    if(!req.user) return res.sendStatus(400);
    if(await DBHelper.doesSongExist(hash)) return res.status(409).send("Leaderboard already exists.");

    let toSubmit = {...data, song_hash: hash};
    let success = await DBHelper.createSong(toSubmit);

    if(success) res.sendStatus(200); else res.sendStatus(520);
});

app.get("/leaderboards/song/:hash/me", requireAuthentication, async (req: AuthorizedRequest, res: Response) => {
	let hash = req.params.hash as string;
	let instrument = req.query.instrument as string;
	if(!hash || !req.user || !instrument) return res.sendStatus(400);

	let leaderboardData = await DBHelper.getUserScoreAndPosition(req.user.user_id, hash, instrument);
	if(leaderboardData.pos === -1) return res.sendStatus(404);
	let score = leaderboardData.score;

	res.json({
		submitter: {
			display_name: req.user?.display_name,
			username: req.user?.username,
			discord_id: req.user?.discord_id
		},
		run: {
			uuid: score.playthrough_id,
			score: score.score,
			note_count: score.note_count,
			notes_hit_good: score.notes_hit_good,
			notes_hit_perfect: score.notes_hit_perfect,
			misses: score.misses,
			strikes: score.strikes,
			instrument: score.instrument,
			difficulty: score.difficulty
		},
		leaderboard: {
			position: leaderboardData.pos
		}
	});
});

// init discord bot
const bot = config.discord.bot_token !== "" ? new DiscordBot(config, DBHelper) : undefined;

app.listen(config.webserver.port, () => {
    console.log("Webserver active on port " + config.webserver.port);
});