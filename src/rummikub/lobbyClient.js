import {LobbyClient} from 'boardgame.io/client';
import {GAME_NAME, LOBBY_SERVER_HOST, LOBBY_SERVER_PORT, LOBBY_SERVER_PROTO} from "./constants.js";

class GameLobbyClient {
    constructor() {
        this.client = new LobbyClient({server: `${LOBBY_SERVER_PROTO}://${LOBBY_SERVER_HOST}:${LOBBY_SERVER_PORT}`});
    }

    async createGame(playersCount, timePerTurn, chaos = false) {
        const result = await this.client.createMatch(GAME_NAME, {
            numPlayers: parseInt(playersCount),
            setupData: {timePerTurn: parseInt(timePerTurn), chaos: !!chaos},
            unlisted: true,
        });
        return result.matchID
    }

    async joinGame(matchID, username, seat) {
        if (seat === undefined) {
            seat = 0
        }
        const result = await this.client.joinMatch(GAME_NAME, matchID, {
            playerID: seat.toString(),
            playerName: username
        })
        return result.playerCredentials
    }

    async listSeats(matchID) {
        return await this.client.getMatch(GAME_NAME, matchID)
    }

    async getStats() {
        const base = `${LOBBY_SERVER_PROTO}://${LOBBY_SERVER_HOST}:${LOBBY_SERVER_PORT}`
        const res = await fetch(`${base}/api/stats`)
        if (!res.ok) throw new Error('stats unavailable')
        return await res.json()
    }

    async playAgain(matchId, playerMetaData) {
        return await this.client.playAgain(GAME_NAME, matchId, {...playerMetaData, unlisted: true})
    }
}

export default GameLobbyClient