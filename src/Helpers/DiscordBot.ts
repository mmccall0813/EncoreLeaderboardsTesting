import {Client, GatewayIntentBits, ChatInputCommandInteraction, REST, Routes, RESTPostAPIChatInputApplicationCommandsJSONBody, SharedSlashCommand} from "discord.js";
import { DatabaseHelper } from "./DatabaseHelper";
import { readdir } from "fs";
import { join } from "path";

export interface Command {
    data: SharedSlashCommand
    exec: (interaction: ChatInputCommandInteraction, client: ExtendedClient) => any
}

export class ExtendedClient extends Client {
    DBHelper: DatabaseHelper;
    constructor(database: DatabaseHelper){
        super({intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]});
        this.DBHelper = database;
    }
}

export class LeaderboardBot {
    client: ExtendedClient;
    commands: Command[];
    config: any;
    constructor(config: any, database: DatabaseHelper){
        this.client = new ExtendedClient(database);
        this.commands = [];
        this.config = config;
        
        readdir(join(__dirname, "BotCommands"), (err, files) => {
            if(err) console.log(err);
            console.log(`Attempting to import ${files.filter(x => x.endsWith(".js")).length} command files to bot.`);
            let imported = 0;

            files.forEach( async (file) => {
                if(!file.endsWith(".js")) return imported++;
                try {
                    let command: Command = (await import(`./BotCommands/${file}`)).default;

                    this.commands.push(command);
                } catch (err) {
                    console.log(`Failed importing command file "${file}"\n${err}`);
                }
                imported++;
                if(imported === files.length) this.registerAllCommands();
            });
        });

        this.client.login(this.config.discord.bot_token);

        this.client.on("interactionCreate", (interaction) => {
            if(interaction.isChatInputCommand()){
                let cmd = this.commands.find( (c) => c.data.name === interaction.commandName );

                if(!cmd) return; // should never happen?
                cmd.exec(interaction, this.client);
            }
        })
    }
    registerAllCommands(){
        console.log("Registering bot commands...");

        let commandData: RESTPostAPIChatInputApplicationCommandsJSONBody[] /* what a name */  = [];

        this.commands.forEach( (cmd) => {
            commandData.push(cmd.data.toJSON());
        });

        const rest = new REST( {version: "10"} ).setToken(this.config.discord.bot_token);

        this.config.discord.register_commands_globally ?
        rest.put(Routes.applicationCommands(this.config.discord.client_id), {body: commandData}).then( (res) => {
            console.log("Bot commands registered successfully!");
        }) 
        :
        rest.put(Routes.applicationGuildCommands(this.config.discord.client_id, this.config.discord.command_register_server), {body: commandData}).then( (res) => {
            console.log("Bot commands registered successfully!");
        })
    }
}