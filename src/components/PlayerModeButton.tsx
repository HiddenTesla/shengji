import {
  type PlayerPosition,
  PlayerMode,
  POSITION_NAME_ZH,
} from '../core/types.ts'

interface PlayerModeButtonProps {
  position: PlayerPosition
  mode: PlayerMode
  onToggle: () => void
}

export default function PlayerModeButton({
  position,
  mode,
  onToggle,
}: PlayerModeButtonProps) {
  const isManual = mode === PlayerMode.Manual

  return (
    <button
      onClick={onToggle}
      style={{
        padding: '3px 9px',
        fontSize: 13,
        cursor: 'pointer',
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: 4,
        background: isManual ? 'rgba(255,215,0,0.2)' : 'rgba(100,200,255,0.15)',
        color: isManual ? '#ffd700' : '#90caf9',
        whiteSpace: 'nowrap',
      }}
    >
      {POSITION_NAME_ZH[position]}家·{isManual ? '手动' : '托管'}
    </button>
  )
}
