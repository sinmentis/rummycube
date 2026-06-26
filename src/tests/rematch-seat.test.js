import {chooseRematchSeat} from '../rummikub/components/GameOverModal';

test('chooseRematchSeat keeps your own seat when free, else first free', () => {
  const seats = [{id: 0, name: null}, {id: 1, name: 'X'}, {id: 2, name: null}];
  expect(chooseRematchSeat(seats, '2')).toBe(2);   // own seat (2) free → keep it
  expect(chooseRematchSeat(seats, '1')).toBe(0);   // own seat taken → first free (0)
  expect(chooseRematchSeat([{id:0,name:'A'}], '0')).toBe(0); // none free → fall back to own id
});
