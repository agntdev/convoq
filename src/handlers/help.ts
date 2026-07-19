import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

const HELP =
  "ℹ️ Ask me anything — I'm a Q&A assistant.\n\n" +
  "Just type your question and I'll give you a concise answer.\n\n" +
  "Try prompts like:\n" +
  "• What is photosynthesis?\n" +
  "• How does machine learning work?\n" +
  "• Why is the sky blue?\n\n" +
  "Use the buttons on the main menu to view history or send feedback.";

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

composer.command("help", async (ctx) => {
  await ctx.reply(HELP);
});

composer.callbackQuery("menu:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(HELP, { reply_markup: backToMenu });
});

export default composer;
