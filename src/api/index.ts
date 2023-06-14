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
import { exec } from 'child_process';

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
    this._configuration = new Configuration({
      organization: process.env.OPENAI_ORGANIZATION_ID,
      apiKey: process.env.OPENAI_API_KEY,
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
  async chatCompletion(chatHistory: ChatCompletionRequestMessage[]): Promise<ChatCompletionResponseMessage> {
    const curlCommand = `curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${process.env.OPENAI_API_KEY}" -d '${JSON.stringify({
      model: process.env.MODEL_NAME,
      messages: chatHistory,
      max_tokens: 1024, // Adjust the maximum number of tokens per request
      temperature: 0.5, // Adjust the temperature for response generation
      frequency_penalty: 0.6, // Adjust the frequency penalty for response generation
      presence_penalty: 0.4, // Adjust the presence penalty for response generation
    })}' https://api.openai.com/v1/chat/completions`;
  
    return new Promise((resolve, reject) => {
      exec(curlCommand, (error : any, stdout : any, stderr : any) => {
        if (error) {
          this._logger.logService.error(`Failed to execute cURL command: ${error.message}`);
          reject(error);
          return;
        }
  
        const responseData = JSON.parse(stdout);
        const completionMessage = responseData.choices[0].message as ChatCompletionResponseMessage;
        resolve(completionMessage);
      });
    });
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
