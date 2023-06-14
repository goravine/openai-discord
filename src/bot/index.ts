import {
  ActivityType, Client, CommandInteraction, IntentsBitField, Interaction, Partials, REST, Routes,MessageMentions,
} from 'discord.js';
import process from 'process';
import { Logger } from '@/logger';
import { Runnable } from '@/models/runnable';
import { AI } from '@/models/ai';
import { commands } from '@/bot/commands';

export class Bot implements Runnable {
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
       */
      this._client.user?.setActivity({
        name: '/help',
        type: ActivityType.Listening,
      });
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

    this._client.on('messageCreate', async (message: any) => {
      console.log("new chat! : " + message.content);
      // Check if the bot is mentioned in the message
      if (message.mentions.has(this._client.user, { ignoreRoles: true })) {
        // Remove the bot's mention from the message content
        const messageContent = message.content.replace(/<@!?\d+>/, '').trim();
    
        console.log("someone asked the AI : " + messageContent);
        // Check if there is any remaining content after removing the mention
        if (messageContent) {
          const commandInteraction = new CommandInteraction(this._client, {
            id: message.id,
            type: 'CHAT_INPUT',
            commandName: 'chat',
            options: [
              {
                name: 'message',
                value: messageContent,
              },
            ],
          });
    
          // Call the /chat command using the CommandInteraction
          const response = await this.handleSlashCommand(commandInteraction);
    
          // Send the response back to the channel
          message.channel.send(response);
        }
      }
    });
    
  }
}
