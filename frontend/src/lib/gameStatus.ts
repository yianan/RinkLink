import type { BadgeProps } from '../components/ui/Badge';
import type { Event } from '../types';
import { CheckCircle2, CircleDot, CircleOff, Clock3, type LucideIcon } from 'lucide-react';

type GameStatusSource = Pick<Event, 'status' | 'home_weekly_confirmed' | 'away_weekly_confirmed'>;

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

export function getGameStatusIcon(game: GameStatusSource): LucideIcon {
  if (game.status === 'final') return CheckCircle2;
  if (game.status === 'cancelled') return CircleOff;
  if (game.status === 'confirmed' || (game.home_weekly_confirmed && game.away_weekly_confirmed)) return CheckCircle2;
  if (game.home_weekly_confirmed || game.away_weekly_confirmed) return Clock3;
  return CircleDot;
}
