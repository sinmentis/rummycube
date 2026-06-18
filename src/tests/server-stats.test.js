import {computeServerStats} from '../rummikub/serverStats';

const md = (players, gameover) => ({players, ...(gameover !== undefined ? {gameover} : {})});

test('empty server', () => {
    expect(computeServerStats([])).toEqual({inProgress: 0, waiting: 0, players: 0});
});

test('a full match in progress counts its connected players', () => {
    const m = md({0: {name: 'a', isConnected: true}, 1: {name: 'b', isConnected: true}});
    expect(computeServerStats([m])).toEqual({inProgress: 1, waiting: 0, players: 2});
});

test('a partially filled match is waiting', () => {
    const m = md({0: {name: 'a', isConnected: true}, 1: {isConnected: false}});
    expect(computeServerStats([m])).toEqual({inProgress: 0, waiting: 1, players: 1});
});

test('finished and empty matches are ignored', () => {
    const over = md({0: {name: 'a', isConnected: true}, 1: {name: 'b', isConnected: true}}, {winner: '0'});
    const empty = md({0: {isConnected: false}, 1: {isConnected: false}});
    expect(computeServerStats([over, empty])).toEqual({inProgress: 0, waiting: 0, players: 0});
});

test('mixed server totals', () => {
    const inProg = md({0: {name: 'a', isConnected: true}, 1: {name: 'b', isConnected: false}}); // 1 connected
    const wait = md({0: {name: 'c', isConnected: true}, 1: {}, 2: {}});                          // 1 connected
    expect(computeServerStats([inProg, wait])).toEqual({inProgress: 1, waiting: 1, players: 2});
});
