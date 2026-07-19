import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4.1-nano";
const MAX_HISTORY_TURNS = 6;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

const UNSAFE_PATTERNS =
  /\b(bomb|kill|murder|terrorist|how to make (a )?(weapon|drug|explosive)|child\s*abuse)\b/i;

function isRateLimited(timestamps: number[], now: number): boolean {
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = timestamps.filter((t) => t > windowStart);
  return recent.length >= RATE_LIMIT_MAX;
}

function detectUnsupportedLanguage(text: string): boolean {
  const scriptChars = text.replace(/[\s\d\p{P}\p{S}]/gu, "").length;
  if (scriptChars === 0) return false;
  const latinChars = text.replace(/[^a-zA-Z]/g, "").length;
  return latinChars / scriptChars < 0.4 && scriptChars > 2;
}

function isUnsafeContent(text: string): boolean {
  return UNSAFE_PATTERNS.test(text);
}

function buildHistoryContext(
  history: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  if (history.length === 0) return "";
  const recent = history.slice(-MAX_HISTORY_TURNS);
  return recent.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n");
}

async function callOpenRouter(
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    return "I'm not configured to answer questions right now. Please try again later.";
  }

  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content:
        "You are a helpful Q&A assistant. Answer the user's question concisely. " +
        "Keep responses under 200 words. If the question is unclear, ask for clarification. " +
        "Be professional and concise.",
    },
  ];

  const contextStr = buildHistoryContext(history);
  if (contextStr) {
    messages.push({ role: "user", content: `Previous conversation:\n${contextStr}` });
  }

  messages.push({ role: "user", content: userMessage });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/agntdev",
        "X-Title": "MetaQ&A Bot",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        max_tokens: 512,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "I couldn't generate an answer. Please try again.";
  } finally {
    clearTimeout(timeout);
  }
}

function formatFollowUpSuggestion(lastQuestion: string): string | null {
  if (!lastQuestion) return null;
  const q = lastQuestion.toLowerCase();
  if (q.includes("what") || q.includes("define")) return "Want to know more about this topic?";
  if (q.includes("how")) return "Need a step-by-step breakdown?";
  if (q.includes("why")) return "Want examples to illustrate this?";
  return "Need more details on this?";
}

const composer = new Composer<Ctx>();

composer.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (!text || text.startsWith("/")) return next();

  // Handle feedback comment input
  if (ctx.session.feedbackState?.step === "awaiting_comment") {
    const { rating, chatId } = ctx.session.feedbackState;
    const { getDataStore } = await import("../data.js");
    const store = getDataStore();
    await store.saveFeedback({
      id: `${Date.now()}-${ctx.from.id}`,
      rating,
      comment: text.slice(0, 500),
      chatId,
      userId: ctx.from.id,
      timestamp: Date.now(),
    });
    ctx.session.feedbackState = undefined;
    await ctx.reply("Thanks for your feedback! Your comment helps us improve.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  // Rate limit check
  const now = Date.now();
  ctx.session.rateLimitTimestamps = ctx.session.rateLimitTimestamps ?? [];
  const recentTimestamps = ctx.session.rateLimitTimestamps.filter(
    (t) => t > now - RATE_LIMIT_WINDOW_MS,
  );
  if (recentTimestamps.length >= RATE_LIMIT_MAX) {
    await ctx.reply("You're sending messages too fast. Please wait a moment and try again.");
    return;
  }
  ctx.session.rateLimitTimestamps = [...recentTimestamps, now];

  // Content filter
  if (isUnsafeContent(text)) {
    await ctx.reply(
      "I can't help with that request. I'm designed to assist with safe, constructive questions.",
    );
    return;
  }

  // Unsupported language detection
  if (detectUnsupportedLanguage(text)) {
    await ctx.reply(
      "I work best in English. Try rephrasing your question in English and I'll do my best to help.",
    );
    return;
  }

  // Show typing indicator for longer operations
  await ctx.replyWithChatAction("typing");

  // Update conversation history
  const history = ctx.session.messageHistory ?? [];
  history.push({ role: "user", content: text, timestamp: now });

  // Keep only last MAX_HISTORY_TURNS
  if (history.length > MAX_HISTORY_TURNS) {
    history.splice(0, history.length - MAX_HISTORY_TURNS);
  }
  ctx.session.messageHistory = history;

  try {
    const answer = await callOpenRouter(text, history);
    history.push({ role: "assistant", content: answer, timestamp: Date.now() });
    if (history.length > MAX_HISTORY_TURNS) {
      history.splice(0, history.length - MAX_HISTORY_TURNS);
    }
    ctx.session.messageHistory = history;

    // Build follow-up suggestion
    const followUp = formatFollowUpSuggestion(text);
    const fullText = followUp ? `${answer}\n\n💡 ${followUp}` : answer;

    const kb = inlineKeyboard([
      [inlineButton("👍", "feedback:rate:up"), inlineButton("👎", "feedback:rate:down")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]);

    await ctx.reply(fullText, { reply_markup: kb });
  } catch {
    await ctx.reply(
      "Something went wrong while generating an answer. Please try again in a moment.",
    );
  }
});

export default composer;
