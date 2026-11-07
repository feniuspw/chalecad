import { describe, expect, it } from 'vitest';
import { timeAgo } from './time';

describe('timeAgo', () => {
  const now = 1_000_000_000_000;
  it.each([
    [10_000, 'agora há pouco'],
    [5 * 60_000, 'há 5 min'],
    [3 * 3_600_000, 'há 3 h'],
    [26 * 3_600_000, 'ontem'],
    [12 * 86_400_000, 'há 12 dias'],
    [65 * 86_400_000, 'há 2 meses'],
    [800 * 86_400_000, 'há 2 anos'],
  ])('%i ms atrás', (delta, text) => expect(timeAgo(now - delta, now)).toBe(text));
});
