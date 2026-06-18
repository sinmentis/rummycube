import React, {useState, useCallback, useRef, useEffect} from "react";
import './board.css';
import '../theme/classic.css';
import GridContainer from "./GridContainer";
import {DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors} from '@dnd-kit/core'
import {parseSlotId} from "../dndUtil";
import {TilePreview} from "./Tile";
import {
    HAND_GRID_ID, BOARD_GRID_ID, BOARD_ROWS, BOARD_COLS, HAND_ROWS, HAND_COLS
} from "../constants";
import Sidebar from "./Sidebar";
import {extractSeqs, isBoardHasNewTiles, isBoardValid, isSubmitAccepted} from "../moveValidation";
import {buildGridsFromTilePositions, getSecTs, isSequenceValid, getTileValue, isJoker} from "../util";
import GameOverModal from "./GameOverModal";
import {handleTileSelection, handleLongPress} from "../boardUtil";
import {play, place, milestone, buzz} from "../sound/sfx";
import * as fx from "../juice/effects";
import {countPlacedThisTurn, submitComboCount} from "../juice/comboMath";
import ComboOverlay from "./ComboOverlay";
import _ from "lodash";

const RummikubBoard = function ({G, ctx, moves, playerID, matchData, matchID, events}) {
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
    useEffect(() => { setCombo(0); }, [ctx.turn, ctx.gameover]);
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
        let seqs = extractSeqs(G)
        let _validTiles = []
        for (const seq of seqs) {
            if (isSequenceValid(seq)) {
                for (const tile of seq) {
                    _validTiles.push(tile)
                }
            }
        }
        setValidTiles(_validTiles)
        setShowInvalidTiles(true)
        // Mirror the server's accept/reject decision (validatePlayerMove) so the
        // combo only celebrates a submit the server will actually keep. An invalid
        // board is reverted + penalised server-side, so it earns no combo.
        const placed = countPlacedThisTurn(G.tilePositions, BOARD_GRID_ID);
        const accepted = isSubmitAccepted(G, ctx);
        const n = submitComboCount(accepted, placed);
        const cx = window.innerWidth / 2, cy = window.innerHeight * 0.4;
        let delay = 600;
        if (n > 0) {
            const pts = Object.values(G.tilePositions)
                .filter(p => p && p.gridId === BOARD_GRID_ID && p.tmp)
                .reduce((s, p) => s + (isJoker(p.id) ? 0 : getTileValue(p.id)), 0);
            setCombo(n);
            place(n);
            fx.burstAt(cx, cy, n);
            fx.kick(n);
            if (n >= 3) { fx.flash('combo'); milestone(); }
            fx.floatText('+' + pts, cx, cy);
            play('win');
            delay = 1400; // let the combo celebration breathe before the turn flips
        } else if (placed > 0) {
            fx.flash('bad');
            fx.kick(6);
            buzz();
        }
        setTimeout(() => {
            setShowInvalidTiles(false)
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

    const sidebar = (
        <Sidebar
            currentPlayer={ctx.currentPlayer}
            playerID={playerID}
            matchData={matchData || []}
            matchID={matchID}
            gameover={ctx.gameover}
            timePerTurn={G.timePerTurn}
            timerExpireAt={G.timerExpireAt}
            onTimeout={onTurnTimeout}
            hands={hands}
            tilesOnPool={G.tilesPool.length}
        />
    )

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
                <ComboOverlay combo={combo}/>
                {boardGrid}
                <div className={'hand-buttons'}>
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
                        ? state.selectedTiles.map(id => <TilePreview key={id} tile={id}/>)
                        : <TilePreview tile={activeTile}/>}
                </div>
            ) : null}
        </DragOverlay>
    </DndContext>
}

export default RummikubBoard