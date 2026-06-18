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
import {extractSeqs, isBoardHasNewTiles, isBoardValid} from "../moveValidation";
import {buildGridsFromTilePositions, getSecTs, isSequenceValid, getTileValue, isJoker} from "../util";
import GameOverModal from "./GameOverModal";
import {handleTileSelection, handleLongPress} from "../boardUtil";
import {play, place, milestone, buzz} from "../sound/sfx";
import * as fx from "../juice/effects";
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
    const comboRef = useRef(0);
    const bumpCombo = useCallback((x, y) => {
        const n = comboRef.current + 1;
        comboRef.current = n;
        setCombo(n);
        place(n);
        fx.burstAt(x, y, n);
        fx.kick(n);
        if (n === 3 || n === 5 || n === 7) { fx.flash('combo'); milestone(); }
    }, []);
    useEffect(() => { comboRef.current = 0; setCombo(0); }, [ctx.turn, ctx.gameover]);
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
        const sourceGrid = G.tilePositions[id] && G.tilePositions[id].gridId;
        moves.moveTiles(col, row, gridId, {id}, stateRef.current.selectedTiles);
        if (gridId === BOARD_GRID_ID && sourceGrid === HAND_GRID_ID && ctx.currentPlayer === playerID) {
            const r = e.over.rect;
            const bx = r ? r.left + r.width / 2 : window.innerWidth / 2;
            const by = r ? r.top + r.height / 2 : window.innerHeight / 2;
            bumpCombo(bx, by);
        } else {
            play('place');
        }
        setState({selectedTiles: [], lastSelectedTileId: null});
    }, [moves, G, ctx.currentPlayer, playerID, bumpCombo]);
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
        const tmp = Object.values(G.tilePositions).filter(p => p && p.gridId === BOARD_GRID_ID && p.tmp);
        const submitValid = isBoardValid(G) && tmp.length > 0;
        const cx = window.innerWidth / 2, cy = window.innerHeight * 0.4;
        if (submitValid) {
            const pts = tmp.reduce((s, p) => s + (isJoker(p.id) ? 0 : getTileValue(p.id)), 0);
            fx.floatText('+' + pts, cx, cy);
            fx.burstAt(cx, cy, 8);
            play('win');
        } else if (tmp.length > 0) {
            fx.flash('bad');
            fx.kick(6);
            buzz();
        }
        setTimeout(() => {
            setShowInvalidTiles(false)
            moves.endTurn()
        }, 600)
    }

    // Any connected client fires this when the server-set deadline passes. The
    // forceEndTurn move is rejected server-side until the real deadline, so a
    // player cannot extend their own turn by suppressing their local timer — an
    // honest opponent's client ends it.
    const onTurnTimeout = useCallback(() => {
        if (ctx.gameover) return
        moves.forceEndTurn()
    }, [moves, ctx.gameover])


    const endBut = (<button disabled={!(ctx.currentPlayer === playerID) || ctx.gameover}
                            className={'rummikub-button'}
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