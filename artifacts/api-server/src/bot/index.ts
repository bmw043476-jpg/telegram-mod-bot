import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import {
  getSettings,
  toggleSetting,
  type TogglableKey,
} from "./settings.js";
import { isSpam, registerJoin } from "./spam.js";
import { isAdultText, isAdultImage } from "./moderation.js";
import {
  addWarning,
  resetWarnings,
  getWarnings,
  isMaxWarnings,
  MAX_WARNINGS,
} from "./warnings.js";
import { logger } from "../lib/logger.js";

const token = process.env["TELEGRAM_BOT_TOKEN"];
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

export const bot = new Telegraf(token, {
  telegram: { testEnv: true },
});

function on(val: boolean): string {
  return val ? "✅" : "❌";
}

function buildKeyboard(chatId: number) {
  const s = getSettings(chatId);
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        `🚫 Спам: ${on(s.deleteSpam)}`,
        "toggle:deleteSpam"
      ),
    ],
    [
      Markup.button.callback(
        `🔞 Фото/видео 18+: ${on(s.deleteAdultImages)}`,
        "toggle:deleteAdultImages"
      ),
    ],
    [
      Markup.button.callback(
        `🔞 Текст 18+: ${on(s.deleteAdultText)}`,
        "toggle:deleteAdultText"
      ),
    ],
  ]);
}

async function isAdmin(
  ctx: Parameters<Parameters<typeof bot.on>[1]>[0],
  userId: number
): Promise<boolean> {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat!.id, userId);
    return ["administrator", "creator"].includes(member.status);
  } catch {
    return false;
  }
}

async function handleViolation(
  ctx: Parameters<Parameters<typeof bot.on>[1]>[0],
  userId: number,
  chatId: number,
  reason: string
): Promise<void> {
  try {
    await ctx.deleteMessage();
  } catch (err) {
    logger.warn({ err }, "Failed to delete message");
  }

  const count = addWarning(chatId, userId);

  if (isMaxWarnings(count)) {
    try {
      await ctx.telegram.banChatMember(chatId, userId);
      resetWarnings(chatId, userId);
      await ctx.reply(
        `🔨 Пользователь заблокирован!\n\nПричина: ${reason}\nПредупреждений: ${MAX_WARNINGS}/${MAX_WARNINGS}`
      );
    } catch (err) {
      logger.warn({ err }, "Failed to ban user");
      await ctx.reply(
        `⛔ ${MAX_WARNINGS}/${MAX_WARNINGS} — Нарушитель должен быть заблокирован, но у меня нет прав на блокировку. Дай мне право «Блокировать пользователей»!`
      );
    }
  } else {
    const warn = "⚠️".repeat(count) + "🔘".repeat(MAX_WARNINGS - count);
    await ctx.reply(
      `${warn} Предупреждение ${count}/${MAX_WARNINGS}\nПричина: ${reason}\n\nПри ${MAX_WARNINGS} предупреждениях — блокировка.`
    );
  }
}

bot.start(async (ctx) => {
  try {
    const username = ctx.botInfo?.username ?? "moderatorGroup_bot";
    await ctx.reply(
      `👮 Привет! Я бот-модератор группы.\n\nЯ умею:\n🚫 Удалять спам и рекламу\n🔞 Удалять фото/видео 18+\n🔞 Удалять текст 18+\n⚠️ Предупреждать нарушителей (3 предупреждения = бан)\n\nКак добавить меня в группу:\n1. Открой свою группу\n2. Управление группой → Администраторы\n3. Нажми «Добавить администратора»\n4. Найди @${username}\n5. Дай права «Удалять сообщения» и «Блокировать пользователей»\n\nЗатем напиши в группе: /settings`
    );
  } catch (err) {
    logger.error({ err }, "Error in /start handler");
  }
});

