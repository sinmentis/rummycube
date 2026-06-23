import React, {useState, useCallback, useRef, useEffect} from "react";
import './board.css';
import '../theme/classic.css';
import GridContainer from "./GridContainer";
import {DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors} from '@dnd-kit/core'
import {parseSlotId, orderTilesBySource, resolveDropSlot, buildRowOccupancy} from "../dndUtil";
import {TilePreview} from "./Tile";
import {
    HAND_GRID_ID, BOARD_GRID_ID, BOARD_ROWS, BOARD_COLS, HAND_ROWS, HAND_COLS
} from "../constants";
import Sidebar from "./Sidebar";
import TableSeats from "./TableSeats";
import PlayerAvatarWithTimer from "./PlayerAvatar";
import TurnDeadlineWatcher from "./TurnDeadlineWatcher";
import {extractSeqs, isBoardHasNewTiles, isBoardValid, isSubmitAccepted, submitRejectReason} from "../moveValidation";
import {submitReasonText} from "../submitReasonText";
import {waitingLabel, isWaitingForPlayers} from "../waitingRoom";
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
    // True between onDragStart and onDragEnd. Threaded down so empty board cells
    // can show the .slot-valid droppable cue while a drag is in flight.
    const [isDragActive, setIsDragActive] = useState(false);
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);
    const gRef = useRef(G);
    useEffect(() => { gRef.current = G; });
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
        setIsDragActive(true);
        setState(prev => prev.selectedTiles.includes(id) ? prev : {selectedTiles: [id], lastSelectedTileId: id});
    }, []);
    const onDragEnd = useCallback((e) => {
        setActiveTile(null);
        setIsDragActive(false);
        if (!e.over) return;
        const {gridId, col, row} = parseSlotId(String(e.over.id));
        const id = e.active.id;
        const selectedTiles = stateRef.current.selectedTiles;
        // Validate/snap the drop before touching the server. Exclude the dragged
        // tile(s) from occupancy so a selection can land where it already sits.
        const selectionLength = selectedTiles.length || 1;
        const excludeIds = selectedTiles.length ? selectedTiles : [id];
        const isOccupied = buildRowOccupancy(gRef.current.tilePositions, gridId, excludeIds, playerID);
        const maxCols = gridId === BOARD_GRID_ID ? BOARD_COLS : HAND_COLS;
        const result = resolveDropSlot({gridId, col, row}, isOccupied, selectionLength, maxCols);
        if (!result.ok) {
            // No legal landing (e.g. a multi-selection onto insufficient space).
            // Reject non-destructively: no server call, light buzz, clear selection.
            buzz();
            setState({selectedTiles: [], lastSelectedTileId: null});
            return;
        }
        moves.moveTiles(result.cols[0], row, gridId, {id}, selectedTiles);
        play('place');
        setState({selectedTiles: [], lastSelectedTileId: null});
    }, [moves, playerID]);
    const [showInvalidTiles, setShowInvalidTiles] = useState(false);
    const [validTiles, setValidTiles] = useState([])
    // Inline English reason for the last rejected submit. Non-destructive: tiles
    // stay on the board; this just tells the player what to fix.
    const [submitReason, setSubmitReason] = useState('')
    const [hoverPosition, setHoverPosition] = useState({})
    let longPressTimeoutId = useRef(null)

    // Clear the inline reason whenever the board changes (a rejected submit is a
    // no-op so tilePositions is unchanged and the message persists; moving or
    // clearing a tile updates it and dismisses the message).
    useEffect(() => { setSubmitReason('') }, [G.tilePositions])

    const moveTilesUseCb = useCallback((col, row, destGridId, tileIdObj, selectedTiles) => {
        moves.moveTiles(col, row, destGridId, tileIdObj, selectedTiles)
    }, [moves])
    const handleTileSelectionCb = useCallback((tileId, shiftKey, ctrlKey) => {
        handleTileSelection(gRef.current, stateRef.current, setState, playerID, tileId, shiftKey, ctrlKey)
    }, [playerID])
    const handleLongPressCb = useCallback((tileId, timeout) => {
        handleLongPress(gRef.current, playerID, setState, longPressTimeoutId, tileId, timeout)
    }, [playerID])

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

    // Pass the turn when there's nothing to submit (e.g. the pool is empty so Draw
    // is unavailable and no tiles are staged). On a clean board the server's
    // endTurn just advances the turn — no rollback, no penalty.
    function endTurn(e) {
        moves.endTurn()
    }

    // Non-destructive manual submit. On accept the server commits the meld (the
    // G.lastPlay celebration fires for everyone). On reject NOTHING destructive
    // runs: the staged tiles stay, the turn does not end, and we surface an inline
    // English reason plus the local green/red tile feedback so the player can fix
    // it. Penalty rollback only ever happens via the timeout (forceEndTurn) or the
    // explicit "Give up turn" (forfeitTurn) paths.
    function onSubmitMeld(e) {
        if (isSubmitAccepted(G, ctx)) {
            setSubmitReason('')
            moves.submitMeld()
            return
        }
        const placed = countPlacedThisTurn(G.tilePositions, BOARD_GRID_ID);
        if (placed > 0) {
            const validNow = extractSeqs(G).filter(seq => isSequenceValid(seq)).flat();
            setValidTiles(validNow);
            setShowInvalidTiles(true);
            fx.flash('bad');
            fx.kick(6);
            buzz();
            setSubmitReason(submitReasonText(submitRejectReason(G, ctx)));
            setTimeout(() => {
                setShowInvalidTiles(false)
                setValidTiles([])
            }, 600)
        }
    }

    // Explicit "Give up turn": confirm, then forfeit (tiles roll back + draw one +
    // end turn). Distinct from a rejected submit, which is a no-op.
    function onForfeitTurn(e) {
        if (window.confirm("Give up your turn? Your tiles go back and you'll draw one.")) {
            setSubmitReason('')
            moves.forfeitTurn()
        }
    }

    // Any connected client fires this when the server-set deadline passes. The
    // forceEndTurn move is rejected server-side until the real deadline, so a
    // player cannot extend their own turn by suppressing their local timer — an
    // honest opponent's client ends it.
    const onTurnTimeout = useCallback(() => {
        if (ctx.gameover) return
        moves.forceEndTurn()
    }, [moves, ctx.gameover])


    // Live cue on the Submit-meld button: green when the current board would be
    // accepted as a submit, red when it would be rejected. Only while it's your
    // move and you have placed something (otherwise the button stays neutral).
    const endHasPending = ctx.currentPlayer === playerID && !ctx.gameover && isBoardHasNewTiles(G);
    const endStateClass = endHasPending ? (isSubmitAccepted(G, ctx) ? ' end-valid' : ' end-invalid') : '';
    const isMyTurn = ctx.currentPlayer === playerID && !ctx.gameover;
    const hasStaged = isBoardHasNewTiles(G);

    // Pre-match gate: while players are still joining, freeze the board+hand (no
    // drag) and disable every turn control. Mirrors the allJoined / endPhase
    // logic without changing it.
    const waiting = isWaitingForPlayers(ctx, matchData);
    // Pass button, used only when there's nothing to submit and no tile to draw.
    const endBut = (<button disabled={!isMyTurn || waiting}
                            className={'rummikub-button'}
                            title={'Pass your turn'}
                            onClick={() => {
                                endTurn()
                            }}>End
    </button>)

    // Non-destructive submit. Disabled until at least one tile is staged.
    const submitBut = (<button disabled={!isMyTurn || !hasStaged || waiting}
                               className={'rummikub-button' + endStateClass}
                               title={'Submit your placed tiles as a meld'}
                               onClick={() => {
                                   onSubmitMeld()
                               }}>Submit meld
    </button>)

    // Explicit forfeit, shown only when you have staged tiles to give back.
    const forfeitBut = (<button disabled={!isMyTurn || !hasStaged || waiting}
                                className={'rummikub-button'}
                                title={'Return your tiles and draw — ends your turn'}
                                onClick={() => {
                                    onForfeitTurn()
                                }}>Give up turn
    </button>)

    const drawBut = (<button
        disabled={!(ctx.currentPlayer === playerID && G.tilesPool.length) || ctx.gameover || waiting || hasStaged}
        title={hasStaged ? 'Clear your placed tiles to draw instead' : 'Take a tile and skip the turn'}
        className={'rummikub-button'}
        onClick={() => {
            drawTile()
        }}>Draw
    </button>)
    const undoBut = (<button disabled={!G.gameStateStack.length || ctx.gameover || ctx.currentPlayer !== playerID || waiting}
                             className={'rummikub-button'}
                             title={'Undo last action'}
                             onClick={() => {
                                 moves.undo()
                             }}>Undo
    </button>)

    const redoBut = (<button disabled={!G.redoMoveStack.length || ctx.gameover || ctx.currentPlayer !== playerID || waiting}
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
            canDnD={!waiting && ctx.currentPlayer === playerID}
            isDragActive={isDragActive}
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
                       canDnD={!waiting}
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
            timerExpireAt={showTurnTimer ? G.timerExpireAt : null}
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
                                   timerExpireAt={showTurnTimer ? G.timerExpireAt : null}
                                   totalTime={G.timePerTurn}
                                   showTurnTimer={showTurnTimer}/>
        </div>
    ) : null

    // Turn controls:
    //  - staged tiles on your turn -> Submit meld (active) + Draw (disabled, with
    //    a tooltip explaining why) + Give up turn.
    //  - your turn, nothing staged, tiles in the pool -> Draw.
    //  - otherwise (e.g. pool empty, nothing staged) -> End, to pass the turn.
    let drawOrEnd
    if (isMyTurn && hasStaged) {
        drawOrEnd = (<>{submitBut}{drawBut}{forfeitBut}</>)
    } else if (G.tilesPool.length > 0 && !hasStaged) {
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
                {waiting &&
                    <div className="waiting-overlay" role="status" aria-live="polite">
                        <div className="waiting-card">
                            <div className="waiting-spinner" aria-hidden="true"/>
                            <div className="waiting-title">Waiting for players</div>
                            <div className="waiting-count">{waitingLabel(matchData)} joined</div>
                        </div>
                    </div>}
                <ComboOverlay combo={combo} by={comboBy}/>
                <TurnDeadlineWatcher
                    timerExpireAt={showTurnTimer ? G.timerExpireAt : null}
                    onTimeout={onTurnTimeout}/>
                {tableSeats}
                {boardGrid}
                <div className={'hand-buttons'}>
                    {selfAvatar}
                    {handGrid}
                    <div className="controls-wrapper">
                        <button disabled={ctx.gameover || waiting}
                                title={'Order by runs'}
                                className={'rummikub-button'} onClick={() => {
                            onOrderByColorClicked()
                        }}>Sort: runs
                        </button>
                        <button disabled={ctx.gameover || waiting}
                                title={'Order by sets'}
                                className={'rummikub-button'} onClick={() => {
                            onOrderByValColor()
                        }}>Sort: colours
                        </button>
                        {drawOrEnd}
                        {undoBut}
                        {redoBut}
                    </div>
                    {submitReason &&
                        <div className="submit-reason" role="alert">{submitReason}</div>}
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