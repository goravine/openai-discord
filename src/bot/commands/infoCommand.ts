import {
  Client, CommandInteraction, CommandInteractionOptionResolver, SlashCommandBuilder,
} from 'discord.js';
import { Command } from '@/bot/models/command';
import { SystemEmbed } from '@/bot/embeds/systemEmbed';
import { EmbedAuthor, EmbedType } from '@/bot/models/embed';
import process from 'process';

export const InfoCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('List all the ENV information'),
  execute: async (client: Client, interaction: CommandInteraction) => {
    /**
     * Adds a loading message to the channel
     */
    await interaction.deferReply({ ephemeral : true }); // Defer the reply to the interaction

    /**
     * Create the content for the message and calculate the latency
     */
    var content = `ENV Information:\n`;

    Object.keys(process.env).forEach((key) => {
      content += `${key}: ${process.env[key]}\n`;
    });

    /**
     * Create the embed message
     */
    const embed = new SystemEmbed(client, interaction, EmbedAuthor.None, EmbedType.Info, content);
    embed.setTitle('Information');

    /**
     * Send embed message to the channel
     */
    await interaction.followUp({
      fetchReply: true,
      embeds: [
        embed,
      ],
    });
  },
};
