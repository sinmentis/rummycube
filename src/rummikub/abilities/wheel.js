// Public Wheel (chaos mode). Pure server logic: no boardgame.io import, no DOM,
// no Math.random — every roll comes from the injected boardgame.io `random` API so
// a spin is fully deterministic under a seed and replays identically on every peer.
// Joins the server's native-ESM graph, so keep it dependency-light.
//
// A spin first rolls the OBJECT (who/what it hits): player 50% / table 35% /
// all 15%. Then it rolls the ACTION:
//   player/all -> draw1-3 45% (1:40/2:40/3:20) | discard-to-pool 30% | reshuffle 25%
//   table      -> add-set 50% | remove-set 50%
// Effects only ever move tiles between the three states hand / table / tilesPool.
// Result {object, action, detail} is stored on G.lastWheel and returned.
import {extractSeqs} from '../moveValidation.js';
import {isJoker} from '../util.js';
import {pushTilesToGrid} from '../orderTiles.js';
import {
    HAND_ROWS, HAND_COLS, HAND_GRID_ID,
    BOARD_ROWS, BOARD_COLS, BOARD_GRID_ID,
} from '../constants.js';

// Object buckets: r < 0.50 player, < 0.85 table, else all (06 §5 locked odds).
const OBJECT_PLAYER = 0.50;
const OBJECT_TABLE = 0.85;
// Player-action buckets: r < 0.45 draw, < 0.75 discard, else reshuffle.
const ACTION_DRAW = 0.45;
const ACTION_DISCARD = 0.75;
// Draw-count buckets: r < 0.40 one, < 0.80 two, else three.
const DRAW_ONE = 0.40;
const DRAW_TWO = 0.80;
// Table-action bucket: r < 0.50 add-set, else remove-set.
const TABLE_ADD = 0.50;
const ADD_SET_SIZE = 3;

function handTiles(G, seat) {
    return Object.keys(G.tilePositions).filter(id => {
        const pos = G.tilePositions[id];
        return pos.gridId === HAND_GRID_ID && pos.playerID === seat;
    });
}

function drawCount(random) {
    const r = random.Number();
    if (r < DRAW_ONE) return 1;
    if (r < DRAW_TWO) return 2;
    return 3;
}

// Pop up to `count` tiles off the pool and place them into a seat's hand grid,
// mirroring drawTile. Stops if the pool empties. Returns the ids moved.
function popToHand(G, ctx, seat, count) {
    const tiles = [];
    for (let i = 0; i < count; i++) {
        const tile = G.tilesPool.pop();
        if (tile == null) break;
        tiles.push(tile);
    }
    pushTilesToGrid(tiles, HAND_ROWS, HAND_COLS, G, {gridId: HAND_GRID_ID, playerID: seat}, ctx);
    return tiles;
}

function draw(G, ctx, seat, random) {
    const tiles = popToHand(G, ctx, seat, drawCount(random));
    return {seat, count: tiles.length};
}

// Move one random hand tile back to the pool. No-op count 0 on an empty hand.
function discard(G, seat, random) {
    const hand = handTiles(G, seat);
    if (hand.length === 0) return {seat, count: 0, tiles: []};
    const id = hand[Math.floor(random.Number() * hand.length)];
    delete G.tilePositions[id];
    G.tilesPool.push(Number(id));
    return {seat, count: 1, tiles: [Number(id)]};
}

// Dump the whole hand to the pool and redraw the same count: keeps hand size but
// churns the tiles. The redraw can pull back some of what was just dumped — fine.
function reshuffle(G, ctx, seat) {
    const hand = handTiles(G, seat);
    const count = hand.length;
    for (const id of hand) {
        delete G.tilePositions[id];
        G.tilesPool.push(Number(id));
    }
    popToHand(G, ctx, seat, count);
    return {seat, count};
}

function playerAction(G, ctx, seat, random) {
    const r = random.Number();
    if (r < ACTION_DRAW) return ['draw', draw(G, ctx, seat, random)];
    if (r < ACTION_DISCARD) return ['discard', discard(G, seat, random)];
    return ['reshuffle', reshuffle(G, ctx, seat)];
}

// Add-set: pop ~3 normal tiles from the pool onto the next free board row. Jokers
// are skipped on the way out so the Wheel never plants a joker set.
function addSet(G, ctx) {
    const tiles = [];
    while (tiles.length < ADD_SET_SIZE && G.tilesPool.length) {
        const tile = G.tilesPool.pop();
        if (tile == null) break;
        if (isJoker(Number(tile))) continue;
        tiles.push(tile);
    }
    pushTilesToGrid(tiles, BOARD_ROWS, BOARD_COLS, G, {gridId: BOARD_GRID_ID, playerID: null}, ctx);
    return {count: tiles.length, tiles: tiles.map(Number)};
}

// Remove-set: scatter one board run back to the pool. Joker runs are skipped —
// jokers are SP4's bomb, the Wheel never touches a joker set. No-op if none.
function removeSet(G, random) {
    const runs = extractSeqs(G).filter(run => !run.some(id => isJoker(Number(id))));
    if (runs.length === 0) return {count: 0, tiles: []};
    const run = runs[Math.floor(random.Number() * runs.length)];
    for (const id of run) {
        delete G.tilePositions[id];
        G.tilesPool.push(Number(id));
    }
    return {count: run.length, tiles: run.map(Number)};
}

function tableAction(G, random) {
    if (random.Number() < TABLE_ADD) return ['add-set', addSet(G, {})];
    return ['remove-set', removeSet(G, random)];
}

// One Wheel spin. Pure: mutates G, returns + stores result. Classic = no-op/null.
function spinWheel({G, ctx, random}) {
    if (G.mode !== 'chaos') return null;

    const objRoll = random.Number();
    let result;
    if (objRoll < OBJECT_PLAYER) {
        const [action, detail] = playerAction(G, ctx, ctx.currentPlayer, random);
        result = {object: 'player', action, detail};
    } else if (objRoll < OBJECT_TABLE) {
        const [action, detail] = tableAction(G, random);
        result = {object: 'table', action, detail};
    } else {
        const r = random.Number();
        const action = r < ACTION_DRAW ? 'draw' : r < ACTION_DISCARD ? 'discard' : 'reshuffle';
        const seats = [];
        for (let i = 0; i < (ctx.numPlayers || 1); i++) seats.push(String(i));
        const detail = {seats: seats.map(seat => {
            if (action === 'draw') return draw(G, ctx, seat, random);
            if (action === 'discard') return discard(G, seat, random);
            return reshuffle(G, ctx, seat);
        })};
        result = {object: 'all', action, detail};
    }

    G.lastWheel = result;
    return result;
}

export {spinWheel};
