import {
  type Card,
  type PlayerPosition,
  type PlayedCards,
  type Suit,
  GamePhase,
  HandType,
  PlayerPosition as Position,
  Rank,
  Suit as CardSuit,
  Team,
  nextPlayer,
  teamOf,
} from './types.ts';
import { type LapBoard, type LevelBoard } from './rank.ts';
import { analyzeShape } from './hand.ts';
import {
  type Hands,
  type PlayState,
  type TrickState,
  doorOf,
  judgeTrick,
} from './play.ts';

export interface ParsedGameState {
  levels: LevelBoard;
  laps: LapBoard;
  banker: PlayerPosition;
  trumpSuit: Suit | null;
  bottomCards: Card[];
  hands: Hands;
  playState: PlayState;
  cardIdMap: Map<string, string>;
}

const POSITIONS = [
  Position.East,
  Position.South,
  Position.West,
  Position.North,
] as const;

const TEAMS = [
  [Team.NS, '南北'],
  [Team.EW, '东西'],
] as const;

function objectValue(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} 必须是数组`);
  return value;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} 必须是字符串`);
  return value;
}

function positionValue(value: unknown, path: string): PlayerPosition {
  const text = stringValue(value, path);
  const byName = POSITIONS.find(pos => text === `${positionName(pos)}家`);
  const byCode = POSITIONS.find(pos => text === pos);
  const position = byName ?? byCode;
  if (!position) throw new Error(`${path} 不是有效的玩家方位`);
  return position;
}

function positionName(position: PlayerPosition): string {
  switch (position) {
    case Position.East:
      return '东';
    case Position.South:
      return '南';
    case Position.West:
      return '西';
    case Position.North:
      return '北';
  }
}

function rankValue(value: unknown, path: string): Rank {
  const text = typeof value === 'string' ? value : String(value);
  const ranks: Record<string, Rank> = {
    '2': Rank.Two,
    '3': Rank.Three,
    '4': Rank.Four,
    '5': Rank.Five,
    '6': Rank.Six,
    '7': Rank.Seven,
    '8': Rank.Eight,
    '9': Rank.Nine,
    '10': Rank.Ten,
    J: Rank.Jack,
    Q: Rank.Queen,
    K: Rank.King,
    A: Rank.Ace,
  };
  const rank = ranks[text];
  if (rank === undefined) throw new Error(`${path} 不是有效级牌`);
  return rank;
}

function suitValue(value: unknown): Suit | null {
  const text = stringValue(value, 'trumpSuit').trim();
  if (text === '无主') return null;
  const suits: Record<string, Suit> = {
    S: CardSuit.Spade,
    H: CardSuit.Heart,
    C: CardSuit.Club,
    D: CardSuit.Diamond,
    '♠': CardSuit.Spade,
    '♥': CardSuit.Heart,
    '♣': CardSuit.Club,
    '♦': CardSuit.Diamond,
  };
  const match = /^(?:([SHCD])|([♠♥♣♦]))(?:（([SHCD])）)?$/.exec(text);
  const code = match?.[1] ?? match?.[3] ?? match?.[2];
  const suit = code ? suits[code] : undefined;
  if (!suit) throw new Error('trumpSuit 必须是有效花色或“无主”');
  if (match?.[1] && match[3] && match[1] !== match[3]) {
    throw new Error('trumpSuit 的花色代码不一致');
  }
  return suit;
}

function parseCard(value: unknown, path: string): Card {
  const id = stringValue(value, path);
  const match = /^([SHCDJ])(2|3|4|5|6|7|8|9|10|11|12|13|14|16|17)#([01])$/.exec(id);
  if (!match) throw new Error(`${path} 卡牌 ID 无效：${id}`);
  const suit = match[1] as Suit;
  const rank = Number(match[2]) as Rank;
  if ((suit === CardSuit.Joker) !== (rank === Rank.SmallJoker || rank === Rank.BigJoker)) {
    throw new Error(`${path} 卡牌花色与牌面不匹配：${id}`);
  }
  return { id, suit, rank };
}

function cardsValue(value: unknown, path: string): Card[] {
  return arrayValue(value, path).map((card, index) => parseCard(card, `${path}[${index}]`));
}

function integerValue(value: unknown, path: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new Error(`${path} 必须是大于等于 ${minimum} 的整数`);
  }
  return value;
}

function parseJsonc(text: string): unknown {
  let withoutComments = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (inString) {
      withoutComments += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      withoutComments += char;
    }
    else if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index++;
      withoutComments += '\n';
    }
    else if (char === '/' && next === '*') {
      index += 2;
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
        if (text[index] === '\n') withoutComments += '\n';
        index++;
      }
      if (index >= text.length) throw new Error('JSONC 注释未闭合');
      index++;
    }
    else {
      withoutComments += char;
    }
  }

  let withoutTrailingCommas = '';
  inString = false;
  escaped = false;
  for (let index = 0; index < withoutComments.length; index++) {
    const char = withoutComments[index];
    if (inString) {
      withoutTrailingCommas += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    if (char === ',') {
      let nextIndex = index + 1;
      while (/\s/.test(withoutComments[nextIndex] ?? '')) nextIndex++;
      if (withoutComments[nextIndex] === '}' || withoutComments[nextIndex] === ']') continue;
    }
    withoutTrailingCommas += char;
  }

  try {
    return JSON.parse(withoutTrailingCommas) as unknown;
  }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`局面 JSON/JSONC 格式错误：${detail}`);
  }
}

