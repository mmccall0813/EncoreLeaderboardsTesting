import { DatabaseHelper } from "./Helpers/DatabaseHelper";
import express, {Request, Response} from "express";
import bodyParser from "body-parser";
import axios from "axios";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

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
		console.log(err);
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

app.listen(config.webserver.port)