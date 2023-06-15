import {
  ActivityType, Client, CommandInteraction, IntentsBitField, Interaction, Partials, REST, Routes, VoiceChannel, VoiceBasedChannel,
} from 'discord.js';
import process from 'process';
import { Logger } from '@/logger';
import { Runnable } from '@/models/runnable';
import { AI } from '@/models/ai';
import { commands } from '@/bot/commands';
import axios , {AxiosError } from 'axios';
import ytdl from 'ytdl-core';
import { 
	joinVoiceChannel,
	createAudioPlayer,
	createAudioResource,
	entersState,
	StreamType,
	AudioPlayerStatus,
	VoiceConnectionStatus,
  DiscordGatewayAdapterCreator, } from "@discordjs/voice";

export class Bot implements Runnable {
	// Define a conversation ID map
	public conversationHistory = new Map<string, Array<{ role: string, content: string }>>();
  
  private readonly _logger: Logger;
  
  private readonly _ai: AI;
  
  private readonly _client: Client;
  
  public player = createAudioPlayer();
  
  constructor(ai: AI) {
    this._logger = new Logger(Bot.name);
    this._ai = ai;
    
    this._client = new Client({
      intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.DirectMessages,
      ],
      partials: [
        Partials.Channel, // For DMs
      ],
    });
  }

  private async handleSlashCommand(interaction: CommandInteraction): Promise<void> {
    const slashCommand = commands.find((command) => command.data.name === interaction.commandName);
    if (!slashCommand) {
      this._logger.logService.warning(`SlashCommand [${interaction.commandName}] not found.`);
      await interaction.followUp({ content: 'An error has occurred' });
      return;
    }

    this._logger.logService.debug(`SlashCommand [${interaction.commandName}] executed properly.`); // Log command execution
    await slashCommand.execute(this._client, interaction, this._ai); // Execute command
  }

  run(): void {
    this._client.login(process.env.DISCORD_API_KEY).then(() => {
      this._logger.logService.info('Discord Client has been initialized successfully.'); // Log service initialization
    }).catch((error) => {
      this._logger.logService.error(`Failed to start Discord Service: ${error}`); // Log service initialization error
      process.exit(1); // Exit process
    });

    this._client.on('ready', async () => {
      if (!this._client.user || !this._client.application) {
        return;
      }
      
      try {
        const availableCommands = commands.map((command) => command.data.toJSON());
        const rest = new REST().setToken(process.env.DISCORD_API_KEY as string);

        await rest.put(
          Routes.applicationCommands(this._client.application.id),
          { body: availableCommands },
        );

        this._logger.logService.info(`Discord API REST [${availableCommands.length}] commands registered successfully.`);
      } catch (error) {
        this._logger.logService.error(`Failed to start Discord API REST: ${error}`);
        process.exit(1); // Exit process
      }
      
      this._client.user?.setActivity({name: 'VALORANT', type: ActivityType.Playing });
    });
    
    this._client.on('interactionCreate', async (interaction: Interaction) => {
      
      if (interaction.isCommand() || interaction.isChatInputCommand()) {
        await this.handleSlashCommand(interaction); // Handle slash command
      }
    });
    
  this._client.on('messageCreate', async (message: any) => {
    //play music function
    this.playMusic(message);

    if (message.mentions.has(this._client.user, { ignoreRoles: true })) {
      const messageContent = message.content.replace(/<@!?\d+>/, '').trim();
      if (messageContent) {
        const channelId = message.channel.id;
        let conversation = this.conversationHistory.get(channelId);
        if (!conversation) {
          conversation = [{ role: 'user', content: messageContent }];
          this.conversationHistory.set(channelId, conversation);
        } else {
          conversation.push({ role: 'user', content: messageContent });
          this.conversationHistory.set(channelId, conversation);
        }
  
        const thinkingMessage = await message.channel.send('Thinking...');
        const maxToken = parseInt(process.env.MAX_TOKEN ?? '1024');
        const tokensPerChunk = 1024; // Adjust as needed
        
        console.log("MAX TOKEN : " + maxToken);
        try {
          const conversationChunks = this.chunkConversation(conversation, tokensPerChunk);
          var allResponse = "";
          for (const chunk of conversationChunks) {
            const response = await axios.post(
              'https://api.openai.com/v1/chat/completions',
              {
                model: process.env.MODEL_NAME,
                messages: chunk,
                max_tokens: maxToken,
                temperature: 0.5,
                frequency_penalty: 0.6,
                presence_penalty: 0.4,
              },
              {
                headers: {
                  'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                  'Content-Type': 'application/json',
                  'Conversation-ID': channelId,
                },
              }
            );
  
            const responseContent = response.data.choices[0].message.content;
            allResponse += responseContent;
          }

          conversation.push({ role: 'system', content: allResponse });
          await message.channel.send(`${message.author.toString()} ${allResponse}`);
  
          // Limit the conversation length
          if (conversation.length > 10) {
            conversation.shift(); // Remove the oldest message
            conversation.shift(); // Remove the oldest message
          }
  
          this.conversationHistory.set(channelId, conversation);
  
          thinkingMessage.delete();
        } catch (error: any) {
          message.channel.send(`ERROR: Failed to get chat completion: ${(error as AxiosError).message}`);
          thinkingMessage.delete();
        }
      } else {
        message.channel.send("ERROR: No message content provided.");
      }
    }
  });
  
  }

  public chunkConversation(conversation: any[], tokensPerChunk: number): any[][] {
    const chunks: any[][] = [];
    let currentChunk: any[] = [];
  
    for (const message of conversation) {
      const messageTokens = message.content.split(' ');
      if (currentChunk.length + messageTokens.length <= tokensPerChunk) {
        currentChunk.push(message);
      } else {
        chunks.push(currentChunk);
        currentChunk = [message];
      }
    }
  
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
  
    return chunks;
  }

  public async playMusic(message: any) {
    if (message.content.startsWith('/play')) {
      const args = message.content.split(' ');
      if (args.length < 2) {
        message.reply('Please provide a YouTube URL.');
        return;
      }
  
      const voiceChannel = message.member?.voice.channel;
      if (!voiceChannel) {
        message.reply('You must be in a voice channel to use this command.');
        return;
      }
  
      try 
      {
        const connection = await this.connectToChannel(voiceChannel);
				connection.subscribe(this.player);
        this.playSong(args[1]);

      } catch (error) {
        console.error(error);
        message.reply('An error occurred while connecting to the voice channel.');
      }
    }
  }

  public playSong(url : string) {
    const resource = createAudioResource(url, {
      inputType: StreamType.Arbitrary,
    });
  
    this.player.play(resource);
  
    return entersState(this.player, AudioPlayerStatus.Playing, 5000);
  }

  public async connectToChannel(channel: VoiceBasedChannel) {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: this.createDiscordJSAdapter(channel),
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      return connection;
    } catch (error) {
      connection.destroy();
      throw error;
    }
  }

  public createDiscordJSAdapter(channel: VoiceBasedChannel): DiscordGatewayAdapterCreator {
    const adapter = new DiscordGatewayAdapterCreator(channel);
    adapter.on('connect', () => {
      console.log('Connected to voice channel.');
    });
    adapter.on('disconnect', () => {
      console.log('Disconnected from voice channel.');
    });
    adapter.on('error', (error) => {
      console.error('Error occurred while communicating with Discord voice server.', error);
    });
    return adapter;
  }
}