bot.command("help", async (ctx) => {
  const isGroup = ctx.chat.type !== "private";
  const adminOnly = isGroup ? "\n_(только для администраторов)_" : "";
  await ctx.reply(
    `👮 *Команды бота-модератора*${adminOnly}\n\n` +
    `⚙️ *Настройки*\n` +
    `/settings — панель управления модерацией\n\n` +
    `🔇 *Заглушить*\n` +
    `/mute 30 — на 30 минут\n` +
    `/mute 2h — на 2 часа\n` +
    `/mute 1d — на 1 день\n` +
    `/unmute — снять заглушку\n\n` +
    `⚠️ *Предупреждения*\n` +
    `/warnings — посмотреть предупреждения\n` +
    `/unwarn — сбросить предупреждения\n\n` +
    `🚫 *Блокировка*\n` +
    `/kick — выгнать (может вернуться)\n` +
    `/ban — заблокировать навсегда\n` +
    `/unban — разблокировать\n\n` +
    `💡 Все команды кроме /help и /start используются ответом на сообщение нарушителя.`,
    { parse_mode: "Markdown" }
  );
});

bot.command("settings", async (ctx) => {
  if (ctx.chat.type === "private") {
    await ctx.reply("⚙️ Настройки доступны только в группах. Добавь меня в группу!");
    return;
  }
  if (!(await isAdmin(ctx, ctx.from.id))) {
    await ctx.reply("❌ Настройки могут изменять только администраторы.");
    return;
  }
  await ctx.reply(
    "⚙️ Настройки модерации:\n\nНажми кнопку для включения/выключения:",
    buildKeyboard(ctx.chat.id)
  );
});

bot.command("warnings", async (ctx) => {
  if (ctx.chat.type === "private") return;
  if (!(await isAdmin(ctx, ctx.from.id))) return;

  const reply = ctx.message.reply_to_message;
  if (!reply || !("from" in reply) || !reply.from) {
    await ctx.reply("⚠️ Ответь на сообщение пользователя командой /warnings чтобы узнать количество предупреждений.");
    return;
  }

  const targetId = reply.from.id;
  const count = getWarnings(ctx.chat.id, targetId);
  const name = reply.from.first_name;
  await ctx.reply(`📋 ${name}: ${count}/${MAX_WARNINGS} предупреждений`);
});

bot.command("unwarn", async (ctx) => {
  if (ctx.chat.type === "private") return;
  if (!(await isAdmin(ctx, ctx.from.id))) {
    await ctx.reply("❌ Только администраторы могут снимать предупреждения.");
    return;
  }

  const reply = ctx.message.reply_to_message;
  if (!reply || !("from" in reply) || !reply.from) {
    await ctx.reply("⚠️ Ответь на сообщение пользователя командой /unwarn чтобы снять предупреждения.");
    return;
  }

  const targetId = reply.from.id;
  const name = reply.from.first_name;
  resetWarnings(ctx.chat.id, targetId);
  await ctx.reply(`✅ Предупреждения с ${name} сняты.`);
});

function parseDuration(arg: string): number | null {
  const match = arg.trim().match(/^(\d+)(m|min|h|d)?$/i);
  if (!match) return null;
  const value = parseInt(match[1] ?? "0");
  const unit = (match[2] ?? "m").toLowerCase();
  if (unit === "h") return value * 60 * 60;
  if (unit === "d") return value * 24 * 60 * 60;
  return value * 60;
}

