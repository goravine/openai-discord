import {
  ActivityType, Client, CommandInteraction, IntentsBitField, Interaction, Partials, REST, Routes,
} from 'discord.js';
import process from 'process';
import { Logger } from '@/logger';
import { Runnable } from '@/models/runnable';
import { AI } from '@/models/ai';
import { commands } from '@/bot/commands';
import axios , {AxiosError } from 'axios';


export class Bot implements Runnable {
	// Define a conversation ID map
	public conversationHistory = new Map<string, Array<{ role: string, content: string }>>();
	
  /**
   * Logger instance
   * @private
   * @readonly
   */
  private readonly _logger: Logger;

  /**
   * AI instance
   * @private
   * @readonly
   */
  private readonly _ai: AI;

  /**
   * Discord API client instance
   * @private
   * @readonly
   */
  private readonly _client: Client;

  /**
   * Create Bot instance
   * @param ai - OpenAI API instance to use for all AI related tasks
   */
  constructor(ai: AI) {
    this._logger = new Logger(Bot.name);
    this._ai = ai;

    /**
     * Create Discord API client instance with intents and partials
     */
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

  /**
   * Handle slash commands from Discord API
   * @param interaction - Interaction from Discord API to handle as slash command (e.g. /help)
   * @private
   */
  private async handleSlashCommand(interaction: CommandInteraction): Promise<void> {
    /**
     * Find command by name and execute it if found or return error message
     */
    const slashCommand = commands.find((command) => command.data.name === interaction.commandName);
    if (!slashCommand) {
      this._logger.logService.warning(`SlashCommand [${interaction.commandName}] not found.`);
      await interaction.followUp({ content: 'An error has occurred' });
      return;
    }

    this._logger.logService.debug(`SlashCommand [${interaction.commandName}] executed properly.`); // Log command execution
    await slashCommand.execute(this._client, interaction, this._ai); // Execute command
  }

  /**
   * Initialize Discord API service
   */
  run(): void {
    /**
     * Login to Discord API and set status for show command if login was successful or exit process if failed
     */
    this._client.login(process.env.DISCORD_API_KEY).then(() => {
      this._logger.logService.info('Discord Client has been initialized successfully.'); // Log service initialization
    }).catch((error) => {
      this._logger.logService.error(`Failed to start Discord Service: ${error}`); // Log service initialization error
      process.exit(1); // Exit process
    });

    this._client.on('ready', async () => {
      /**
       * Check if user and application are available before continue
       */
      if (!this._client.user || !this._client.application) {
        return;
      }

      /**
       * Create Discord API REST instance and register slash commands if successful or exit process if failed
       */
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

      /**
       * Set activity status for show command
       
      this._client.user?.setActivity({
        name: '/help',
        type: ActivityType.Listening,
      });*/
      this._client.user?.setActivity({name: 'VALORANT', type: ActivityType.Playing });
    });

    /**
     *  On interaction create event handler
     */
    this._client.on('interactionCreate', async (interaction: Interaction) => {
      /**
       * Check if interaction is command or chat input command
       */
      if (interaction.isCommand() || interaction.isChatInputCommand()) {
        await this.handleSlashCommand(interaction); // Handle slash command
      }
    });

	/**
     *  On interaction create event handler
     */
  this._client.on('messageCreate', async (message: any) => {
    if (message.mentions.has(this._client.user, { ignoreRoles: true })) {
      this.openAIConversation(message);
    }
    
    if (message.content.includes('!usage')) {
      this.checkRemainingBalance(message);
    }
  });
  
  }

  public async checkRemainingBalance(message: any) {
    try {
      const thinkingMessage = await message.channel.send('Querying...');
      // Retrieve token usage information
      const todayDateTime = this.getTodayDateTime();
      const usageResponse = await axios.get(
        'https://api.openai.com/v1/usage?date=' + todayDateTime,
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }
      );
  
      const snapshotSum: { [snapshotId: string]: number } = {};
  
      for (const entry of usageResponse.data.data) {
        const { snapshot_id, n_generated_tokens_total } = entry;
        if (snapshotSum.hasOwnProperty(snapshot_id)) {
          snapshotSum[snapshot_id] += n_generated_tokens_total;
        } else {
          snapshotSum[snapshot_id] = n_generated_tokens_total;
        }
      }
  
      // Display chat completion message and remaining token balance
      thinkingMessage.delete();
      let messageText = 'Data usage for ' + todayDateTime + '\r\n=============================\r\n';
      
      for (const key in snapshotSum) {
        if (snapshotSum.hasOwnProperty(key)) {
          messageText += `Model Name '${key}': ${snapshotSum[key]} Tokens\r\n`;
        }
      }

      messageText += `Today usage USD: $ ${usageResponse.data.current_usage_usd}`;
  
      await message.channel.send(messageText);
    } catch (error: any) {
      message.channel.send(
        `ERROR: Failed to get chat completion: ${(error as AxiosError).message}`
       );
    }
  }

