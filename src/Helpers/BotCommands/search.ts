import {SlashCommandBuilder} from '@discordjs/builders';
import {EmbedBuilder, ChatInputCommandInteraction} from 'discord.js';
import { ExtendedClient, Command } from '../DiscordBot';
import Fuse from "fuse.js";
import handleSingleResult from './search/singleResult';
import handleMultipleResults from './search/multipleResults';

const data = new SlashCommandBuilder()
    .setName('findsong')
    .setDescription('Search for a song and get some basic info about it.')
    .addStringOption( (option) => option.setName("query").setDescription("Can be title, artist, or album name").setRequired(true) );

const exec = async (interaction: ChatInputCommandInteraction, client: ExtendedClient) => {
    const songs = await client.DBHelper.getAllSongs();
    const fuse = new Fuse(songs, {
        keys: ["title", "artist", "album"]
    });

    const search = fuse.search(interaction.options.getString("query") || ""); // the `|| ""` is just to make typescript stfu, it should never fallback to that

    
    if(search.length === 1) return handleSingleResult(interaction, client, search[0]);
    if(search.length > 1) return handleMultipleResults(interaction, client, search);

    let embed = new EmbedBuilder().setTitle("Search Results")
    .setDescription("Couldn't find anything with that query...")
    .setColor("Red")

    interaction.reply({ embeds: [embed] });
}

const exportData: Command = {
    data: data,
    exec: exec
}

export default exportData;