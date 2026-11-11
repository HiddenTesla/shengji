// ============================================================
// 出牌记录弹窗
//
//   mode="plays"：「查看 → 出牌记录」，默认显示本局的出牌（不含发牌 / 底牌），
//                 也可切换到 JSON / JSONC 文本视图（可选中、可复制 / 导出）
//   mode="full" ：本局结算时显示完整日志，并可复制 / 导出 JSON / JSONC
// 样式：src/styles/components/_play-log-dialog.scss（BEM）
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import {
  type PlayRecord,
  type RoundRecord,
  decodeCardId,
} from '../core/playlog.ts';
import {
  HandType,
  isPointCard,
  type PlayerPosition,
  POSITION_NAME_ZH,
  Rank,
  RANK_NAME,
  Suit,
  SUIT_NAME_ZH,
  SUIT_SYMBOL,
} from '../core/types.ts';
import CardComponent from './CardComponent.tsx';

interface PlayLogDialogProps {
  open: boolean;
  mode: 'plays' | 'full';
  record: RoundRecord | null;
  /** 生成完整日志文本（默认 JSON） */
  serialize: (format: 'json' | 'jsonc') => string;
  onExport: (format: 'json' | 'jsonc') => void;
  onClose: () => void;
}

/** 小号切换按钮（倒序/正序、JSON/JSONC 等）的类名 */
function chipClass(active: boolean): string {
  return active ? 'log-panel__chip log-panel__chip--active' : 'log-panel__chip';
}

function shapeLabel(shape: PlayRecord['shape'], isLead: boolean): string {
  switch (shape.type) {
    case HandType.Single:
      return '单张';
    case HandType.Pair:
      return '对子';
    case HandType.Tractor:
      return '拖拉机';
    case HandType.Throw:
      if (!isLead) return shape.pairs ? `多张 · ${shape.pairs} 对` : '多张';
      return shape.pairs ? `甩牌 · ${shape.pairs} 对` : '甩牌';
    default:
      return String(shape.type);
  }
}

type RankComparison = 'gt' | 'gte' | 'eq' | 'lte' | 'lt';
type ScoreFilter = 'any' | 'with' | 'without';
type PlayerRecordFilter = PlayerPosition | 'all';
type FilterDisplayMode = 'none' | 'filter' | 'highlight';

const RANK_COMPARISONS: { value: RankComparison; label: string }[] = [
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'eq', label: '=' },
  { value: 'lte', label: '≤' },
  { value: 'lt', label: '<' },
];

function matchesRank(rank: Rank, comparison: RankComparison, target: Rank): boolean {
  switch (comparison) {
    case 'gt':
      return rank > target;
    case 'gte':
      return rank >= target;
    case 'eq':
      return rank === target;
    case 'lte':
      return rank <= target;
    case 'lt':
      return rank < target;
  }
}

