// ============================================================
// 洗牌种子测试：128 位种子、IPv6 式写法、同种子 → 发牌完全一致
// ============================================================

import { createDecks, dealCards, parseSeed, randomSeed, shuffleCards } from '../deck.ts';
import { ALL_POSITIONS } from '../types.ts';
import { describe, expectEqual, expectTrue, it } from './harness.ts';

/** 规范 128 位种子样例（IPv6 式 8 组） */
const SAMPLE = '9f86:d0e4:6a2e:7b12:4c1f:88aa:0b3d:5e71';
const ZERO = '0000:0000:0000:0000:0000:0000:0000:0000';

/**
 * 整局发牌的签名。
 * 注意：运行时 `card.id` 是全局自增计数器（每局都不同），不能用它比较；
 * 这里用「花色 + 点数」序列，就是玩家实际看到的牌面。
 */
function dealSignature(seed: string): string {
  const deck = createDecks();
  shuffleCards(deck, seed);
  const { hands, bottom } = dealCards(deck, 8);
  const face = (card: { suit: string; rank: number }) => `${card.suit}${card.rank}`;
  return `${ALL_POSITIONS.map(pos => hands[pos].map(face).join(',')).join('|')}|${
    bottom.map(face).join(',')}`;
}

describe('洗牌种子（128 位）', () => {
  it('同一种子两次发牌完全相同（大小写不敏感）', () => {
    expectTrue(dealSignature(SAMPLE) === dealSignature(SAMPLE), 'IPv6 式');
    expectTrue(dealSignature(ZERO) === dealSignature(ZERO), '全零');
    expectTrue(
      dealSignature(SAMPLE) === dealSignature(SAMPLE.toUpperCase()),
      '大写写法与规范写法等价',
    );
    expectTrue(dealSignature('::1') === dealSignature('0:0:0:0:0:0:0:1'), '压缩写法等价');
  });

  it('不同种子发牌不同', () => {
    expectTrue(
      dealSignature(SAMPLE) !== dealSignature('9f86:d0e4:6a2e:7b12:4c1f:88aa:0b3d:5e72'),
      '末组不同',
    );
    expectTrue(dealSignature('::1') !== dealSignature('::2'), '压缩写法');
  });

  it('parseSeed 规范化各种受支持的写法', () => {
    expectEqual(parseSeed(SAMPLE), SAMPLE);
    expectEqual(parseSeed(SAMPLE.toUpperCase()), SAMPLE);
    expectEqual(parseSeed('9f86d0e46a2e7b124c1f88aa0b3d5e71'), SAMPLE, '省略冒号');
    expectEqual(parseSeed('::1'), '0000:0000:0000:0000:0000:0000:0000:0001', ':: 压缩');
    expectEqual(parseSeed('1234::abcd'), '1234:0000:0000:0000:0000:0000:0000:abcd');
    expectEqual(parseSeed('::'), ZERO);
    expectEqual(parseSeed('42'), '0000:0000:0000:0000:0000:0000:0000:002a', '十进制');
    expectEqual(parseSeed('1'), '0000:0000:0000:0000:0000:0000:0000:0001');
  });

  it('parseSeed 拒绝非法输入', () => {
    expectEqual(parseSeed(''), null);
    expectEqual(parseSeed('   '), null);
    expectEqual(parseSeed('1:2:3'), null, '组数不足且无 ::');
    expectEqual(parseSeed('1:2:3:4:5:6:7:8:9'), null, '组数过多');
    expectEqual(parseSeed('::1:2:3:4:5:6:7:8'), null, ':: 未省略任何组');
    expectEqual(parseSeed('a::b::c'), null, '两处 ::');
    expectEqual(parseSeed('gggg::1'), null, '非十六进制');
    expectEqual(parseSeed('12345:0:0:0:0:0:0:0'), null, '单组超过 4 位');
  });

  it('randomSeed 生成规范 128 位种子，且能被 parseSeed 规范化', () => {
    for (let i = 0; i < 20; i++) {
      const seed = randomSeed();
      expectTrue(/^([0-9a-f]{4}:){7}[0-9a-f]{4}$/.test(seed), `seed=${seed}`);
      expectEqual(parseSeed(seed), seed);
    }
  });

  it('旧的数字种子仍可用（等价于其十进制写法）', () => {
    expectTrue(
      dealSignature('42') === dealSignature('0000:0000:0000:0000:0000:0000:0000:002a'),
      '数字 42 等价于十进制 42',
    );
  });

  it('四家各 25 张 + 8 张底牌，每种牌恰好两张', () => {
    const deck = createDecks();
    shuffleCards(deck, SAMPLE);
    const { hands, bottom } = dealCards(deck, 8);
    expectEqual(ALL_POSITIONS.map(pos => hands[pos].length), [25, 25, 25, 25]);
    expectEqual(bottom.length, 8);

    const counts = new Map<string, number>();
    for (const card of [...ALL_POSITIONS.flatMap(pos => hands[pos]), ...bottom]) {
      const key = `${card.suit}${card.rank}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expectEqual(counts.size, 54);
    expectTrue([...counts.values()].every(n => n === 2), '每种牌恰好两张');
  });
});
