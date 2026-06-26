import uniqBy from "lodash/uniqBy.js";
import orderBy from "lodash/orderBy.js";
import find from "lodash/find.js";
import {getTileColor, getTileValue, setTileValue, isJoker} from "./codec.js";

function isSameColor(tiles) {
    let colors = []
    for (let tile of tiles) {
        if (!isJoker(tile)) {
            colors.push(getTileColor(tile))
        }
    }
    let uniques = uniqBy(colors)
    return uniques.length > 1 ? false : true
}

function isDiffColor(tiles) {
    let colors = []
    let length = tiles.length
    for (let tile of tiles) {
        if (!isJoker(tile)) {
            colors.push(getTileColor(tile))
        } else {
            length--
        }
    }
    let uniques = uniqBy(colors)
    return uniques.length === length ? true : false
}

function isSameValue(tiles) {
    let values = []
    for (let tile of tiles) {
        if (!isJoker(tile)) {
            values.push(getTileValue(tile))
        }
    }
    let uniques = uniqBy(values)
    return uniques.length > 1 ? false : true
}


function extractJoker(tiles) {
    let sorted = orderBy(tiles, [(tile) => getTileValue(tile)], ['asc'])
    if (isJoker(sorted[0])) {
        return sorted.slice(1)
    }
    return sorted
}

function freezeJokerProp(joker, props) {
    return {...joker, ...props}
}

function freezeJokersInRun(tiles) {
    console.debug('call', tiles)

    let freezed = [];
    let left_index = 0;
    let twoJokersNear = false
    for (let right_index = 1; right_index < tiles.length; right_index++) {
        console.debug(right_index)
        let current_tile = tiles[left_index]
        let next_tile = tiles[right_index]
        console.debug(current_tile, next_tile)
        if (isJoker(current_tile) && isJoker(next_tile)) {
            twoJokersNear = true
            if (right_index === tiles.length - 1) {
                let copy = setTileValue(current_tile, getTileValue(tiles[left_index - 1]) + 1)
                if (getTileValue(copy) === 14) {
                    return null
                }
                freezed.push(copy)
                freezed.push(next_tile)
                left_index++
                continue
            }
            freezed.push(current_tile)
            left_index++
            continue
        } else if (isJoker(current_tile) && !isJoker(next_tile)) {
            console.debug('curr is joker; next is not')
            let copy = setTileValue(current_tile, getTileValue(next_tile) - 1)
            console.debug(getTileValue(copy))
            if (getTileValue(copy) === 0) { // computed value will be zero only if -> [...J 1...]
                let tile_after_next = tiles[right_index + 1]
                if (left_index === 0 || tile_after_next) {
                    return null
                } else {
                    copy = setTileValue(copy, 13)
                }
            }
            freezed.push(copy)
            console.debug('after push', freezed)
            if (right_index === tiles.length - 1) {
                freezed.push(next_tile)
            }
            left_index++
            continue
        } else if (!isJoker(current_tile) && isJoker(next_tile)) {
            freezed.push(current_tile)
            if (right_index === tiles.length - 1) {
                let copy = setTileValue(next_tile, getTileValue(current_tile) + 1 === 14 ? 1 : getTileValue(current_tile) + 1)
                if (getTileValue(copy) === 2 && right_index !== 1) {
                    return null
                }
                freezed.push(copy)
            }
            left_index++
            continue
        } else {
            freezed.push(current_tile)
            if (right_index === tiles.length - 1) {
                freezed.push(next_tile)
            }
            left_index++
            continue
        }
    }
    if (twoJokersNear) {
        freezed = freezeJokersInRun(freezed)
        if (freezed === null) return null
    }
    console.assert(freezed.length === tiles.length)
    freezed.forEach((tile) => console.debug(getTileValue(tile)))
    return freezed
}

function freezeJokersInGroup(tiles) {
    let freezed = []
    let simpleTile = find(tiles, (tile) => !isJoker(tile))
    for (let tile of tiles) {
        let copy = setTileValue(tile, getTileValue(simpleTile))
        freezed.push(copy)
    }
    return freezed
}


