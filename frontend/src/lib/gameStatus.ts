import type { BadgeProps } from '../components/ui/Badge';
import type { Game } from '../types';

type GameStatusSource = Pick<Game, 'status' | 'home_weekly_confirmed' | 'away_weekly_confirmed'>;

export function getGameStatusLabel(game: GameStatusSource) {
  if (game.status === 'final') return 'Final';
  if (game.status === 'cancelled') return 'Cancelled';
  if (game.status === 'confirmed') return 'Both confirmed';
  if (game.home_weekly_confirmed && game.away_weekly_confirmed) return 'Both confirmed';
  if (game.home_weekly_confirmed) return 'Home confirmed';
  if (game.away_weekly_confirmed) return 'Away confirmed';
  return 'Scheduled';
}

export function getGameStatusVariant(game: GameStatusSource): NonNullable<BadgeProps['variant']> {
  if (game.status === 'final') return 'success';
  if (game.status === 'cancelled') return 'neutral';
  if (game.status === 'confirmed' || (game.home_weekly_confirmed && game.away_weekly_confirmed)) return 'success';
  if (game.home_weekly_confirmed || game.away_weekly_confirmed) return 'warning';
  return 'info';
}
