// Compile-only check of types/index.d.ts against real usage (npm run typecheck).
import { create, type Board, type BoardState } from '@lionheart06/one-three-five';

const board: Board = create({ listId: 'x', mount: '#board', todos: ['a', { id: 1, title: 'b', url: 'https://x.y' }], capacities: { 3: 4 } });
board.assign('a', 3, 0);
board.assign('a', '5');
board.assign('a', null);
board.assign('a', 0);
board.swap('a', 'b');
board.on('full', e => e.dropped.join(','));
board.on('assign', e => (e.to === null ? 'unassigned' : e.to));
board.on('change', (s: BoardState) => s.buckets['1'].map(t => t.title));
create({ storage: { get: async () => null, set: async () => {} } });

// @ts-expect-error there is no bucket 4
board.assign('a', 4);
// @ts-expect-error unknown event
board.on('moved', () => {});