  public getTodayDateTime() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const utcDate = new Date(Date.UTC(year, month - 1, day));

    return `${utcDate.getFullYear()}-${utcDate.getMonth() + 1}-${utcDate.getDate()}`;
  }

  public async openAIConversation(message : any)
  {
    const messageContent = message.content.replace(/<@!?\d+>/, '').trim();
    let maxConversationLength = 20;
      if (messageContent) {
        const channelId = message.channel.id;
        let conversation = this.conversationHistory.get(channelId) || [];
        conversation.push({ role: 'user', content: messageContent });
        const thinkingMessage = await message.channel.send('Thinking...');

        try {
          const maxToken = parseInt(process.env.MAX_TOKEN ?? '1024');
          const tokensPerChunk = 512; // Adjust as needed
          console.log("MAX TOKEN : " + maxToken);

          const conversationChunks = this.chunkConversation(conversation, tokensPerChunk);
          let allResponse = "";
          let remainingResponse = ""; // To store any remaining content
          let truncated = false; // To track if the content was truncated
          let i = 0;
          let maxLength = 1800;
          for (const chunk of conversationChunks) {
            i++;
            console.log("Requesting ["+i+"/"+conversationChunks.length+"]")
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
            if (!truncated && allResponse.length + responseContent.length <= maxLength) 
            {
              allResponse += responseContent;
            } 
            else 
            {
              // Truncate the response content to fit within the limit
              const remainingSpace = maxLength - allResponse.length;
              const truncatedResponse = responseContent.substring(0, remainingSpace);
              allResponse += truncatedResponse;
              remainingResponse = responseContent.substring(remainingSpace); // Store remaining content
              truncated = true;
              break; // Stop processing further chunks
            }
          }

          let allMessage = "";
          await message.channel.send(`${message.author.toString()} ${allResponse}`);
          allMessage += allResponse;
          // If there's remaining content, split and send it in multiple follow-up messages
          while (remainingResponse.length > 0) 
          {
            const chunkToSend = remainingResponse.substring(0, maxLength); // Get the next chunk
            await message.channel.send(chunkToSend);
            allMessage += chunkToSend;
            remainingResponse = remainingResponse.substring(maxLength); // Remove the sent chunk
          }

          conversation.push({ role: 'system', content: allMessage });
  
          // Limit the conversation length
          if (conversation.length > maxConversationLength) {
            conversation.shift();
          }
  
          this.conversationHistory.set(channelId, conversation);
  
          thinkingMessage.delete();
        } catch (error: any) 
        {
          let errorMessage = `ERROR: Failed to get chat completion: ${(error as AxiosError).message}`;
          message.channel.send(errorMessage);
            try
            {
              errorMessage = `ERROR: Failed to get chat completion: ${JSON.stringify(error.response.data, null, 2)}`;
              message.channel.send(errorMessage);
            }
            catch
            {}
          thinkingMessage.delete();
        }
      } else {
        message.channel.send("ERROR: No message content provided.");
      }
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
}
