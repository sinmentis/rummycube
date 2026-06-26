import invert from "lodash/invert.js";
import range from "lodash/range.js";
import {COLOR, COLORS} from "../constants.js";

function buildTileObj(value, color, variant) {
    let tile = variant
    tile = tile << 2
    tile += color
    tile = tile << 4
    tile += value
    return tile
}

function deactivateTileVariant(tile) {
    const variantMask = ~(0b11 << 6);
    return tile & variantMask;
}

function getTileValue(tile) {
    return tile & 0xf
}

function getTileColor(tile) {
    return (tile >> 4) & 0x3
}

function getTileReadableName(tile) {
    return `${invert(COLOR)[getTileColor(tile)]}::${getTileValue(tile)}`
}

function setTileValue(tile, value) {
    const colorAndIdMask = 0b1111110000;
    const colorAndId = tile & colorAndIdMask;
    return colorAndId | value;
}

function setTileColor(tile, color) {
    const idAndValueMask = 0b111111;
    const idAndValue = tile & idAndValueMask;
    const newColor = color << 4;
    return idAndValue | newColor;
}


const RedJoker = buildTileObj(14, COLOR.red, 0)
const BlackJoker = buildTileObj(14, COLOR.black, 0)

function getTiles() {
    let tiles = []
    const Values = range(1, 14)

    for (let variant = 0; variant < 2; variant++) {
        for (const col of COLORS) {
            for (const val of Values) {
                let tile = buildTileObj(val, COLOR[col], variant)
                tiles.push(tile)
            }
        }
    }
    tiles.push(RedJoker)
    tiles.push(BlackJoker)
    return tiles
}

function isJoker(tile) {
    if (getTileValue(tile) === 14) {
        return true
    } else {
        return false
    }
}

export {
    buildTileObj,
    deactivateTileVariant,
    getTileValue,
    getTileColor,
    getTileReadableName,
    setTileValue,
    setTileColor,
    getTiles,
    isJoker,
    RedJoker,
    BlackJoker,
}
