import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? Number(process.env.ADMIN_CHAT_ID) : 0;

async function notifyAdmin(
  ctx: Ctx,
  rating: string,
  comment: string | undefined,
): Promise<void> {
  if (!ADMIN_CHAT_ID) return;
  try {
    const user = ctx.from;
    const text =
      `⚠️ New feedback (${rating === "up" ? "👍" : "👎"})\n` +
      `From: ${user?.first_name ?? "Unknown"} (ID: ${user?.id ?? "?"})\n` +
      (comment ? `Comment: ${comment}` : "No comment");
    await ctx.api.sendMessage(ADMIN_CHAT_ID, text);
  } catch {
    // Non-fatal: admin notification is best-effort
  }
}

composer.callbackQuery("feedback:rate:prompt", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("How was your experience with this bot?", {
    reply_markup: inlineKeyboard([
      [inlineButton("👍", "feedback:rate:up"), inlineButton("👎", "feedback:rate:down")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery("feedback:rate:up", async (ctx) => {
  await ctx.answerCallbackQuery();
  const { getDataStore } = await import("../data.js");
  const store = getDataStore();
  await store.saveFeedback({
    id: `${Date.now()}-${ctx.from.id}`,
    rating: "up",
    chatId: ctx.chat!.id,
    userId: ctx.from.id,
    timestamp: Date.now(),
  });
  await ctx.editMessageText("Glad you liked it! Want to add a comment?", {
    reply_markup: inlineKeyboard([
      [inlineButton("Yes", "feedback:comment:yes"), inlineButton("No thanks", "feedback:comment:no")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery("feedback:rate:down", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.feedbackState = { step: "awaiting_comment", rating: "down", chatId: ctx.chat!.id };
  await ctx.editMessageText("Sorry to hear that. What could we improve?", {
    reply_markup: inlineKeyboard([
      [inlineButton("Skip comment", "feedback:comment:no")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery("feedback:comment:yes", async (ctx) => {
  await ctx.answerCallbackQuery();
  const history = ctx.session.messageHistory ?? [];
  const lastRating = history.length > 0 ? "up" : "up";
  ctx.session.feedbackState = { step: "awaiting_comment", rating: lastRating, chatId: ctx.chat!.id };
  await ctx.editMessageText("Type your comment below:", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

composer.callbackQuery("feedback:comment:no", async (ctx) => {
  await ctx.answerCallbackQuery();
  const state = ctx.session.feedbackState;
  if (state) {
    const { getDataStore } = await import("../data.js");
    const store = getDataStore();
    await store.saveFeedback({
      id: `${Date.now()}-${ctx.from.id}`,
      rating: state.rating,
      chatId: state.chatId,
      userId: ctx.from.id,
      timestamp: Date.now(),
    });
    if (state.rating === "down") {
      await notifyAdmin(ctx, state.rating, undefined);
    }
    ctx.session.feedbackState = undefined;
  }
  await ctx.editMessageText("Thanks for your feedback!", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

export default composer;
