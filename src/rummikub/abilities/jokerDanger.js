// Joker danger readout (chaos mode). Pure logic: no boardgame.io, no DOM. Maps a
// board joker's current heat to the next-poke boom odds plus a UI level/face/note.
// prob uses fuseProb(heat+1): the chance the next membership change boots the run.
import {fuseProb} from './jokerBomb.js';

const FACES = {low: '😄', med: '😠', high: '😡'};
const NOTES = {
    low: 'Freshly seeded · safe to build on.',
    med: 'Poked a few times · getting risky.',
    high: 'Hot — likely to scatter if disturbed.',
};

function jokerDanger(heat) {
    const prob = Math.round(fuseProb(heat + 1) * 100) / 100;
    const level = prob <= 0.20 ? 'low' : prob <= 0.50 ? 'med' : 'high';
    return {prob, level, face: FACES[level], note: NOTES[level]};
}

export {jokerDanger};
