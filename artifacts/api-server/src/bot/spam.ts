const URL_REGEX =
  /(?:https?:\/\/|www\.)[^\s]+|t\.me\/[^\s]+/gi;

const SPAM_PATTERNS = [
  /заработ(ок|ать|ай)\s*(деньги|₽|\$)/i,
  /пассивный\s*доход/i,
  /крипто.*заработ/i,
  /инвест.*гаранти/i,
  /нажми.*ссылк/i,
  /подпишись.*канал/i,
  /реклама|промокод|скидка\s+\d+%/i,
];

const userJoinTimes = new Map<number, number>();
const recentMessages = new Map<string, string[]>();

const NEW_USER_WINDOW_MS = 24 * 60 * 60 * 1000;
const REPEAT_WINDOW_MS = 60 * 1000;
const REPEAT_THRESHOLD = 3;

export function registerJoin(userId: number): void {
  userJoinTimes.set(userId, Date.now());
}

export function isNewUser(userId: number): boolean {
  const joinTime = userJoinTimes.get(userId);
  if (!joinTime) return false;
  return Date.now() - joinTime < NEW_USER_WINDOW_MS;
}

export function isSpam(
  userId: number,
  chatId: number,
  text: string
): boolean {
  const isNew = isNewUser(userId);

  if (isNew && URL_REGEX.test(text)) return true;

  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  const key = `${chatId}:${userId}`;
  const now = Date.now();
  const history = (recentMessages.get(key) ?? []).filter(
    (m) => m.startsWith(`${now - REPEAT_WINDOW_MS}:`) === false
  );

  const msgEntry = `${now}:${text}`;
  history.push(msgEntry);
  recentMessages.set(key, history.slice(-20));

  const recentTexts = history
    .filter((m) => {
      const ts = parseInt(m.split(":")[0] ?? "0");
      return now - ts < REPEAT_WINDOW_MS;
    })
    .map((m) => m.substring(m.indexOf(":") + 1));

  const counts: Record<string, number> = {};
  for (const t of recentTexts) {
    counts[t] = (counts[t] ?? 0) + 1;
    if (counts[t] >= REPEAT_THRESHOLD) return true;
  }

  return false;
}
