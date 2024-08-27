import {SlashCommandBuilder} from '@discordjs/builders';
import {EmbedBuilder, Interaction, ChatInputCommandInteraction} from 'discord.js';
import { ExtendedClient, Command } from '../DiscordBot';

const data = new SlashCommandBuilder()
    .setName('testcommand')
    .setDescription('Simple little testing command.');

const exec = (interaction: ChatInputCommandInteraction, client: ExtendedClient) => {
    if(!interaction.isCommand()) return;
    const embed = new EmbedBuilder()
        .setTitle('Test')
        .setDescription('Hello, world!')

    interaction.reply({
        ephemeral: false,
        embeds: [embed]
    });
}

const exportData: Command = {
    data: data,
    exec: exec
}

export default exportData;