// ============================================================
// 牌组、洗牌、发牌
// ============================================================

import {
  type Card,
  type CardId,
  Suit,
  Rank,
  ALL_POSITIONS,
  type PlayerPosition,
} from './types.ts';
import { createCard } from './card.ts';

// ---- 创建两副牌 ----

/** 一副标准 54 张牌（不含王为 52 张） */
const STANDARD_SUITS: Suit[] = [Suit.Spade, Suit.Heart, Suit.Club, Suit.Diamond];
const STANDARD_RANKS: Rank[] = [
  Rank.Two,
  Rank.Three,
  Rank.Four,
  Rank.Five,
  Rank.Six,
  Rank.Seven,
  Rank.Eight,
  Rank.Nine,
  Rank.Ten,
  Rank.Jack,
  Rank.Queen,
  Rank.King,
  Rank.Ace,
];

/** 生成一副 54 张牌（52 张 + 大小王） */
function createOneDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of STANDARD_SUITS) {
    for (const rank of STANDARD_RANKS) {
      cards.push(createCard(suit, rank));
    }
  }
  // 大小王
  cards.push(createCard(Suit.Joker, Rank.SmallJoker));
  cards.push(createCard(Suit.Joker, Rank.BigJoker));
  return cards;
}

/** 创建两副完整牌（共 108 张） */
export function createDecks(): Card[] {
  return [...createOneDeck(), ...createOneDeck()];
}

// ---- 洗牌（Fisher-Yates） ----

/**
 * 128 位洗牌种子，规范形式 = IPv6 式 8 组 4 位小写十六进制，如
 * `9f86:d0e4:6a2e:7b12:4c1f:88aa:0b3d:5e71`（永远全写、不压缩）。
 * 种子固定 → 洗牌 / 发牌完全可复现。
 */
export type Seed = string;

const SEED_GROUPS = 8;
const SEED_GROUP_RE = /^[0-9a-f]{1,4}$/;
/** 2^128 - 1 */
const SEED_MAX = (1n << 128n) - 1n;

/** 128 位整数 → 规范种子字符串（8 组 × 4 位，补零） */
function bigintToSeed(value: bigint): Seed {
  const hex = value.toString(16).padStart(32, '0').slice(-32);
  const groups: string[] = [];
  for (let i = 0; i < 32; i += 4) groups.push(hex.slice(i, i + 4));
  return groups.join(':');
}

/**
 * 解析用户输入的种子，返回规范形式；非法返回 null。
 * 支持三种写法（大小写不敏感）：
 *   - IPv6 式：8 组、每组 1~4 位十六进制，可用 `::` 压缩（如 `::1`、`1234::abcd`）；
 *   - 省略冒号：1~32 位十六进制（如 `2a`、`9f86d0e4…`）；
 *   - 纯十进制整数 0 ~ 2^128-1（如 `42`，兼容旧版 32 位种子）。
 */
export function parseSeed(text: string): Seed | null {
  const raw = text.trim().toLowerCase();
  if (raw === '') return null;

  // 纯十进制
  if (/^\d+$/.test(raw)) {
    try {
      const value = BigInt(raw);
      return value > SEED_MAX ? null : bigintToSeed(value);
    }
    catch {
      return null;
    }
  }

  // 不带冒号的十六进制（1~32 位）
  if (/^[0-9a-f]{1,32}$/.test(raw)) {
    return bigintToSeed(BigInt(`0x${raw}`));
  }

  // IPv6 式（可含一处 `::`）
  const halves = raw.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const groups = [...head, ...tail];
  if (!groups.every(group => SEED_GROUP_RE.test(group))) return null;

  if (halves.length === 1) {
    if (groups.length !== SEED_GROUPS) return null;
  }
  else {
    // `::` 至少要省略一组
    if (SEED_GROUPS - groups.length < 1) return null;
  }

  const missing = SEED_GROUPS - groups.length;
  const filled = halves.length === 2
    ? [...head, ...Array<string>(missing).fill('0'), ...tail]
    : head;
  return filled.map(group => group.padStart(4, '0')).join(':');
}

/** 规范种子 → 4 个 32 位字（sfc32 的初始状态） */
function seedWords(seed: Seed): [number, number, number, number] {
  const hex = seed.replace(/:/g, '');
  return [
    Number.parseInt(hex.slice(0, 8), 16),
    Number.parseInt(hex.slice(8, 16), 16),
    Number.parseInt(hex.slice(16, 24), 16),
    Number.parseInt(hex.slice(24, 32), 16),
  ];
}

/**
 * Fisher-Yates 洗牌算法
 * @param cards 待洗牌的数组（会被修改）
 * @param seed 可选随机种子（128 位，规范形式或用户输入的任意受支持写法；也接受旧的数字种子）
 */
export function shuffleCards(cards: Card[], seed?: Seed | number): void {
  const normalized = seed === undefined
    ? null
    : parseSeed(typeof seed === 'number' ? String(seed) : seed);
  const rng = normalized ? seededRandom(normalized) : Math.random;

  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]];
  }
}

/** 种子随机数生成器（sfc32，128 位状态，周期约 2^128） */
function seededRandom(seed: Seed): () => number {
  let [a, b, c, d] = seedWords(seed);
  const next = () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // 预热，避免种子相近时前几项输出高度相关
  for (let i = 0; i < 12; i++) next();
  return next;
}

/** 生成一个随机洗牌种子（128 位，优先用 crypto；无 crypto 时退回 Math.random） */
export function randomSeed(): Seed {
  const words = new Uint32Array(4);
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
    cryptoObject.getRandomValues(words);
  }
  else {
    for (let i = 0; i < words.length; i++) {
      words[i] = Math.floor(Math.random() * 0x100000000);
    }
  }
  let value = 0n;
  for (const word of words) value = (value << 32n) | BigInt(word >>> 0);
  return bigintToSeed(value);
}

// ---- 发牌 ----

export interface DealResult {
  /** 每个玩家的手牌 */
  hands: Record<PlayerPosition, Card[]>;
  /** 底牌 */
  bottom: Card[];
}

/**
 * 发牌：每人 25 张，留 8 张底牌
 * 发牌顺序：东→北→西→南 循环（逆时针）
 */
export function dealCards(
  deck: Card[],
  bottomCount: number = 8,
  cardOrder?: PlayerPosition[],
): DealResult {
  const order = cardOrder ?? ALL_POSITIONS;
  const hands: Record<string, Card[]> = {
    E: [],
    S: [],
    W: [],
    N: [],
  };

  const cardsPerPlayer = (deck.length - bottomCount) / 4;

  let idx = 0;
  // 每人 cardsPerPlayer 张
  for (let i = 0; i < cardsPerPlayer; i++) {
    for (const pos of order) {
      hands[pos].push(deck[idx++]);
    }
  }

  // 剩余为底牌
  const bottom = deck.slice(idx);

  return {
    hands: hands as Record<PlayerPosition, Card[]>,
    bottom,
  };
}