bot.command("mute", async (ctx) => {
  if (ctx.chat.type === "private") return;
  if (!(await isAdmin(ctx, ctx.from.id))) {
    await ctx.reply("❌ Только администраторы могут заглушать пользователей.");
    return;
  }

  const reply = ctx.message.reply_to_message;
  if (!reply || !("from" in reply) || !reply.from) {
    await ctx.reply(
      "⚠️ Ответь на сообщение нарушителя командой /mute и укажи время.\n\nПримеры:\n/mute 30 — 30 минут\n/mute 2h — 2 часа\n/mute 1d — 1 день"
    );
    return;
  }

  const args = ctx.message.text.split(" ").slice(1);
  const durationArg = args[0] ?? "30";
  const seconds = parseDuration(durationArg);

  if (!seconds || seconds <= 0) {
    await ctx.reply("❌ Неверный формат времени. Примеры: /mute 30, /mute 2h, /mute 1d");
    return;
  }

  const targetId = reply.from.id;
  const name = reply.from.first_name;

  if (await isAdmin(ctx, targetId)) {
    await ctx.reply("❌ Нельзя заглушить администратора.");
    return;
  }

  const untilDate = Math.floor(Date.now() / 1000) + seconds;

  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const timeStr =
    days >= 1 ? `${days} д.` : hrs >= 1 ? `${hrs} ч.` : `${mins} мин.`;

  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, targetId, {
      permissions: {
        can_send_messages: false,
        can_send_audios: false,
        can_send_documents: false,
        can_send_photos: false,
        can_send_videos: false,
        can_send_video_notes: false,
        can_send_voice_notes: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
      },
      until_date: untilDate,
    });
    await ctx.reply(`🔇 ${name} заглушен на ${timeStr}.`);
  } catch (err) {
    logger.warn({ err }, "Failed to mute user");
    await ctx.reply("❌ Не удалось заглушить. Убедись что у меня есть право «Ограничивать участников».");
  }
});

bot.command("unmute", async (ctx) => {
  if (ctx.chat.type === "private") return;
  if (!(await isAdmin(ctx, ctx.from.id))) {
    await ctx.reply("❌ Только администраторы могут снимать заглушку.");
    return;
  }

  const reply = ctx.message.reply_to_message;
  if (!reply || !("from" in reply) || !reply.from) {
    await ctx.reply("⚠️ Ответь на сообщение пользователя командой /unmute.");
    return;
  }

  const targetId = reply.from.id;
  const name = reply.from.first_name;

  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, targetId, {
      permissions: {
        can_send_messages: true,
        can_send_audios: true,
        can_send_documents: true,
        can_send_photos: true,
        can_send_videos: true,
        can_send_video_notes: true,
        can_send_voice_notes: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      },
    });
    await ctx.reply(`🔊 ${name} может снова писать.`);
  } catch (err) {
    logger.warn({ err }, "Failed to unmute user");
    await ctx.reply("❌ Не удалось снять заглушку.");
  }
});

bot.command("kick", async (ctx) => {
  if (ctx.chat.type === "private") return;
  if (!(await isAdmin(ctx, ctx.from.id))) {
    await ctx.reply("❌ Только администраторы могут выгонять пользователей.");
    return;
  }

  const reply = ctx.message.reply_to_message;
  if (!reply || !("from" in reply) || !reply.from) {
    await ctx.reply("⚠️ Ответь на сообщение пользователя командой /kick.");
    return;
  }

  const targetId = reply.from.id;
  const name = reply.from.first_name;

  if (await isAdmin(ctx, targetId)) {
    await ctx.reply("❌ Нельзя выгнать администратора.");
    return;
  }

  try {
    await ctx.telegram.banChatMember(ctx.chat.id, targetId);
    await ctx.telegram.unbanChatMember(ctx.chat.id, targetId);
    resetWarnings(ctx.chat.id, targetId);
    await ctx.reply(`👢 ${name} выгнан из группы. Он может зайти снова по ссылке.`);
  } catch (err) {
    logger.warn({ err }, "Failed to kick user");
    await ctx.reply("❌ Не удалось выгнать. Убедись что у меня есть право «Блокировать пользователей».");
  }
});

