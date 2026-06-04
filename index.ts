import dotenv from "dotenv";
import { Telegraf } from "telegraf";
import chalk from "chalk"; // Ensure chalk is imported
import { WELCOME_TEXT } from "./telegram/constants";
import { registerHandlers } from "./telegram/handler";

dotenv.config();
export async function runTelegramMode() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error(chalk.red("Error: TELEGRAM_BOT_TOKEN is missing in env."));
    return;
  }

  const bot = new Telegraf(token);

  registerHandlers(bot);

  bot.start((ctx) => {
    console.log(
      chalk.green(`Sent welcome message to user: ${ctx.from.first_name}`),
    );

    bot.telegram.sendMessage(ctx.chat.id, WELCOME_TEXT, {
      parse_mode: "Markdown",
    });
  });
  await bot.launch();
  console.log(chalk.green("Telegram bot is running. Press Ctrl+C to stop.\n"));

  // 3. Keep the process alive and handle graceful shutdown
  await new Promise<void>((resolve) => {
    const stop = (signal: string) => {
      bot.stop(signal);
      resolve();
    };
    process.once("SIGINT", () => stop("SIGINT"));
    process.once("SIGTERM", () => stop("SIGTERM"));
  });
}

await runTelegramMode();
