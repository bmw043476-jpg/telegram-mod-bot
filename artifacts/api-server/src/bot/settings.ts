export interface ChatSettings {
  deleteSpam: boolean;
  deleteAdultImages: boolean;
  deleteAdultText: boolean;
}

export type TogglableKey = keyof ChatSettings;

const defaultSettings = (): ChatSettings => ({
  deleteSpam: true,
  deleteAdultImages: true,
  deleteAdultText: true,
});

const chatSettings = new Map<number, ChatSettings>();

export function getSettings(chatId: number): ChatSettings {
  if (!chatSettings.has(chatId)) {
    chatSettings.set(chatId, defaultSettings());
  }
  return chatSettings.get(chatId)!;
}

export function toggleSetting(chatId: number, key: TogglableKey): boolean {
  const s = getSettings(chatId);
  s[key] = !s[key];
  return s[key];
}
