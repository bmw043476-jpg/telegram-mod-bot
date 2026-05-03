import app from "./app.js";
import { logger } from "./lib/logger.js";
import { bot } from "./bot/index.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

bot.launch({ dropPendingUpdates: true });
logger.info({ username: "ModeratorBolushh_bot" }, "Telegram bot polling started");

bot.telegram.getMe().then((me) => {
  logger.info({ username: me.username, id: me.id }, "Bot confirmed running");
}).catch((err) => {
  logger.error({ err }, "Failed to confirm bot identity");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
