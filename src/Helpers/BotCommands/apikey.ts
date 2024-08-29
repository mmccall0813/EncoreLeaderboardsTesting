import {SlashCommandBuilder} from '@discordjs/builders';
import {EmbedBuilder, ChatInputCommandInteraction} from 'discord.js';
import { ExtendedClient, Command } from '../DiscordBot';
import crypto from "crypto";

const data = new SlashCommandBuilder()
    .setName('apikey')
    .setDescription('Fetches your leaderboard api key.');

const exec = async (interaction: ChatInputCommandInteraction, client: ExtendedClient) => {
    let user = await client.DBHelper.getUserByUserId(parseInt(interaction.user.id));

    let key = user?.auth_key || crypto.randomBytes(32).toString("hex");

    if(!user) await client.DBHelper.addUser(interaction.user.id, interaction.user.username, interaction.user.displayName, key);
    
    const embed = new EmbedBuilder()
        .setTitle('Api Key')
        .setDescription(`Your api key is \`${key}\``)

    interaction.reply({
        ephemeral: true,
        embeds: [embed]
    });
}

const exportData: Command = {
    data: data,
    exec: exec
}

export default exportData;