export default function PlayLogDialog({
  open,
  mode,
  record,
  serialize,
  onExport,
  onClose,
}: PlayLogDialogProps) {
  const [format, setFormat] = useState<'json' | 'jsonc'>('json');
  /** 墩的显示顺序：默认倒序（最新一墩在最上面） */
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  /** plays 模式：是否切换到 JSON / JSONC 文本视图 */
  const [showJson, setShowJson] = useState(false);
  /** 复制成功提示（短暂显示「已复制」） */
  const [copied, setCopied] = useState(false);
  const [playerFilter, setPlayerFilter] = useState<PlayerRecordFilter>('all');
  const [suitFilter, setSuitFilter] = useState<Suit | 'all'>('all');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('any');
  const [rankFilter, setRankFilter] = useState<Rank | ''>('');
  const [rankComparison, setRankComparison] = useState<RankComparison | ''>('');
  const [filterDisplayMode, setFilterDisplayMode] = useState<FilterDisplayMode>('filter');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // 每次打开都回到默认视图：对局中 = 图形记录，结算 = JSON 文本
  useEffect(() => {
    if (!open) return;
    setShowJson(mode === 'full');
    setCopied(false);
    setPlayerFilter('all');
    setSuitFilter('all');
    setScoreFilter('any');
    setRankFilter('');
    setRankComparison('');
    setFilterDisplayMode('filter');
  }, [open, mode]);

  useEffect(() => {
    setCopied(false);
  }, [format, showJson]);

  /** 是否显示 JSON / JSONC 文本视图（两种模式都可自由切换） */
  const showingJson = showJson;

  const fullText = useMemo(
    () => (showingJson && open ? serialize(format) : ''),
    // serialize 每次渲染都是新函数（依赖 logRef），保留 record 作为刷新信号
    [showingJson, open, format, serialize, record],
  );

  /** 复制当前文本到剪贴板（非安全上下文时回退 execCommand） */
  async function copyLog() {
    const text = fullText;
    if (!text) return;
    let done = false;
    try {
      await navigator.clipboard.writeText(text);
      done = true;
    }
    catch {
      // 权限被拒 / 非安全上下文：走下面的回退
    }
    if (!done) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
      }
      finally {
        area.remove();
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (!open) return null;

  const hasPlays = record !== null
    && record.tricks.some(trick => trick.plays.length > 0);
  const allTrickItems = (record?.tricks ?? [])
    .map((trick, index) => ({
      trick,
      index,
      plays: trick.plays.map(play => ({
        play,
        matchingCardIds: (() => {
          if (playerFilter !== 'all' && play.player !== playerFilter) return new Set<string>();
          const cards = play.cards.map(decodeCardId);
          const hasScore = cards.some(card => isPointCard(card.rank));
          if (scoreFilter === 'without' && hasScore) return new Set<string>();
          return new Set(cards
            .filter(card => (
              (suitFilter === 'all' || card.suit === suitFilter)
              && (
                scoreFilter !== 'with'
                || isPointCard(card.rank)
              )
              && (
                rankFilter === ''
                || rankComparison === ''
                || matchesRank(card.rank, rankComparison, rankFilter)
              )
            ))
            .map(card => card.id));
        })(),
      })),
    }))
    .filter(item => item.plays.length > 0);
  const filteredTrickItems = allTrickItems
    .map(item => ({
      ...item,
      plays: item.plays.filter(play => play.matchingCardIds.size > 0),
    }))
    .filter(item => item.plays.length > 0);

  // 只反转「墩」的顺序；墩内仍按出牌顺序（领出 → 跟出）
  const trickItems = filterDisplayMode === 'filter'
    ? [...filteredTrickItems]
    : [...allTrickItems];
  if (order === 'desc') trickItems.reverse();
  const filteredPlayCount = filteredTrickItems.reduce(
    (count, item) => count + item.plays.length,
    0,
  );
  const hasFilters = playerFilter !== 'all'
    || suitFilter !== 'all'
    || scoreFilter !== 'any'
    || rankFilter !== ''
    || rankComparison !== '';

  return (
    <div className="log-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'full' ? '本局完整日志' : '本局出牌记录'}
        onClick={event => event.stopPropagation()}
        className="log-panel"
      >
        <div className="log-panel__header">
          <div className="log-panel__title">
            {mode === 'full' ? '📄 本局完整日志' : '📜 本局出牌记录'}
          </div>
          {record && (
            <span className="log-panel__count">
              {hasFilters
                ? filterDisplayMode === 'highlight'
                  ? `共 ${allTrickItems.length} 墩 · 高亮 ${filteredPlayCount} 手`
                  : filterDisplayMode === 'filter'
                    ? `匹配 ${filteredTrickItems.length} 墩 · ${filteredPlayCount} 手`
                    : `共 ${allTrickItems.length} 墩 · 未应用筛选`
                : `共 ${record.tricks.length} 墩`}
            </span>
          )}
          <button className="log-panel__close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        {!showingJson ? (
          <>
            <div className="log-filters" aria-label="出牌记录筛选">
              <label className="log-filters__control">
                <span>玩家</span>
                <select
                  value={playerFilter}
                  onChange={event => setPlayerFilter(event.target.value as PlayerRecordFilter)}
                >
                  <option value="all">全部</option>
                  {Object.entries(POSITION_NAME_ZH).map(([position, name]) => (
                    <option key={position} value={position}>{name}家</option>
                  ))}
                </select>
              </label>
              <label className="log-filters__control">
                <span>花色</span>
                <select
                  value={suitFilter}
                  onChange={event => setSuitFilter(event.target.value as Suit | 'all')}
                >
                  <option value="all">全部</option>
                  {Object.values(Suit).map(suit => (
                    <option key={suit} value={suit}>
                      {SUIT_SYMBOL[suit]} {SUIT_NAME_ZH[suit]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="log-filters__control">
                <span>分数</span>
                <select
                  value={scoreFilter}
                  onChange={event => setScoreFilter(event.target.value as ScoreFilter)}
                >
                  <option value="any">不限</option>
                  <option value="with">含分牌</option>
                  <option value="without">不含分牌</option>
                </select>
              </label>
              <label className="log-filters__control">
                <span>点数</span>
                <select
                  value={rankComparison}
                  onChange={event => setRankComparison(
                    event.target.value as RankComparison | '',
                  )}
                  aria-label="点数比较方式"
                >
                  <option value="">无选择</option>
                  {RANK_COMPARISONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <select
                  value={rankFilter}
                  onChange={event => setRankFilter(
                    event.target.value === '' ? '' : Number(event.target.value) as Rank,
                  )}
                  aria-label="比较点数"
                >
                  <option value="">不限</option>
                  {Object.values(Rank)
                    .filter((rank): rank is Rank => typeof rank === 'number')
                    .sort((a, b) => a - b)
                    .map(rank => (
                      <option key={rank} value={rank}>{RANK_NAME[rank]}</option>
                    ))}
                </select>
              </label>
              {hasFilters && (
                <button
                  className="log-panel__chip"
                  onClick={() => {
                    setPlayerFilter('all');
                    setSuitFilter('all');
                    setScoreFilter('any');
                    setRankFilter('');
                    setRankComparison('');
                  }}
                >
                  清除筛选
                </button>
              )}
              <div className="log-panel__chip-group log-filters__mode">
                <span>显示</span>
                <button
                  className={chipClass(filterDisplayMode === 'none')}
                  onClick={() => setFilterDisplayMode('none')}
                >
                  无
                </button>
                <button
                  className={chipClass(filterDisplayMode === 'filter')}
                  onClick={() => setFilterDisplayMode('filter')}
                >
                  筛选
                </button>
                <button
                  className={chipClass(filterDisplayMode === 'highlight')}
                  onClick={() => setFilterDisplayMode('highlight')}
                >
                  高亮
                </button>
              </div>
            </div>
            <div className="log-list">
              {!hasPlays && (
                <div className="log-list__empty">
                  本局还没有出牌记录
                </div>
              )}
              {hasPlays && filterDisplayMode === 'filter' && trickItems.length === 0 && (
                <div className="log-list__empty">
                  没有符合条件的出牌记录
                </div>
              )}

              {trickItems.map(({ trick, index, plays }) => (
                <div
                  key={index}
                  className="log-trick"
                >
                  <div className="log-trick__header">
                    <b className="log-trick__no">第 {index + 1} 墩</b>
                    <span className="log-trick__meta">
                      领出 {POSITION_NAME_ZH[trick.leadPlayer]}家
                    </span>
                    {trick.winner && (
                      <span className="log-trick__meta">
                        · 赢家 {POSITION_NAME_ZH[trick.winner]}家
                      </span>
                    )}
                    {trick.points !== undefined && (
                      <span className="log-trick__points">
                        · {trick.points} 分
                      </span>
                    )}
                    {trick.scoreAfter && (
                      <span className="log-trick__score">
                        闲 {trick.scoreAfter.defending} / 庄 {trick.scoreAfter.banker}
                      </span>
                    )}
                  </div>

                  {plays.map(({ play, matchingCardIds }) => (
                    <div
                      key={play.player}
                      className="log-play"
                    >
                      <span className="log-play__player">
                        {POSITION_NAME_ZH[play.player]}家
                      </span>
                      <div className="log-play__cards">
                        {play.cards.map(id => (
                          <span
                            key={id}
                            className={hasFilters
                              && filterDisplayMode === 'highlight'
                              ? matchingCardIds.has(id)
                                ? 'log-play__card log-play__card--highlight'
                                : 'log-play__card log-play__card--dimmed'
                              : 'log-play__card'}
                          >
                            <CardComponent
                              card={decodeCardId(id)}
                              faceUp={true}
                              small={true}
                              scale={0.52}
                            />
                          </span>
                        ))}
                      </div>
                      <span className="log-play__shape">
                        {shapeLabel(play.shape, play.player === trick.leadPlayer)}
                      </span>
                      {play.shape.points !== undefined && (
                        <span className="log-play__points">
                          +{play.shape.points}
                        </span>
                      )}
                      {play.throw && (
                        <span className="log-play__throw">
                          甩牌被拦 · 欲甩 {play.throw.attempted.length} 张
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        ) : (
          <pre className="log-text">
            {fullText}
          </pre>
        )}

        <div className="log-panel__footer">
          {/* 记录视图：墩的排序 */}
          {!showingJson && (
            <div className="log-panel__chip-group">
              {([
                ['desc', '倒序'],
                ['asc', '正序'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setOrder(value)}
                  title={value === 'desc' ? '最新一墩在前' : '最早一墩在前'}
                  className={chipClass(order === value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* 图形记录 / JSON / JSONC 视图切换（对局中与结算均可用） */}
          <div className="log-panel__chip-group">
            {([
              ['log', '📜 记录'],
              ['json', 'JSON'],
              ['jsonc', 'JSONC'],
            ] as const).map(([value, label]) => {
              const active = value === 'log'
                ? !showJson
                : showJson && format === value;
              return (
                <button
                  key={value}
                  onClick={() => {
                    if (value === 'log') {
                      setShowJson(false);
                    }
                    else {
                      setShowJson(true);
                      setFormat(value);
                    }
                  }}
                  title={value === 'log'
                    ? '图形化显示每墩出牌'
                    : `显示 ${value.toUpperCase()} 文本`}
                  className={chipClass(active)}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <span className="log-panel__spacer" />

          {showingJson && (
            <button
              onClick={copyLog}
              className="log-panel__button"
              title="复制当前文本到剪贴板"
            >
              {copied ? '✅ 已复制' : '📋 复制'}
            </button>
          )}
          {showingJson && (
            <button
              onClick={() => onExport(format)}
              className="log-panel__button log-panel__button--primary"
            >
              ⬇ 导出 {format.toUpperCase()}
            </button>
          )}
          <button onClick={onClose} className="log-panel__button">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