/** Parse and validate an exported playing snapshot for replay or AI analysis. */
export function parseGameState(text: string): ParsedGameState {
  const root = objectValue(parseJsonc(text), '局面');
  if (root.schemaVersion !== 1) {
    throw new Error('不支持的局面格式版本（schemaVersion 必须为 1）');
  }
  if (root.phase !== GamePhase.Playing) {
    throw new Error('仅支持导入出牌阶段的局面，请先在出牌阶段导出局面');
  }

  const levelObject = objectValue(root.levels, 'levels');
  const lapObject = objectValue(root.laps, 'laps');
  const levels = {} as LevelBoard;
  const laps = {} as LapBoard;
  for (const [team, name] of TEAMS) {
    levels[team] = rankValue(levelObject[name], `levels.${name}`);
    laps[team] = integerValue(lapObject[name], `laps.${name}`, 1);
  }

  const banker = positionValue(root.banker, 'banker');
  const trumpSuit = suitValue(root.trumpSuit);
  const score = objectValue(root.score, 'score');
  const defendingPoints = integerValue(score.defendingPoints, 'score.defendingPoints', 0);
  const bankerPoints = integerValue(score.bankerEscapePoints, 'score.bankerEscapePoints', 0);
  const bottomCards = cardsValue(root.bottomCards, 'bottomCards');
  if (bottomCards.length !== 8) throw new Error('bottomCards 必须包含 8 张底牌');

  const handsObject = objectValue(root.remainingHands, 'remainingHands');
  const hands = {} as Hands;
  for (const position of POSITIONS) {
    hands[position] = cardsValue(
      handsObject[`${positionName(position)}家`],
      `remainingHands.${positionName(position)}家`,
    );
  }

  const currentTrickObject = objectValue(root.currentTrick, 'currentTrick');
  const leadPlayer = positionValue(currentTrickObject.leader, 'currentTrick.leader');
  const levelRank = levels[teamOf(banker)];
  const played = arrayValue(currentTrickObject.played, 'currentTrick.played')
    .map((value, index): PlayedCards => {
      const path = `currentTrick.played[${index}]`;
      const play = objectValue(value, path);
      const cards = cardsValue(play.cards, `${path}.cards`);
      if (cards.length === 0) throw new Error(`${path}.cards 不能为空`);
      return {
        player: positionValue(play.player, `${path}.player`),
        cards,
        handType: analyzeShape(cards, trumpSuit, levelRank).type,
      };
    });
  if (played.length > POSITIONS.length) throw new Error('当前墩最多只能有四家出牌');
  if (new Set(played.map(play => play.player)).size !== played.length) {
    throw new Error('当前墩中同一家不能重复出牌');
  }

  for (let index = 0; index < played.length; index++) {
    const expected = index === 0 ? leadPlayer : nextPlayer(played[index - 1].player);
    if (played[index].player !== expected) {
      throw new Error('当前墩的出牌顺序与领出者不匹配');
    }
    if (played[index].cards.length !== played[0].cards.length) {
      throw new Error('当前墩每家的出牌张数必须一致');
    }
  }

  const complete = played.length === POSITIONS.length;
  const turn = currentTrickObject.turn === null
    ? null
    : positionValue(currentTrickObject.turn, 'currentTrick.turn');
  const expectedTurn = played.length === 0
    ? leadPlayer
    : nextPlayer(played[played.length - 1].player);
  if (complete ? turn !== null : turn !== expectedTurn) {
    throw new Error('currentTrick.turn 与当前墩出牌顺序不匹配');
  }

  const allCurrentCards = [
    ...bottomCards,
    ...POSITIONS.flatMap(position => hands[position]),
    ...played.flatMap(play => play.cards),
  ];
  const cardIds = allCurrentCards.map(card => card.id);
  if (new Set(cardIds).size !== cardIds.length) {
    throw new Error('底牌、剩余手牌和当前墩不能包含重复卡牌 ID');
  }
  const cardIdMap = new Map(cardIds.map(id => [id, id]));

  const leadCards = played[0]?.cards;
  const leadShape = leadCards
    ? analyzeShape(leadCards, trumpSuit, levelRank)
    : null;
  const leadCard = leadCards?.[0] ?? null;
  const trick: TrickState = {
    leadPlayer,
    leadDoor: leadShape && leadCard ? doorOf(leadCard, trumpSuit, levelRank) : null,
    leadCount: leadCards?.length ?? 0,
    leadType: leadShape?.type ?? HandType.Single,
    leadPairs: leadShape?.pairs ?? 0,
    leadTractor: leadShape?.tractor ?? 0,
    leadMaxTractor: leadShape?.maxTractor ?? 0,
    throwBlocked: false,
    throwAttempt: [],
    plays: played,
    complete,
    winner: null,
  };
  if (complete) trick.winner = judgeTrick(trick, trumpSuit, levelRank);

  return {
    levels,
    laps,
    banker,
    trumpSuit,
    bottomCards,
    hands,
    cardIdMap,
    playState: {
      banker,
      turn: complete ? leadPlayer : expectedTurn,
      trick,
      tricks: [],
      defendingPoints,
      bankerPoints,
      bottom: null,
    },
  };
}
