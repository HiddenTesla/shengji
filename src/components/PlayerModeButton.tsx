import {
  type PlayerPosition,
  PlayerMode,
  POSITION_NAME_ZH,
} from '../core/types.ts';

interface PlayerModeButtonProps {
  position: PlayerPosition;
  mode: PlayerMode;
  onToggle: () => void;
}

export default function PlayerModeButton({
  position,
  mode,
  onToggle,
}: PlayerModeButtonProps) {
  const isManual = mode === PlayerMode.Manual;

  return (
    <button
      className={isManual ? 'mode-button mode-button--manual' : 'mode-button'}
      onClick={onToggle}
    >
      {POSITION_NAME_ZH[position]}家·{isManual ? '手动' : '托管'}
    </button>
  );
}
