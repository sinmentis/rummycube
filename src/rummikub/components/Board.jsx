import React, {useState, useCallback, useRef, useEffect} from "react";
import './board.css';
import '../theme/classic.css';
import GridContainer from "./GridContainer";
import {DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors} from '@dnd-kit/core'
import {parseSlotId, orderTilesBySource} from "../dndUtil";
import {TilePreview} from "./Tile";
import {
    HAND_GRID_ID, BOARD_GRID_ID, BOARD_ROWS, BOARD_COLS, HAND_ROWS, HAND_COLS
} from "../constants";
import Sidebar from "./Sidebar";
import TableSeats from "./TableSeats";
import PlayerAvatarWithTimer from "./PlayerAvatar";
import {useTurnTimer} from "../hooks/useTurnTimer";
import {extractSeqs, isBoardHasNewTiles, isBoardValid, isSubmitAccepted} from "../moveValidation";
import {buildGridsFromTilePositions, getSecTs, isSequenceValid, count2dArrItems} from "../util";
import GameOverModal from "./GameOverModal";
import {handleTileSelection, handleLongPress} from "../boardUtil";
import {play, place, milestone, buzz} from "../sound/sfx";
import * as fx from "../juice/effects";
import {countPlacedThisTurn} from "../juice/comboMath";
import ComboOverlay from "./ComboOverlay";
import ChatPanel from "./ChatPanel";
import _ from "lodash";

