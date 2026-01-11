import OpenAI from "openai";
import { env } from "../env";
import { Persona } from "@repo/types";
import { logger } from "../utils/logger";
import { rateLimiter } from "./rateLimiter";

export const openai = new OpenAI({
  apiKey: env.GEMINI_API_KEY,
  baseURL: env.GEMINI_BASE_URL,
});

/**
 * Maximum retries for 429 rate limit errors
 */
const MAX_RETRIES = 5;
/**
 * Base delay in milliseconds for exponential backoff
 */
const BASE_RETRY_DELAY_MS = 1000;

export interface LLMResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

export interface StreamingLLMResponse extends LLMResponse {
  stream: AsyncIterable<string>;
}

export class LLMService {
  /**
   * Execute an API call with rate limiting and exponential backoff on 429 errors
   * Only records ONE request per logical API call, even if it retries multiple times
   */
  private async executeWithRateLimit<T>(
    apiCall: () => Promise<T>,
    retryCount: number = 0,
    requestRecorded: boolean = false
  ): Promise<T> {
    // Check rate limit BEFORE making the request (don't record yet)
    // Only record when we actually make the call
    const rateLimitResult = await rateLimiter.checkRateLimit(
      {
        key: "gemini-api",
        maxRequests: env.GEMINI_RATE_LIMIT_RPM,
        windowSeconds: env.GEMINI_RATE_LIMIT_WINDOW_SECONDS,
      },
      false
    ); // Don't record on check

    if (!rateLimitResult.allowed) {
      logger.warn("Rate limit check failed, waiting...", {
        retryAfter: rateLimitResult.retryAfter,
        remaining: rateLimitResult.remaining,
        resetAt: new Date(rateLimitResult.resetAt * 1000).toISOString(),
      });
      console.warn(
        `[RATE LIMIT] Waiting ${rateLimitResult.retryAfter}s before making request...`
      );

      // Wait for rate limit window (with timeout to prevent infinite waiting)
      try {
        const waitResult = await Promise.race([
          rateLimiter.waitForRateLimit(
            {
              key: "gemini-api",
              maxRequests: env.GEMINI_RATE_LIMIT_RPM,
              windowSeconds: env.GEMINI_RATE_LIMIT_WINDOW_SECONDS,
            },
            60 // Max 60 seconds wait
          ),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error("Rate limit wait timeout after 60 seconds"));
            }, 65000); // Slightly longer than waitForRateLimit max
          }),
        ]);

        if (!waitResult.allowed) {
          throw new Error(
            `Rate limit exceeded. Please try again after ${waitResult.retryAfter} seconds.`
          );
        }
      } catch (waitError) {
        logger.error("Rate limit wait failed", { error: waitError });
        throw waitError;
      }
    }

    try {
      // Record the request ONLY ONCE before making the API call
      // If this is a retry, don't record again (requestRecorded flag prevents double-counting)
      // We record before to ensure atomicity - if we record after, concurrent requests might all pass the check
      if (!requestRecorded) {
        await rateLimiter.recordRequest({
          key: "gemini-api",
          maxRequests: env.GEMINI_RATE_LIMIT_RPM,
          windowSeconds: env.GEMINI_RATE_LIMIT_WINDOW_SECONDS,
        });
        requestRecorded = true;
        logger.info("Request recorded in rate limiter", { retryCount });
      }

      logger.info("Making API call", { retryCount, requestRecorded });
      console.log(`[LLM] Making API call (retry: ${retryCount})...`);

      const result = await apiCall();

      logger.info("API call completed successfully", { retryCount });
      console.log(
        `[LLM] API call completed successfully (retry: ${retryCount})`
      );

      return result;
    } catch (error: any) {
      // Handle 429 rate limit errors with exponential backoff
      const status = error?.status || error?.statusCode || error?.code;

      if (status === 429 && retryCount < MAX_RETRIES) {
        const retryAfter =
          error?.headers?.["retry-after"] ||
          error?.response?.headers?.["retry-after"] ||
          error?.retry_after;

        // Calculate exponential backoff delay
        // Use retry-after header if available, otherwise use exponential backoff
        const retryAfterSeconds = retryAfter
          ? parseInt(String(retryAfter), 10)
          : null;

        const backoffDelayMs = retryAfterSeconds
          ? retryAfterSeconds * 1000
          : BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);

        logger.warn("Rate limit 429 error, retrying with exponential backoff", {
          retryCount: retryCount + 1,
          maxRetries: MAX_RETRIES,
          delayMs: backoffDelayMs,
          retryAfter: retryAfterSeconds,
          requestAlreadyRecorded: requestRecorded, // Important: don't record retries
        });

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, backoffDelayMs));

        // Check rate limit again before retrying (but don't record - we already recorded once)
        const retryRateLimitResult = await rateLimiter.checkRateLimit(
          {
            key: "gemini-api",
            maxRequests: env.GEMINI_RATE_LIMIT_RPM,
            windowSeconds: env.GEMINI_RATE_LIMIT_WINDOW_SECONDS,
          },
          false
        ); // Don't record retries

        if (!retryRateLimitResult.allowed) {
          // Still rate limited, wait more
          const additionalWaitMs =
            (retryRateLimitResult.retryAfter || 1) * 1000;
          logger.info("Still rate limited after backoff, waiting more", {
            additionalWaitSeconds: additionalWaitMs / 1000,
          });
          await new Promise((resolve) => setTimeout(resolve, additionalWaitMs));
        }

        // Retry the request - pass requestRecorded=true so we don't count it again
        return this.executeWithRateLimit(
          apiCall,
          retryCount + 1,
          requestRecorded
        );
      }

      // Re-throw if not a 429 error or max retries exceeded
      throw error;
    }
  }

  async generateDebateResponse(
    prompt: string,
    persona: Persona,
    maxTokens: number = 200
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildPersonaSystemPrompt(persona);

      const response = await this.executeWithRateLimit(() =>
        openai.chat.completions.create({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.8,
        })
      );

      const text = response.choices[0]?.message?.content || "";
      const tokensIn = response.usage?.prompt_tokens || 0;
      const tokensOut = response.usage?.completion_tokens || 0;
      const durationMs = Date.now() - startTime;

      logger.info("LLM response generated", {
        persona: persona.name,
        tokensIn,
        tokensOut,
        durationMs,
        textLength: text.length,
      });

      return {
        text,
        tokensIn,
        tokensOut,
        durationMs,
      };
    } catch (error) {
      logger.error("LLM generation failed", { error, persona: persona.name });
      throw error;
    }
  }

  async *streamDebateResponse(
    prompt: string,
    persona: Persona,
    maxTokens: number = 200
  ): AsyncGenerator<string, LLMResponse, unknown> {
    const startTime = Date.now();
    let fullText = "";
    let tokensIn = 0;
    let tokensOut = 0;

    try {
      const systemPrompt = this.buildPersonaSystemPrompt(persona);

      const stream = await this.executeWithRateLimit(() =>
        openai.chat.completions.create({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.8,
          stream: true,
        })
      );

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullText += content;
          yield content;
        }

        // Get usage data from the last chunk
        if (chunk.usage) {
          tokensIn = chunk.usage.prompt_tokens || 0;
          tokensOut = chunk.usage.completion_tokens || 0;
        }
      }

      const durationMs = Date.now() - startTime;

      if (tokensIn === 0) {
        // Rough estimation: ~4 characters per token
        tokensIn = Math.ceil((systemPrompt.length + prompt.length) / 4);
      }
      if (tokensOut === 0) {
        tokensOut = Math.ceil(fullText.length / 4);
      }

      logger.info("LLM streaming response completed", {
        persona: persona.name,
        tokensIn,
        tokensOut,
        durationMs,
        textLength: fullText.length,
      });

      return {
        text: fullText,
        tokensIn,
        tokensOut,
        durationMs,
      };
    } catch (error) {
      logger.error("LLM streaming failed", {
        error: error instanceof Error ? error.message : error,
        status: (error as any)?.status,
        persona: persona.name,
      });
      throw error;
    }
  }

  async judgeDebate(
    topic: string,
    transcript: string
  ): Promise<{
    winner: "A" | "B" | "TIE";
    judgeJSON: any;
    tokensIn: number;
    tokensOut: number;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const TIMEOUT_MS = 60000; // 60 second timeout

    try {
      const systemPrompt = this.buildJudgeSystemPrompt();
      const userPrompt = this.buildJudgeUserPrompt(topic, transcript);

      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Judging request timed out after 60 seconds"));
        }, TIMEOUT_MS);
      });

      let response;
      try {
        // Race between the API call (with rate limiting) and timeout
        response = await Promise.race([
          this.executeWithRateLimit(() =>
            openai.chat.completions.create({
              model: "gemini-2.5-flash",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              max_tokens: 2000, // Increased to prevent truncation
              temperature: 0.1, // Lower temperature for more consistent judging
            })
          ),
          timeoutPromise,
        ]);
      } catch (apiError: any) {
        // Log the actual LLM API response/error - OpenAI SDK error structure
        console.log("=== LLM API ERROR ===");
        console.log(
          "Error type:",
          apiError?.constructor?.name || typeof apiError
        );
        console.log(
          "Status:",
          apiError?.status ||
            apiError?.statusCode ||
            apiError?.code ||
            "unknown"
        );
        console.log("Message:", apiError?.message || String(apiError));
        console.log("Code:", apiError?.code || "no code");
        console.log("Type:", apiError?.type || "no type");

        // Try to extract error details from OpenAI SDK error structure
        if (apiError?.error) {
          console.log("Error object:", JSON.stringify(apiError.error, null, 2));
          console.log("Error code:", apiError.error?.code);
          console.log("Error param:", apiError.error?.param);
          console.log("Error message:", apiError.error?.message);
        }

        // Try to get response body if it exists
        if (apiError?.response) {
          console.log("Response object exists");
          if (apiError.response?.data) {
            console.log(
              "Response data:",
              JSON.stringify(apiError.response.data, null, 2)
            );
          }
          if (apiError.response?.headers) {
            console.log(
              "Response headers:",
              JSON.stringify(apiError.response.headers, null, 2)
            );
          }
        }

        // Try to get headers directly
        if (apiError?.headers) {
          console.log("Headers:", JSON.stringify(apiError.headers, null, 2));
        }

        // Try to read the response body from the error (if it's already parsed)
        if (
          apiError?.response?.body &&
          typeof apiError.response.body === "object"
        ) {
          console.log(
            "Response body object:",
            JSON.stringify(apiError.response.body, null, 2)
          );
        }

        // Log all enumerable properties
        console.log("All properties:", Object.keys(apiError));
        console.log(
          "Full error:",
          JSON.stringify(apiError, Object.getOwnPropertyNames(apiError), 2)
        );
        console.log("====================");

        // Note: 429 errors should be handled by executeWithRateLimit with exponential backoff
        // If we reach here, it means max retries were exceeded or it's a different error
        const status =
          apiError?.status || apiError?.statusCode || apiError?.code;
        if (status === 429 || apiError?.type === "rate_limit_error") {
          const retryAfter =
            apiError?.headers?.["retry-after"] ||
            apiError?.response?.headers?.["retry-after"] ||
            apiError?.retry_after;
          const errorMessage = retryAfter
            ? `Rate limit exceeded after ${MAX_RETRIES} retries. Please try again after ${retryAfter} seconds.`
            : `Rate limit exceeded after ${MAX_RETRIES} retries. Please try again later.`;
          throw new Error(`LLM API Rate Limit: ${errorMessage}`);
        }

        // Handle other API errors
        if (status) {
          // Try to extract detailed error message
          let errorMessage =
            apiError?.error?.message ||
            apiError?.message ||
            "No error details available";

          // Add error code and param if available
          if (apiError?.error?.code) {
            errorMessage = `${errorMessage} (code: ${apiError.error.code}`;
            if (apiError.error.param) {
              errorMessage = `${errorMessage}, param: ${apiError.error.param}`;
            }
            errorMessage = `${errorMessage})`;
          }

          const body =
            apiError?.error ||
            apiError?.response?.data ||
            apiError?.response?.body ||
            apiError?.body ||
            errorMessage;
          console.log(`LLM API returned status ${status}`);
          console.log(
            "Error body/details:",
            typeof body === "string" ? body : JSON.stringify(body, null, 2)
          );
          throw new Error(`LLM API Error (${status}): ${errorMessage}`);
        }

        // Re-throw other errors as-is
        throw apiError;
      }

      // Log successful LLM response
      const choice = response.choices[0];
      const text = choice?.message?.content || "{}";
      const finishReason = choice?.finish_reason;

      // Check if response was truncated
      // Note: finish_reason can be "length" when max_tokens is reached, but TypeScript types may not include it
      if (
        finishReason === "length" ||
        (finishReason as string) === "max_tokens"
      ) {
        logger.warn("LLM response was truncated", {
          finishReason,
          textLength: text.length,
          tokensOut: response.usage?.completion_tokens || 0,
        });
        console.warn("=== WARNING: Response was truncated ===");
        console.warn("Finish reason:", finishReason);
        console.warn("Text length:", text.length);
        console.warn("Tokens out:", response.usage?.completion_tokens || 0);
        console.warn("=====================================");
      }

      logger.info("=== LLM API SUCCESS ===", {
        responseText: text.substring(0, 500), // Log first 500 chars
        fullTextLength: text.length,
        tokensIn: response.usage?.prompt_tokens || 0,
        tokensOut: response.usage?.completion_tokens || 0,
        model: response.model,
        finishReason,
      });
      console.log("=== LLM API SUCCESS ===");
      console.log("Response text (first 500 chars):", text.substring(0, 500));
      console.log("Full text length:", text.length);
      console.log("Tokens in:", response.usage?.prompt_tokens || 0);
      console.log("Tokens out:", response.usage?.completion_tokens || 0);
      console.log("Finish reason:", finishReason);
      console.log("======================");

      const tokensIn = response.usage?.prompt_tokens || 0;
      const tokensOut = response.usage?.completion_tokens || 0;
      const durationMs = Date.now() - startTime;

      let judgeJSON;
      try {
        // Check if response looks truncated (ends abruptly without closing braces)
        const trimmedText = text.trim();
        const openBraces = (trimmedText.match(/{/g) || []).length;
        const closeBraces = (trimmedText.match(/}/g) || []).length;
        const openQuotes = (trimmedText.match(/"/g) || []).length;

        // If response is clearly truncated (unmatched braces or odd number of quotes)
        if (openBraces !== closeBraces || openQuotes % 2 !== 0) {
          logger.warn("Response appears truncated", {
            openBraces,
            closeBraces,
            openQuotes,
            textLength: trimmedText.length,
            lastChars: trimmedText.slice(-50),
          });
          throw new Error(
            `Response appears to be truncated. Expected complete JSON but got incomplete response (${trimmedText.length} chars). ` +
              `This might be due to max_tokens limit or API truncation. ` +
              `Response ends with: "${trimmedText.slice(-100)}"`
          );
        }

        // Try to extract JSON from response if it's wrapped in markdown code blocks
        let jsonText = trimmedText;
        // Remove markdown code blocks if present
        jsonText = jsonText
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "");
        jsonText = jsonText.trim();

        judgeJSON = JSON.parse(jsonText);

        // Validate required fields
        if (!judgeJSON.A || !judgeJSON.B || !judgeJSON.winner) {
          console.log(
            "Invalid judge JSON structure - missing required fields:",
            judgeJSON
          );
          throw new Error(
            "Invalid judge JSON structure: missing required fields (A, B, or winner)"
          );
        }
        if (!["A", "B", "TIE"].includes(judgeJSON.winner)) {
          console.log("Invalid winner value:", judgeJSON.winner);
          throw new Error(
            `Invalid winner value: ${judgeJSON.winner}. Must be A, B, or TIE.`
          );
        }

        console.log("Parsed judge JSON:", JSON.stringify(judgeJSON, null, 2));
      } catch (parseError) {
        console.log("=== JSON PARSE ERROR ===");
        console.log("Original text:", text);
        console.log("Text length:", text.length);
        console.log(
          "Parse error:",
          parseError instanceof Error ? parseError.message : String(parseError)
        );
        console.log("========================");
        throw new Error(
          `Failed to parse judge response: ${parseError instanceof Error ? parseError.message : String(parseError)}. Response was: ${text.substring(0, 200)}`
        );
      }

      const winner = judgeJSON.winner as "A" | "B" | "TIE";

      return {
        winner,
        judgeJSON,
        tokensIn,
        tokensOut,
        durationMs,
      };
    } catch (error) {
      // Log detailed error information
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStatus =
        (error as any)?.status ||
        (error as any)?.statusCode ||
        (error as any)?.code;

      logger.error("Judge generation failed", {
        error: errorMessage,
        status: errorStatus,
        stack: error instanceof Error ? error.stack : undefined,
      });

      console.error("=== JUDGE GENERATION FAILED ===");
      console.error("Error message:", errorMessage);
      console.error("Status code:", errorStatus);
      if (error instanceof Error && error.stack) {
        console.error("Stack trace:", error.stack);
      }
      console.error("==============================");

      throw error;
    }
  }

  private buildPersonaSystemPrompt(persona: Persona): string {
    return `You are ${persona.name}.
Bio: ${persona.bio}
Speaking style: ${persona.style}

Rules:
- Max 200 words.
- Be punchy and specific.
- Do not repeat yourself.
- Cite concrete examples or data (even if approximate, but mark as "estimate").
- No filler.
- You must only speak as ${persona.name}.
- Stay true to your character's voice and perspective.
- Make compelling arguments that reflect your unique background and expertise.`;
  }

  private buildJudgeSystemPrompt(): string {
    return `You are a strict debate judge. You must produce impartial, concise scores and a winner.
You MUST return ONLY valid JSON with no additional text, no markdown formatting, no code blocks, and no explanations outside the JSON.
The response must be a valid JSON object in this exact format:
{
  "A": {"score": <number 0-10>, "reason": "<string>"},
  "B": {"score": <number 0-10>, "reason": "<string>"},
  "winner": "A" | "B" | "TIE"
}

Criteria (0-10 each):
- Logical coherence and argument structure
- Use of evidence and examples
- Rebuttal effectiveness and engagement with opponent's points
- Clarity, concision, and persuasiveness
- Staying on topic and addressing the core question

A tie should only be declared if the debate is genuinely close. Generally prefer to pick a winner.

Remember: Return ONLY the JSON object, nothing else.`;
  }

  private buildJudgeUserPrompt(topic: string, transcript: string): string {
    return `Topic: "${topic}"

Full debate transcript:
${transcript}

Judge this debate and return your decision in the specified JSON format.`;
  }
}

export const llmService = new LLMService();
