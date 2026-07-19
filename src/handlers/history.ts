import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

function formatHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  if (!history || history.length === 0) {
    return "No conversation history yet. Ask me something to get started!";
  }

  const pairs: string[] = [];
  const lastFive = history.slice(-10); // 10 = 5 Q&A pairs
  for (let i = 0; i < lastFive.length; i += 2) {
    const q = lastFive[i];
    const a = lastFive[i + 1];
    if (q && q.role === "user" && a && a.role === "assistant") {
      const shortQ = q.content.length > 60 ? q.content.slice(0, 57) + "…" : q.content;
      const shortA = a.content.length > 80 ? a.content.slice(0, 77) + "…" : a.content;
      pairs.push(`Q: ${shortQ}\nA: ${shortA}`);
    }
  }

  if (pairs.length === 0) {
    return "No conversation history yet. Ask me something to get started!";
  }

  return `📋 Last ${pairs.length} Q&A pair${pairs.length > 1 ? "s" : ""}:\n\n` + pairs.join("\n\n");
}

composer.command("history", async (ctx) => {
  const history = ctx.session.messageHistory ?? [];
  await ctx.reply(formatHistory(history), {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

composer.callbackQuery("history:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const history = ctx.session.messageHistory ?? [];
  await ctx.editMessageText(formatHistory(history), {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

export default composer;
