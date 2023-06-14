import {
  ChatCompletionRequestMessage,
  ChatCompletionResponseMessage,
  Configuration,
  CreateImageRequestSizeEnum,
  ImagesResponse,
  OpenAIApi,
} from 'openai';
import process from 'process';
import { AI } from '@/models/ai';
import { Runnable } from '@/models/runnable';
import { Logger } from '@/logger';

export class Api implements AI, Runnable {
  /**
   * Logger instance
   * @private
   */
  private readonly _logger: Logger;

  /**
   * OpenAI API instance
   * @private
   */
  private _api!: OpenAIApi;

  /**
   * OpenAI API configuration
   * @private
   */
  private readonly _configuration: Configuration;

  /**
   * Create API instance
   */
  constructor() {
    this._logger = new Logger(Api.name);

    /**
     * Create OpenAI API configuration with API key
     */
    const baseEndpoint = 'https://api.openai.com'; // The API endpoint URL

    this._configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
      basePath: baseEndpoint,
      headers: {
        'User-Agent': 'ATSoftware-discord', // Set a custom User-Agent header if needed
      },
      limits: {
        maxTokens: 100, // Adjust the maximum number of tokens per request
        temperature: 0.8, // Adjust the temperature for response generation
        frequencyPenalty: 0.6, // Adjust the frequency penalty for response generation
        presencePenalty: 0.4, // Adjust the presence penalty for response generation
      },
      model: process.env.MODEL_NAME, // Specify the model to use (e.g., text-davinci-003, text-codex-003, etc.)
    });
  }

  /**
   * Initialize OpenAI API service
   */
  run(): void {
    try {
      this._api = new OpenAIApi(this._configuration); // Create API instance
      this._logger.logService.info('OpenAI Service has been initialized successfully.'); // Log service initialization
    } catch (error) {
      this._logger.logService.error(`Failed to start OpenAI Service: ${error}`); // Log service initialization error
      process.exit(1); // Exit process
    }
  }

  /**
   * Get the chat completion from the OpenAI API using GPT-3
   * @param chatHistory - Chat history to generate completion from
   * @returns {ChatCompletionResponseMessage} - Chat completion response object containing the completion
   */
  async chatCompletion(chatHistory: ChatCompletionRequestMessage[])
    : Promise<ChatCompletionResponseMessage> {
    /**
     * Create chat completion request and return response or throw error
     */
    const request = await this._api.createChatCompletion({
      model: process.env.MODEL_NAME,
      messages: chatHistory,
    }).then((response) => response.data.choices[0].message)
      .catch((error: Error) => {
        this._logger.logService.error(`Failed to get chat completion: ${error.message}`); // Request failed
        throw error;
      });

    return (request as ChatCompletionResponseMessage);
  }

  /**
   * Generate a variable quantity of images from the OpenAI API using DALL-E
   * @param prompt - Text to generate images from (e.g. "A cute dog")
   * @param quantity - Number of images to generate (e.g. 5) (max 10) (default 1)
   * @param size - Size of the image (e.g. "512x512") (max "1024x1024")
   * @returns {ImagesResponse} - Images response object containing the image URLs
   */
  async createImage(prompt: string, quantity: number, size: CreateImageRequestSizeEnum)
    : Promise<ImagesResponse> {
    /**
     * Create image request and return response or throw error
     */
    const request = await this._api.createImage({
      prompt,
      n: quantity,
      size,
    }).then((response) => response.data)
      .catch((error: Error) => {
        this._logger.logService.error(`Failed to get image ${error.message}`); // Request failed
        throw error;
      });

    return (request as ImagesResponse);
  }
}