bot.command("ban", async (ctx) => {
  if (ctx.chat.type === "private") return;
  if (!(await isAdmin(ctx, ctx.from.id))) {
    await ctx.reply("❌ Только администраторы могут банить пользователей.");
    return;
  }

  const reply = ctx.message.reply_to_message;
  if (!reply || !("from" in reply) || !reply.from) {
    await ctx.reply("⚠️ Ответь на сообщение нарушителя командой /ban.");
    return;
  }

  const targetId = reply.from.id;
  const name = reply.from.first_name;

  if (await isAdmin(ctx, targetId)) {
    await ctx.reply("❌ Нельзя заблокировать администратора.");
    return;
  }

  try {
    await ctx.telegram.banChatMember(ctx.chat.id, targetId);
    resetWarnings(ctx.chat.id, targetId);
    await ctx.reply(`🔨 ${name} заблокирован администратором.`);
  } catch (err) {
    logger.warn({ err }, "Failed to ban user via /ban command");
    await ctx.reply("❌ Не удалось заблокировать. Убедись что у меня есть право «Блокировать пользователей».");
  }
});

bot.command("unban", async (ctx) => {
  if (ctx.chat.type === "private") return;
  if (!(await isAdmin(ctx, ctx.from.id))) {
    await ctx.reply("❌ Только администраторы могут разблокировать пользователей.");
    return;
  }

  const reply = ctx.message.reply_to_message;
  if (!reply || !("from" in reply) || !reply.from) {
    await ctx.reply("⚠️ Ответь на сообщение пользователя командой /unban.");
    return;
  }

  const targetId = reply.from.id;
  const name = reply.from.first_name;

  try {
    await ctx.telegram.unbanChatMember(ctx.chat.id, targetId);
    await ctx.reply(`✅ ${name} разблокирован.`);
  } catch (err) {
    logger.warn({ err }, "Failed to unban user");
    await ctx.reply("❌ Не удалось разблокировать пользователя.");
  }
});

bot.action(/^toggle:(.+)$/, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from!.id))) {
    await ctx.answerCbQuery("❌ Только администраторы могут менять настройки.");
    return;
  }
  const key = ctx.match[1] as TogglableKey;
  toggleSetting(ctx.chat!.id, key);
  await ctx.editMessageReplyMarkup(buildKeyboard(ctx.chat!.id).reply_markup);
  await ctx.answerCbQuery("✅ Настройка обновлена!");
});

bot.on(message("new_chat_members"), async (ctx) => {
  for (const member of ctx.message.new_chat_members) {
    registerJoin(member.id);
  }
});

bot.on(message("text"), async (ctx) => {
  if (ctx.chat.type === "private") return;

  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (await isAdmin(ctx, userId)) return;

  const s = getSettings(chatId);

  if (s.deleteSpam && isSpam(userId, chatId, text)) {
    await handleViolation(ctx, userId, chatId, "спам / реклама");
    return;
  }

  if (s.deleteAdultText) {
    const adult = await isAdultText(text).catch(() => false);
    if (adult) {
      await handleViolation(ctx, userId, chatId, "текст 18+");
      return;
    }
  }
});

bot.on(message("photo"), async (ctx) => {
  if (ctx.chat.type === "private") return;
  const s = getSettings(ctx.chat.id);
  if (!s.deleteAdultImages) return;
  if (await isAdmin(ctx, ctx.from.id)) return;

  try {
    const photos = ctx.message.photo;
    const best = photos[photos.length - 1];
    if (!best) return;
    const fileLink = await ctx.telegram.getFileLink(best.file_id);
    const adult = await isAdultImage(fileLink.href).catch(() => false);
    if (adult) {
      await handleViolation(ctx, ctx.from.id, ctx.chat.id, "фото 18+");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to process photo moderation");
  }
});

bot.on(message("video"), async (ctx) => {
  if (ctx.chat.type === "private") return;
  const s = getSettings(ctx.chat.id);
  if (!s.deleteAdultImages) return;
  if (await isAdmin(ctx, ctx.from.id)) return;

  try {
    const thumb = ctx.message.video.thumbnail;
    if (!thumb) return;
    const fileLink = await ctx.telegram.getFileLink(thumb.file_id);
    const adult = await isAdultImage(fileLink.href).catch(() => false);
    if (adult) {
      await handleViolation(ctx, ctx.from.id, ctx.chat.id, "видео 18+");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to process video moderation");
  }
});

bot.catch((err) => {
  logger.error({ err }, "Telegram bot error");
});
