import OpenAI from "openai";
import { env } from "../../lib/env";
import { Persona } from "../../lib/validators";
import { logger } from "../utils/logger";

export const openai = new OpenAI({
  apiKey: env.GEMINI_API_KEY,
  baseURL: env.GEMINI_BASE_URL,
});

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
  async generateDebateResponse(
    prompt: string,
    persona: Persona,
    maxTokens: number = 200
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildPersonaSystemPrompt(persona);

      const response = await openai.chat.completions.create({
        model: "gemini-2.0-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.8,
      });

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

      const stream = await openai.chat.completions.create({
        model: "gemini-2.0-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.8,
        stream: true,
      });

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

    try {
      const systemPrompt = this.buildJudgeSystemPrompt();
      const userPrompt = this.buildJudgeUserPrompt(topic, transcript);

      const response = await openai.chat.completions.create({
        model: "gemini-2.0-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.1, // Lower temperature for more consistent judging
        response_format: { type: "json_object" },
      });

      const text = response.choices[0]?.message?.content || "{}";
      const tokensIn = response.usage?.prompt_tokens || 0;
      const tokensOut = response.usage?.completion_tokens || 0;
      const durationMs = Date.now() - startTime;

      let judgeJSON;
      try {
        judgeJSON = JSON.parse(text);
      } catch (parseError) {
        logger.error("Failed to parse judge response", { text, parseError });
        // Fallback to tie if parsing fails
        judgeJSON = {
          A: { score: 5, reason: "Parsing error occurred" },
          B: { score: 5, reason: "Parsing error occurred" },
          winner: "TIE",
        };
      }

      const winner = judgeJSON.winner as "A" | "B" | "TIE";

      logger.info("Debate judged", {
        winner,
        tokensIn,
        tokensOut,
        durationMs,
      });

      return {
        winner,
        judgeJSON,
        tokensIn,
        tokensOut,
        durationMs,
      };
    } catch (error) {
      logger.error("Judge generation failed", { error });
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
Return ONLY valid JSON in the format:
{
  "A": {"score": number, "reason": string},
  "B": {"score": number, "reason": string},
  "winner": "A" | "B" | "TIE"
}

Criteria (0-10 each):
- Logical coherence and argument structure
- Use of evidence and examples
- Rebuttal effectiveness and engagement with opponent's points
- Clarity, concision, and persuasiveness
- Staying on topic and addressing the core question

A tie should only be declared if the debate is genuinely close. Generally prefer to pick a winner.`;
  }

  private buildJudgeUserPrompt(topic: string, transcript: string): string {
    return `Topic: "${topic}"

Full debate transcript:
${transcript}

Judge this debate and return your decision in the specified JSON format.`;
  }
}

export const llmService = new LLMService();
