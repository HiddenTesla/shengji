// ============================================================
// 叫主交互界面
// ============================================================

import {
  type PlayerPosition,
  type Rank,
  POSITION_NAME_ZH,
  SUIT_SYMBOL,
  RANK_NAME,
} from '../core/types.ts'
import {
  type Declaration,
  declarationLabel,
} from '../core/bidding.ts'

interface TrumpBidderProps {
  /** 轮到哪家 */
  player: PlayerPosition
  /** 当前级牌 */
  levelRank: Rank
  /** 当前最高声明（可能为 null） */
  current: Declaration | null
  /** 该玩家可用的合法声明（已过滤为可覆盖当前） */
  options: Declaration[]
  onDeclare: (d: Declaration) => void
  onPass: () => void
}

/** 花色颜色（与牌面一致） */
const SUIT_COLORS: Record<string, string> = {
  S: '#111111', // 黑桃：纯黑
  H: '#c62828', // 红心：深红
  C: '#1b5e20', // 梅花：墨绿
  D: '#e65100', // 方块：橙红
  J: '#7c3aed', // 王：紫色
}

/** 声明按钮主色（按花色，与牌面一致） */
function optionColor(d: Declaration): string {
  if (d.suit === null) return SUIT_COLORS.J
  return SUIT_COLORS[d.suit] ?? '#ffd700'
}

export default function TrumpBidder({
  player,
  levelRank,
  current,
  options,
  onDeclare,
  onPass,
}: TrumpBidderProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      padding: '16px 24px',
      background: 'rgba(0,0,0,0.55)',
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.2)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)',
      maxWidth: 460,
    }}>
      {/* 标题 */}
      <div style={{
        fontSize: 18,
        fontWeight: 700,
        color: '#ffd700',
      }}>
        叫主 · 打 {RANK_NAME[levelRank]}
      </div>

      {/* 轮到哪家 */}
      <div style={{
        fontSize: 15,
        color: 'rgba(255,255,255,0.85)',
      }}>
        轮到 <b style={{ color: '#7ee787' }}>{POSITION_NAME_ZH[player]}家</b> 叫主
      </div>

      {/* 当前最高声明 */}
      <div style={{
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
      }}>
        {current
          ? `当前：${POSITION_NAME_ZH[current.player]}家 ${declarationLabel(current)}`
          : '当前：尚无人亮主'}
      </div>

      {/* 按钮组 */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'center',
      }}>
        {options.map((opt, i) => {
          const color = optionColor(opt)
          const sym = opt.suit !== null ? SUIT_SYMBOL[opt.suit] : '🃏'
          return (
            <button
              key={i}
              onClick={() => onDeclare(opt)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 18px',
                fontSize: 17,
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 8,
                border: `2px solid ${color}`,
                background: '#fafafa',
                color: '#1a1a1a',
              }}
            >
              <span style={{ fontSize: 22, color, lineHeight: 1 }}>{sym}</span>
              <span style={{ color: '#1a1a1a' }}>{declarationLabel(opt)}</span>
            </button>
          )
        })}

        {/* 过牌 */}
        <button
          onClick={onPass}
          style={{
            padding: '10px 22px',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
          }}
        >
          过
        </button>
      </div>

      {options.length === 0 && (
        <div style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.4)',
        }}>
          无可亮主之牌
        </div>
      )}
    </div>
  )
}