// Freeze the jokers of a single, already-valid board sequence to their
// REPRESENTED tiles (value set; run jokers keep the run's value progression,
// group jokers take the group's common value). Auto-detects run vs group the
// same way countSeqScore does. Returns the frozen tiles in the original order,
// the untouched array if there are no jokers, or null if the sequence is not a
// recognisable run/group.
function freezeSeqJokers(tiles) {
    if (!tiles.some((tile) => isJoker(tile))) {
        return tiles
    }
    if (isSameColor(tiles)) {
        return freezeJokersInRun(tiles)
    }
    if (isDiffColor(tiles) && isSameValue(tiles)) {
        return freezeJokersInGroup(tiles)
    }
    return null
}

function countSeqScore(tiles) {
    let score = 0
    if (tiles.length < 3) {
        return 0
    }
    let jokersCount = 0
    for (let tile of tiles) {
        if (isJoker(tile)) {
            jokersCount++
        }
    }

    if (isSameColor(tiles)) {
        let freezed = jokersCount ? freezeJokersInRun(tiles) : tiles
        if (!freezed) {
            return 0
        }
        let left = 0
        let oneAfterThirteen = false
        for (let right = 1; right < freezed.length; right++) {
            if (oneAfterThirteen) {
                return 0
            }
            let curr = freezed[left]
            let next = freezed[right]
            if (getTileValue(next) - getTileValue(curr) === 1) {
                score += getTileValue(curr)
                if (right === tiles.length - 1) {
                    score += getTileValue(next)
                }
            } else if (getTileValue(curr) === 13 && getTileValue(next) === 1) {
                oneAfterThirteen = true
                score += getTileValue(curr)
                if (right === tiles.length - 1) {
                    score += getTileValue(next)
                }
            } else {
                return 0
            }
            left++
        }
        return score
    }

    if (isDiffColor(tiles) && isSameValue(tiles)) {
        let freezed = tiles
        if (jokersCount) {
            if (tiles.length > 4) {
                return 0
            } else {
                freezed = freezeJokersInGroup(tiles)
            }
        }
        score = getTileValue(freezed[0]) * freezed.length
    } else {
        return 0
    }

    return score
}

function isSequenceValid(tiles) {
    // console.debug('IS SEQ VALID:', tiles.forEach(tile => getTileValue(tile)))
    return countSeqScore(tiles) > 0
}

function tryOrderTiles(tiles) {
    try {
        if (isSequenceValid(tiles)) {
            return tiles
        } else {
            let sorted = orderBy(tiles, [
                (tile) => getTileColor(tile),
                (tile) => getTileValue(tile),
            ], ['asc'])
            if (isSequenceValid(sorted)) {
                return sorted
            }
            sorted = orderBy(tiles, [
                (tile) => getTileValue(tile),
                (tile) => getTileColor(tile),
            ], ['asc'])
            if (isSequenceValid(sorted)) {
                return sorted
            }
        }
    } catch (error) {
        console.debug('Could not find combination within given tiles')
    }
    return tiles
}

function groupValidSequences(tiles) {
    if (!tiles || tiles.length < 3) {
        return tiles
    }
    let result = []
    let pointer = 0
    let validSeqs = []
    let validTiles = new Set()
    let index = pointer + 3
    while (index <= tiles.length + 1) {
        let validSeqFound = false
        while (true) {
            let slice = tiles.slice(pointer, index)
            if (isSequenceValid(slice)) {
                validSeqFound = true
                slice.forEach((tile) => validTiles.add(tile))
                index++
            } else {
                if (validSeqFound) {
                    validSeqs.push(slice.slice(0, -1))
                    pointer = index - 1
                    index += 3
                    validSeqFound = false
                } else {
                    pointer++
                    index = pointer + 3
                }
                break
            }
            if (index > tiles.length) {
                if (validSeqFound) {
                    validSeqs.push(slice)
                }
                index++
                break
            }
        }
    }
    for (const seq of validSeqs) {
        result.push(...seq)
        result.push(null)
    }
    for (const tile of tiles) {
        if (!validTiles.has(tile)) {
            result.push(tile)
        }
    }
    console.log('REORDER TILES', validSeqs, validTiles)
    return result
}

export {
    isSameColor,
    isDiffColor,
    isSameValue,
    extractJoker,
    freezeJokerProp,
    freezeJokersInRun,
    freezeJokersInGroup,
    freezeSeqJokers,
    countSeqScore,
    isSequenceValid,
    tryOrderTiles,
    groupValidSequences,
}
