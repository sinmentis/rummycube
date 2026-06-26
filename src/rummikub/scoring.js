import flatten from "lodash/flatten.js";
import {getTileValue, isJoker} from "./tile/codec.js";

function countPoints(hands, winnerIndex) {
    let points = {}
    let winnerPoints = 0
    for (let i = 0; i < hands.length; i++) {
        let playerPoints = 0
        if (i !== winnerIndex) {
            let hand = hands[i]
            let flattened = flatten(hand)
            for (let tile of flattened) {
                if (tile) {
                    let tilePoint = isJoker(tile) ? 30 : getTileValue(tile)
                    playerPoints += tilePoint
                }
            }
            points[i] = playerPoints * -1
            winnerPoints += playerPoints
        }
    }
    points[winnerIndex] = winnerPoints
    return points
}

function findWinner(hands) {
    let winner_points = 1000
    let winner = 0

    for (let i = 0; i < hands.length; i++) {
        let points = 0
        let hand = hands[i]
        let flattened = flatten(hand)
        for (let tile of flattened) {
            if (tile) {
                let tilePoint = isJoker(tile) ? 30 : getTileValue(tile)
                points += tilePoint
            }
        }
        if (points < winner_points) {
            winner_points = points
            winner = i
        }
    }
    return winner
}

export {
    countPoints,
    findWinner,
}
