import { DatabaseHelper } from "./Helpers/DatabaseHelper";
import express, {Request, Response} from "express";
import bodyParser from "body-parser";
import axios from "axios";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import RunTypes from "runtypes";

const DBHelper = new DatabaseHelper();
const app = express();
const config = JSON.parse(readFileSync("./config.json").toString());

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

    let doesLeaderboardExist = await DBHelper.doesSongHaveLeaderboard(hash);
    let data = await DBHelper.getLeaderboard(hash, instrument, page);

    let toSend = await Promise.all(data.map( async (score, index) => {
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
    }));

    doesLeaderboardExist ? res.json(toSend) : res.status(404).send("Song doesn't have any leaderboards.");
});

const LeaderboardSubmission = RunTypes.Record({
	auth: RunTypes.String,
	song_hash: RunTypes.String,
	score: RunTypes.Number,
	note_count: RunTypes.Number,
	notes_hit_perfect: RunTypes.Number,
	notes_hit_good: RunTypes.Number,
	misses: RunTypes.Number,
	strikes: RunTypes.Number,
	instrument: RunTypes.String,
	difficulty: RunTypes.Number
})

app.post("/leaderboards/submit", async (req: Request, res: Response) => {
	if(!LeaderboardSubmission.validate(req.body)) return res.sendStatus(400);
	let data = LeaderboardSubmission.check(req.body);
	let user = await DBHelper.getUserByAuthKey(data.auth);

	if(!user) return res.sendStatus(403);

	await DBHelper.removeExistingScore(user.user_id, data.song_hash, data.instrument);
	
	const {auth, ...toSubmit} = data;
	let success = await DBHelper.submitLeaderboardScore(toSubmit, user.user_id);
	if(success) res.sendStatus(200); else res.sendStatus(520);
})

app.get("/leaderboards/me/:hash", async (req: Request, res: Response) => {
	let hash = req.params.hash as string;
	let auth = req.query.auth as string;
	let instrument = req.query.instument as string;
	if(!hash || !auth || !instrument) return res.sendStatus(400);

	let user = await DBHelper.getUserByAuthKey(auth);
	if(!user) return res.sendStatus(403);

	let leaderboardData = await DBHelper.getUserScoreAndPosition(user.user_id, hash, instrument);
	if(leaderboardData.pos === -1) return res.sendStatus(404);
	let score = leaderboardData.score;

	res.json({
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
			position: leaderboardData.pos
		}
	});
})

app.listen(config.webserver.port, () => {
    console.log("Webserver active on port " + config.webserver.port);
});