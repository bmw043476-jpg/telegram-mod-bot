const MAX_WARNINGS = 3;

const warnings = new Map<string, number>();

function key(chatId: number, userId: number): string {
  return `${chatId}:${userId}`;
}

export function getWarnings(chatId: number, userId: number): number {
  return warnings.get(key(chatId, userId)) ?? 0;
}

export function addWarning(chatId: number, userId: number): number {
  const k = key(chatId, userId);
  const current = (warnings.get(k) ?? 0) + 1;
  warnings.set(k, current);
  return current;
}

export function resetWarnings(chatId: number, userId: number): void {
  warnings.delete(key(chatId, userId));
}

export function isMaxWarnings(count: number): boolean {
  return count >= MAX_WARNINGS;
}

export { MAX_WARNINGS };
