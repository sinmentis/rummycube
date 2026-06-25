import {tilesRightward} from '../rummikub/boardUtil';

test('includes pressed + right contiguous, excludes left', () => {
  const tp = {
    a:{gridId:'b',row:0,col:0}, b:{gridId:'b',row:0,col:1},
    c:{gridId:'b',row:0,col:2}, d:{gridId:'b',row:0,col:3},
  };
  expect(tilesRightward(tp, 'b')).toEqual(['b','c','d']);  // 'a' (left) excluded
});

test('stops at a gap', () => {
  const tp = {
    a:{gridId:'b',row:0,col:0}, b:{gridId:'b',row:0,col:1},
    d:{gridId:'b',row:0,col:3}, // gap at col 2
  };
  expect(tilesRightward(tp, 'a')).toEqual(['a','b']);
});

test('single tile with no right neighbour returns just itself', () => {
  const tp = {a:{gridId:'b',row:0,col:5}};
  expect(tilesRightward(tp, 'a')).toEqual(['a']);
});

test('HAND grid isolates by playerID', () => {
  const tp = {
    a:{gridId:'h',row:0,col:0,playerID:'0'},
    b:{gridId:'h',row:0,col:1,playerID:'1'}, // different player, must not chain
  };
  expect(tilesRightward(tp, 'a')).toEqual(['a']);
});

test('board grid does not isolate by player', () => {
  const tp = {
    a:{gridId:'b',row:0,col:0,playerID:null},
    b:{gridId:'b',row:0,col:1,playerID:null},
  };
  expect(tilesRightward(tp, 'a')).toEqual(['a','b']);
});
