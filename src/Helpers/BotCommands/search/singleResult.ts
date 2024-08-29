import {EmbedBuilder, ChatInputCommandInteraction} from 'discord.js';
import { ExtendedClient } from '../../DiscordBot';
import { FuseResult } from 'fuse.js';
import { Song } from '../../DatabaseHelper';

export default function handleSingleResult(interaction: ChatInputCommandInteraction, client: ExtendedClient, result: FuseResult<Song>){
    const embed = new EmbedBuilder();
    let song = result.item;

    embed.setTitle(song.title || "No song title...?");
    embed.setColor("DarkPurple");
    embed.setFooter({text: song.song_hash});

    embed.addFields( [
        {name: "Artist", value: song.artist || "?", inline: true},
        {name: "Album", value: song.album || "?", inline: true},
        {name: "Charters", value: song.charters || "?", inline: true},
        {name: "Source", value: song.source || "?", inline: true},
        {name: "Length", value: `${Math.floor(song.song_length / 60)}m ${song.song_length % 60}s`, inline: true}
    ]);

    let diffKeys = ["bass", "drums", "guitar", "vocals", "plastic_bass", "plastic_guitar", "plastic_drums"];
    let difficulties: String[] = [];

    // slightly inefficient way of doing this, but typescript got really mad at other implementations
    Object.keys(song).forEach( (key, idx) => {
        if(diffKeys.indexOf(key.replace("diff_","")) != -1){
            let diff = Object.values(song)[idx];
            if(diff === -1) return;
            let diffstring = key.replace("diff_", "").replaceAll("_", " ") + ": ";
            diffstring += ("■".repeat(diff));
            diffstring += ("□".repeat(7 - diff));
            difficulties.push(diffstring);
        }
    });

    embed.addFields( {name: "Difficulties", value: `\`\`\`\n${difficulties.join("\n")}\n\`\`\``});

    interaction.replied ? interaction.editReply( {embeds: [embed], components: []} ) : interaction.reply( { embeds: [embed] });
}