const RummikubBoard = function ({G, ctx, moves, playerID, matchData, matchID, events, chatMessages, sendChatMessage}) {
    console.log('RENDER BOARD')
    const [recentlyDrawnTiles, setRecentlyDrawnTiles] = useState([]);

    useEffect(() => {
        if (playerID === '0' && ctx.phase === 'playersJoin' && _.every(matchData, (item) => item.name)) {
            console.log('ALL PLAYERS JOINED', new Date())
            events.endPhase()
        }
    }, [matchData])

    useEffect(() => {
        if (G.recentlyDrawnTiles?.length) {
            setRecentlyDrawnTiles(G.recentlyDrawnTiles);
            play('draw');

            const timeout = setTimeout(() => {
                setRecentlyDrawnTiles([]);
                moves.clearRecentlyDrawnTiles({G, ctx});
            }, 800);

            return () => clearTimeout(timeout);
        }
    }, [G.recentlyDrawnTiles]);

    const [state, setState] = useState({selectedTiles: [], lastSelectedTileId: null})

    const [activeTile, setActiveTile] = useState(null);
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);
    const sensors = useSensors(
        useSensor(MouseSensor, {activationConstraint: {distance: 6}}),
        useSensor(TouchSensor, {activationConstraint: {distance: 6}}),
    );
    const [combo, setCombo] = useState(0);
    const [comboBy, setComboBy] = useState('');
    const comboTimer = useRef(null);
    const seenPlayRef = useRef(undefined);
    // Everyone celebrates a valid submit: the server records it in G.lastPlay and
    // every client (not just the scorer) fires the combo/spotlight off its ts.
    useEffect(() => {
        const lp = G.lastPlay;
        const ts = lp && lp.ts ? lp.ts : null;
        if (seenPlayRef.current === undefined) { seenPlayRef.current = ts; return; } // ignore the one present at mount/reconnect
        if (ts === null || ts === seenPlayRef.current) return;
        seenPlayRef.current = ts;
        const n = lp.count || 0;
        const by = (matchData && matchData[lp.seat] && matchData[lp.seat].name) || `Player ${Number(lp.seat) + 1}`;
        const cx = window.innerWidth / 2, cy = window.innerHeight * 0.4;
        setCombo(n);
        setComboBy(by);
        if (lp.groups && lp.groups.length) fx.celebrateGroups(lp.groups);
        place(n);
        fx.burstAt(cx, cy, n);
        fx.kick(n);
        if (n >= 3) { fx.flash('combo'); milestone(); }
        fx.floatText('+' + (lp.points || 0), cx, cy);
        play('win');
        clearTimeout(comboTimer.current);
        comboTimer.current = setTimeout(() => { setCombo(0); setComboBy(''); }, 1800);
    }, [G.lastPlay ? G.lastPlay.ts : null]);
    const onDragStart = useCallback((e) => {
        const id = e.active.id;
        setActiveTile(id);
        setState(prev => prev.selectedTiles.includes(id) ? prev : {selectedTiles: [id], lastSelectedTileId: id});
    }, []);
    const onDragEnd = useCallback((e) => {
        setActiveTile(null);
        if (!e.over) return;
        const {gridId, col, row} = parseSlotId(String(e.over.id));
        const id = e.active.id;
        moves.moveTiles(col, row, gridId, {id}, stateRef.current.selectedTiles);
        play('place');
        setState({selectedTiles: [], lastSelectedTileId: null});
    }, [moves]);
    const [showInvalidTiles, setShowInvalidTiles] = useState(false);
    const [validTiles, setValidTiles] = useState([])
    const [hoverPosition, setHoverPosition] = useState({})
    let longPressTimeoutId = useRef(null)

    const moveTilesUseCb = useCallback((col, row, destGridId, tileIdObj, selectedTiles) => {
        moves.moveTiles(col, row, destGridId, tileIdObj, selectedTiles)
    }, [moves])
    const handleTileSelectionCb = useCallback((tileId, shiftKey, ctrlKey) => {
        console.log(state)
        handleTileSelection(G, state, setState, playerID, tileId, shiftKey, ctrlKey)
    }, [G, playerID, state])
    const handleLongPressCb = useCallback((tileId, timeout) => {
        handleLongPress(G, playerID, setState, longPressTimeoutId, tileId, timeout)
    }, [G, playerID, longPressTimeoutId])

    const onTileDragEnd = useCallback(() => {
        setState({selectedTiles: [], lastSelectedTileId: null})
    }, [])

    const onLongPressMouseUp = useCallback(() => {
        console.debug('LONG PRESS MOUSE UP REGISTERED')
        if (longPressTimeoutId.current) {
            clearTimeout(longPressTimeoutId.current)
        }
    }, [longPressTimeoutId])

    function onBoardClick(e) {
        const classList = e.target.className?.split?.(' ') || [];
        const isTileClick = classList.includes('tile') || classList.includes('tile-text');

        if (!isTileClick) {
            setState(prev => {
                if (prev.selectedTiles.length === 0 && prev.lastSelectedTileId === null) {
                    return prev; // no state change, avoid re-render
                }
                return {selectedTiles: [], lastSelectedTileId: null};
            });
        }
    }

    function onOrderByColorClicked(e) {
        moves.orderByColorVal();
    }

    function drawTile(e) {
        moves.drawTile(!isBoardValid(G))
    }

    function onOrderByValColor(e) {
        moves.orderByValColor()
    }

    function endTurn(e) {
        const placed = countPlacedThisTurn(G.tilePositions, BOARD_GRID_ID);
        const accepted = isSubmitAccepted(G, ctx);
        let delay = 150;
        if (!accepted && placed > 0) {
            // Local feedback for a rejected submit: green = tiles already in a valid
            // run/set, red = the rest, so you can see what to fix. (A valid submit's
            // celebration comes from G.lastPlay so everyone sees it.)
            const validNow = extractSeqs(G).filter(seq => isSequenceValid(seq)).flat();
            setValidTiles(validNow);
            setShowInvalidTiles(true);
            fx.flash('bad');
            fx.kick(6);
            buzz();
            delay = 600;
        }
        setTimeout(() => {
            setShowInvalidTiles(false)
            setValidTiles([])
            moves.endTurn()
        }, delay)
    }

    // Any connected client fires this when the server-set deadline passes. The
    // forceEndTurn move is rejected server-side until the real deadline, so a
    // player cannot extend their own turn by suppressing their local timer — an
    // honest opponent's client ends it.
    const onTurnTimeout = useCallback(() => {
        if (ctx.gameover) return
        moves.forceEndTurn()
    }, [moves, ctx.gameover])


    // Live cue on the End button: green when the current board would be accepted
    // as a submit, red when it would be rejected. Only while it's your move and
    // you have placed something (otherwise the button stays neutral).
    const endHasPending = ctx.currentPlayer === playerID && !ctx.gameover && isBoardHasNewTiles(G);
    const endStateClass = endHasPending ? (isSubmitAccepted(G, ctx) ? ' end-valid' : ' end-invalid') : '';
    const endBut = (<button disabled={!(ctx.currentPlayer === playerID) || ctx.gameover}
                            className={'rummikub-button' + endStateClass}
                            onClick={() => {
                                endTurn()
                            }}>End
    </button>)

    const drawBut = (<button
        disabled={!(ctx.currentPlayer === playerID && G.tilesPool.length) || ctx.gameover || ctx.phase === 'playersJoin'}
        title={'Take a tile and skip the turn'}
        className={'rummikub-button'}
        onClick={() => {
            drawTile()
        }}>Draw
    </button>)
    const undoBut = (<button disabled={!G.gameStateStack.length || ctx.gameover || ctx.currentPlayer !== playerID}
                             className={'rummikub-button'}
                             title={'Undo last action'}
                             onClick={() => {
                                 moves.undo()
                             }}>Undo
    </button>)

    const redoBut = (<button disabled={!G.redoMoveStack.length || ctx.gameover || ctx.currentPlayer !== playerID}
                             className={'rummikub-button'}
                             title={'Redo last action'}
                             onClick={() => {
                                 moves.redo()
                             }}>Redo
    </button>)
    const {board, hands} = buildGridsFromTilePositions(G.tilePositions, ctx.numPlayers)

    const boardGrid = (<div className="ref">
        <GridContainer
            rows={BOARD_ROWS}
            cols={BOARD_COLS}
            tiles2dArray={board}
            gridId={BOARD_GRID_ID}
            canDnD={ctx.currentPlayer === playerID}
            moveTiles={moveTilesUseCb}
            highlightTiles={showInvalidTiles}
            validTiles={validTiles}
            selectedTiles={state.selectedTiles}
            onTileDragEnd={onTileDragEnd}
            handleTileSelection={handleTileSelectionCb}
            handleLongPress={handleLongPressCb}
            onLongPressMouseUp={onLongPressMouseUp}
            hoverPosition={hoverPosition}
            setHoverPosition={setHoverPosition}
            newlyAdded={[]}
        /></div>)

    const handGrid = (
        <GridContainer rows={HAND_ROWS}
                       cols={HAND_COLS}
                       tiles2dArray={hands[playerID]}
                       gridId={HAND_GRID_ID}
                       canDnD={true}
                       highlightTiles={false}
                       moveTiles={moveTilesUseCb}
                       selectedTiles={state.selectedTiles}
                       onTileDragEnd={onTileDragEnd}
                       handleTileSelection={handleTileSelectionCb}
                       handleLongPress={handleLongPressCb}
                       onLongPressMouseUp={onLongPressMouseUp}
                       hoverPosition={hoverPosition}
                       setHoverPosition={setHoverPosition}
                       newlyAdded={recentlyDrawnTiles}
        />)

    const allJoined = (matchData || []).length && _.every(matchData, (item) => item.name)
    const showTurnTimer = (matchData || []).length && !ctx.gameover && allJoined
    const timeLeft = useTurnTimer({
        timerExpireAt: showTurnTimer ? G.timerExpireAt : null,
        timePerTurn: G.timePerTurn,
        onTimeout: onTurnTimeout,
        isActivePlayer: playerID === ctx.currentPlayer,
    })
    const sidebar = (
        <Sidebar
            matchData={matchData || []}
            matchID={matchID}
            gameover={ctx.gameover}
            allJoined={allJoined}
            tilesOnPool={G.tilesPool.length}
        />
    )

    const tableSeats = (
        <TableSeats
            currentPlayer={ctx.currentPlayer}
            playerID={playerID}
            matchData={matchData || []}
            matchID={matchID}
            hands={hands}
            timeLeft={timeLeft}
            timePerTurn={G.timePerTurn}
            showTurnTimer={showTurnTimer}
        />
    )

    const selfData = (matchData || [])[Number(playerID)]
    const selfAvatar = selfData && selfData.name ? (
        <div className="rack-self">
            <PlayerAvatarWithTimer isActive={ctx.currentPlayer === playerID}
                                   name={selfData.name}
                                   matchId={matchID}
                                   seatId={Number(playerID)}
                                   tiles={count2dArrItems(hands[playerID])}
                                   isConnected={selfData.isConnected}
                                   timeLeft={timeLeft}
                                   totalTime={G.timePerTurn}
                                   showTurnTimer={showTurnTimer}/>
        </div>
    ) : null

    // todo finish and check
    let drawOrEnd
    if (G.tilesPool.length > 0 && !isBoardHasNewTiles(G)) {
        drawOrEnd = drawBut
    } else {
        drawOrEnd = endBut
    }

    return <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>

        <div className={'container-float board-container'}>
            {ctx.gameover &&
                <GameOverModal
                    gameover={ctx.gameover}
                    matchId={matchID}
                    playerID={playerID}
                    matchData={matchData}
                />}

            {sidebar}
            <div className="board" onClick={onBoardClick}>
                <ComboOverlay combo={combo} by={comboBy}/>
                {tableSeats}
                {boardGrid}
                <div className={'hand-buttons'}>
                    {selfAvatar}
                    {handGrid}
                    <div className="controls-wrapper">
                        <button disabled={ctx.gameover}
                                title={'Order by runs'}
                                className={'rummikub-button'} onClick={() => {
                            onOrderByColorClicked()
                        }}>Sort: runs
                        </button>
                        <button disabled={ctx.gameover}
                                title={'Order by sets'}
                                className={'rummikub-button'} onClick={() => {
                            onOrderByValColor()
                        }}>Sort: colours
                        </button>
                        {drawOrEnd}
                        {undoBut}
                        {redoBut}
                    </div>
                </div>
            </div>
        </div>
        <DragOverlay dropAnimation={null}>
            {activeTile ? (
                <div className="tile-lift" style={{display: 'flex', gap: '2px'}}>
                    {state.selectedTiles.includes(activeTile)
                        ? orderTilesBySource(state.selectedTiles, G.tilePositions).map(id => <TilePreview key={id} tile={id}/>)
                        : <TilePreview tile={activeTile}/>}
                </div>
            ) : null}
        </DragOverlay>
        <ChatPanel chatMessages={chatMessages}
                   sendChatMessage={sendChatMessage}
                   matchData={matchData}
                   matchID={matchID}
                   playerID={playerID}/>
    </DndContext>
}

export default RummikubBoard