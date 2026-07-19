import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "🔄 Reset", data: "reset:confirm", order: 40 });

const composer = new Composer<Ctx>();

composer.command("reset", async (ctx) => {
  ctx.session.messageHistory = [];
  ctx.session.feedbackState = undefined;
  ctx.session.rateLimitTimestamps = [];
  await ctx.reply("Conversation context cleared.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

composer.callbackQuery("reset:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.messageHistory = [];
  ctx.session.feedbackState = undefined;
  ctx.session.rateLimitTimestamps = [];
  await ctx.editMessageText("Conversation context cleared.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

export default composer;
