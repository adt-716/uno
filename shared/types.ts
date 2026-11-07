export const colors = ['red', 'yellow', 'green', 'blue'] as const;
export const darkColors = ['pink', 'teal', 'orange', 'purple'] as const;
export const allColors = [...colors, ...darkColors] as const;
export type Color = typeof allColors[number];
export type Mode = 'classic' | 'flip';
export type RoomKind = 'online' | 'solo';
export type Side = 'light' | 'dark';
export type Face = { image: string; color: Color | 'wild'; value: string };
export type Card = Face & { id: string; light?: Face; dark?: Face };
export type PublicCard = Face & { id: string };
export type Player = { id: string; name: string; hand: Card[]; uno: boolean; score: number; bot?: boolean };
export type PenaltyKind = 'wild_draw_four' | 'wild_draw_two' | 'wild_draw_color';
export type PendingPenalty = {
 offender: string; target: string; kind: PenaltyKind; color: Color; previousColor: Color;
 guilty: boolean; evidence: PublicCard[]; finisher?: string;
};
export type Game = {
 status: 'waiting' | 'playing' | 'finished'; mode: Mode; side: Side; rulesVersion: number;
 kind: RoomKind; maxPlayers: number; botNextAt?: number;
 players: Player[]; host: string; dealer: number; round: number;
 deck: Card[]; discard: Card[]; turn: number; direction: number; color: Color;
 winner?: string; champion?: string; roundPoints?: number; drawn?: string;
 placements?: string[];
 catchable?: string; unoDeadlines: Record<string, number>; choosingColor?: string; pending?: PendingPenalty;
 reveal?: { viewer: string; offender: string; cards: PublicCard[] };
 log: string[];
};
export type Action = {
 type: 'start' | 'draw' | 'pass' | 'play' | 'catch' | 'uno' | 'chooseColor' | 'accept' | 'challenge';
 cardId?: string; color?: Color; uno?: boolean; target?: string;
};
export type View = Omit<Game, 'deck' | 'discard' | 'players' | 'pending' | 'reveal' | 'botNextAt'> & {
 code: string; version: number; serverNow: number; me: string; top?: PublicCard; remaining: number; drawBack?: string;
 players: { id: string; name: string; count: number; uno: boolean; score: number; bot?: boolean; backs?: string[] }[];
 hand: PublicCard[];
 pending?: Pick<PendingPenalty, 'offender' | 'target' | 'kind' | 'color' | 'previousColor'>;
 reveal?: { offender: string; cards: PublicCard[] };
};

