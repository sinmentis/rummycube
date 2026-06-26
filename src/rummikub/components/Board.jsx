import React, {useState, useCallback, useRef, useEffect, lazy, Suspense} from "react";
import './board.css';
import '../theme/classic.css';
import GridContainer from "./GridContainer";
import {DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors} from '@dnd-kit/core'
import {parseSlotId, orderTilesBySource, resolveDropDispatch} from "../dndUtil";
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
import {turnBannerLabel} from "../turnBanner";
import {buildGridsFromTilePositions, getSecTs, isSequenceValid, count2dArrItems, getPlayerHandTiles} from "../util";
import {copyToClipboard} from "./domUtil";
import {playableTiles} from "../planning";
const GameOverModal = lazy(() => import("./GameOverModal"));
import {handleTileSelection, tilesRightward} from "../boardUtil";
import {play, place, milestone, buzz} from "../sound/sfx";
import * as fx from "../juice/effects";
import {resolveJuice} from "../juice/gating";
import {countPlacedThisTurn} from "../juice/comboMath";
const ComboOverlay = lazy(() => import("./ComboOverlay"));
import ChatPanel from "./ChatPanel";
import CoachCard from "./CoachCard";
import HintsToggle from "./HintsToggle";
import IconButton from "./IconButton";
import TimeoutAnnouncement from "./TimeoutAnnouncement";
import {useUndoRedoHotkeys} from "./useUndoRedoHotkeys";
import {useTilePlacementHotkeys} from "./useTilePlacementHotkeys";
import {usePersistentFlag} from "./hooks/usePersistentFlag";
import {useGiveUpConfirm} from "./hooks/useGiveUpConfirm";
import {seatConnected} from "../seats/seatConnection";
import every from "lodash/every.js";

const RummikubBoard = function ({G, ctx, moves, playerID, matchData, matchID, events, chatMessages, sendChatMessage, isConnected}) {
    const [recentlyDrawnTiles, setRecentlyDrawnTiles] = useState([]);

    // S2-U11 / T7: one-time first-turn coach card. It gates on the server's
    // firstMoveDone (the player's initial meld is still pending) and persists
    // "seen" the moment the player dismisses it, so it shows once per device and
    // never reappears on later turns or matches. It also carries the ring
    // microcopy and the hints pointer that previously lived in a standalone hint.
    const COACH_SEEN_KEY = 'rummycube.coachSeen';
    const [coachSeen, setCoachSeen] = usePersistentFlag(COACH_SEEN_KEY);
    const dismissCoach = useCallback(() => setCoachSeen(true), [setCoachSeen]);

    // Round-5a / T6: surface the room invite inside the waiting card so the host
    // can share the join link without hunting for the top-left Sidebar. Mirrors
    // the Sidebar flow: copy `${origin}/join-match/${matchID}` and flash
    // "Copied!" for 1.5s.
    const [inviteCopied, setInviteCopied] = useState(false);
    const onCopyInvite = useCallback(() => {
        if (!matchID) return;
        copyToClipboard(`${window.location.origin}/join-match/${matchID}`);
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 1500);
    }, [matchID]);

    // T4 (WS-B): the playable-tile assist (rack markers + count pill) is opt-in.
    // Default OFF — only the stored value '1' turns it on — and the choice
    // persists like coachSeen above so it survives reloads and later matches.
    const HINTS_KEY = 'rummycube:hintsOn';
    const [hintsOn, setHintsOn] = usePersistentFlag(HINTS_KEY);
    // T9 (WS-H): the very first off->on flip of the hints toggle pops a one-time,
    // non-blocking tooltip explaining what the highlights mean. A persisted flag
    // keeps it from ever reappearing; a ref (not state) lets toggleHints keep its
    // empty deps and check "seen" synchronously inside the updater.
    const HINTS_TIP_KEY = 'rummycube:hintsTipSeen';
    const hintsTipSeenRef = useRef((() => {
        try {
            return typeof localStorage !== 'undefined' && localStorage.getItem(HINTS_TIP_KEY) === '1';
        } catch (e) {
            return false;
        }
    })());
    const [showHintsTip, setShowHintsTip] = useState(false);
    const toggleHints = useCallback(() => {
        setHintsOn((on) => {
            const next = !on;
            if (next && !hintsTipSeenRef.current) {
                setShowHintsTip(true);
                hintsTipSeenRef.current = true;
                try {
                    localStorage.setItem(HINTS_TIP_KEY, '1');
                } catch (e) { /* private mode / no storage: tip may show again next session */ }
            }
            return next;
        });
    }, [setHintsOn]);
    const dismissHintsTip = useCallback(() => setShowHintsTip(false), []);

    useEffect(() => {
        if (!showHintsTip) return;
        const t = setTimeout(dismissHintsTip, 6000);
        return () => clearTimeout(t);
    }, [showHintsTip]);

    useEffect(() => {
        if (playerID === '0' && ctx.phase === 'playersJoin' && every(matchData, (item) => item.name)) {
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
    // S3-U2: a light, time-boxed "syncing…" cue. The local player triggers it on
    // a move (tile drop / submit); it clears on the next authoritative G update
    // (G.lastPlay below or a tilePositions change) or after a short timeout, so it
    // never lingers and never blocks input.
    const [syncing, setSyncing] = useState(false);
    const syncTimer = useRef(null);
    const markSyncing = useCallback(() => {
        setSyncing(true);
        clearTimeout(syncTimer.current);
        syncTimer.current = setTimeout(() => setSyncing(false), 1200);
    }, []);
    useEffect(() => () => clearTimeout(syncTimer.current), []);
    // Everyone celebrates a valid submit: the server records it in G.lastPlay and
    // every client (not just the scorer) fires the combo/spotlight off its ts.
    useEffect(() => {
        const lp = G.lastPlay;
        const ts = lp && lp.ts ? lp.ts : null;
        if (seenPlayRef.current === undefined) { seenPlayRef.current = ts; return; } // ignore the one present at mount/reconnect
        if (ts === null || ts === seenPlayRef.current) return;
        seenPlayRef.current = ts;
        setSyncing(false);
        const n = lp.count || 0;
        const by = (matchData && matchData[lp.seat] && matchData[lp.seat].name) || `Player ${Number(lp.seat) + 1}`;
        const cx = window.innerWidth / 2, cy = window.innerHeight * 0.4;
        // Scale the celebration to who played + whether we're mid-drag (pure predicate).
        const isDragging = !!activeTile || state.selectedTiles.length > 0;
        const g = resolveJuice({lastPlay: lp, localSeat: playerID, isDragging});
        setCombo(n);
        setComboBy(by);
        if (g.celebrate && lp.groups && lp.groups.length) fx.celebrateGroups(lp.groups);
        if (g.intensity === 'full') place(n);
        // One primary screen effect per play (T9-3): flash on a high manipulation
        // score, otherwise a confetti burst — never both at once.
        if (g.flash && n >= 3) { fx.flash('combo'); if (g.win) milestone(); }
        else if (g.burst) fx.burstAt(cx, cy, n);
        if (g.kick) fx.kick(n);
        fx.floatText('+' + (lp.points || 0), cx, cy);
        if (g.win) play('win');
        clearTimeout(comboTimer.current);
        comboTimer.current = setTimeout(() => { setCombo(0); setComboBy(''); }, 1800);
    }, [G.lastPlay ? G.lastPlay.ts : null]);
    // T7 (WS-B/WS-D): the single drop dispatch shared by drag (onDragEnd) and
    // empty-cell tap (onCellTap). resolveDropDispatch folds joker-swap -> push ->
    // snap -> reject into one pure decision; the client only chooses the path while
    // the server move stays authoritative (a wrong guess snaps back as INVALID_MOVE,
    // not a desync). allowJokerSwap is on, but a retrieve only ever fires on a drag:
    // GridSlot wires onCellTap on EMPTY cells, so a tap target never holds a joker.
    //   target    = {gridId, col, row} (a parseSlotId product)
    //   primaryId = the dragged/primary tile id
    //   selection = the tiles being placed (rack reading order restored downstream)
    const dispatchDrop = useCallback((target, primaryId, selection) => {
        const d = resolveDropDispatch({
            tilePositions: gRef.current.tilePositions,
            target, primaryId, selection,
            playerID, boardCols: BOARD_COLS, handCols: HAND_COLS, allowJokerSwap: true,
        });
        switch (d.kind) {
            case 'joker':
                moves.retrieveJoker(...d.args);
                break;
            case 'push':
                moves.insertTilesWithPush(...d.args);
                break;
            case 'snap':
                moves.moveTiles(...d.args);
                break;
            default:
                // reject: no legal landing / a hopeless push. Non-destructive — a
                // light buzz, no server call, selection cleared.
                buzz();
                setState({selectedTiles: [], lastSelectedTileId: null});
                return;
        }
        markSyncing();
        play('place');
        setState({selectedTiles: [], lastSelectedTileId: null});
    }, [moves, playerID, markSyncing]);
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
        const target = parseSlotId(String(e.over.id));
        const id = e.active.id;
        // A bare single-tile drag carries no selection; normalize to the dragged id
        // so the dispatch always has the tiles being placed.
        const selectedTiles = stateRef.current.selectedTiles;
        const selection = selectedTiles.length ? selectedTiles : [id];
        dispatchDrop(target, id, selection);
    }, [dispatchDrop]);
    const [showInvalidTiles, setShowInvalidTiles] = useState(false);
    const [validTiles, setValidTiles] = useState([])
    // Inline English reason for the last rejected submit. Non-destructive: tiles
    // stay on the board; this just tells the player what to fix.
    const [submitReason, setSubmitReason] = useState('')
    const [hoverPosition, setHoverPosition] = useState({})

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
    // Long-press fired in a Tile: grow the selection rightward one tile per tick.
    // Tile fires onLongPress(tileId, count) every LONG_PRESS_STEP_MS with an
    // incrementing count; we take the first `count` of the tile's rightward run and
    // let the existing distance:6 multi-drag pipeline carry the selection. Ids are
    // normalized to strings to match the rest of the selection code (tile ids reach
    // the UI as object keys, i.e. strings, so includes()/=== checks in onDragStart
    // and the DragOverlay stay type-consistent and never drop a tile). The idempotent
    // guard makes an exhausted tick (count past the run length) a no-op re-render.
    const onLongPressCb = useCallback((tileId, count) => {
        const seq = tilesRightward(gRef.current.tilePositions, tileId).map(String);
        const n = Math.min(count, seq.length);
        setState(prev => {
            const next = seq.slice(0, n);
            if (prev.selectedTiles.length === next.length &&
                prev.selectedTiles.every((id, i) => id === next[i])) return prev;
            return {selectedTiles: next, lastSelectedTileId: String(tileId)};
        });
    }, [])

    const onTileDragEnd = useCallback(() => {
        setState({selectedTiles: [], lastSelectedTileId: null})
    }, [])

    // Tap-to-place (S3-U8): the non-drag placement path. When a selection is live
    // and the player taps an empty droppable cell, route it through the SAME
    // dispatchDrop the drag uses. GridSlot only wires this onto empty cells when
    // canDnD, so turn/phase gating matches the drag cue and the tap target is always
    // empty — joker-swap (drag-only) never fires here. An empty selection is a no-op.
    const onCellTap = useCallback((gridId, col, row) => {
        const selectedTiles = stateRef.current.selectedTiles;
        if (!selectedTiles.length) return;
        dispatchDrop({gridId, col, row}, selectedTiles[0], selectedTiles);
    }, [dispatchDrop])
    // TODO(S3-U8 stretch): keyboard placement — arrow-key a cursor over empty
    // cells and Enter to call onCellTap on the focused cell. Deferred: it needs a
    // focusable cell/roving-tabindex grid + a visible focus ring, which is more
    // than the "only if cheap" bar. The tap path above is the touch on-ramp; the
    // keyboard cursor is a follow-up.

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
            disarm()
            setSubmitReason('')
            moves.submitMeld()
            markSyncing()
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

    // Explicit "Give up turn" is a two-click in-game confirm — see useGiveUpConfirm
    // for the arm/confirm timing, rage-guard, and disarm effects. armGiveUp drives
    // the forfeit button; disarm is also fired by the submit-accept path above and
    // by the staged-board change below.

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
    // Non-color second channel mirroring endStateClass so the submit button's
    // accept/reject state is distinguishable in grayscale.
    const endStateGlyph = endStateClass === ' end-valid' ? '✓ ' : endStateClass === ' end-invalid' ? '✕ ' : '';
    const isMyTurn = ctx.currentPlayer === playerID && !ctx.gameover;
    const hasStaged = isBoardHasNewTiles(G);

    // The two-click give-up state machine (arm/confirm timing, rage-guard, and the
    // disarm-on-turn-change + disarm-on-board-change effects) lives in this hook so
    // it travels as one unit. setSubmitReason is wired through so a confirm clears
    // any pending submit-reject message in the same tick, exactly as before.
    const {giveUpArmed, armGiveUp, disarm} = useGiveUpConfirm({
        moves,
        currentPlayer: ctx.currentPlayer,
        gameover: ctx.gameover,
        tilePositions: G.tilePositions,
        hasStaged,
        setSubmitReason,
    });

    // Pre-match gate: while players are still joining, freeze the board+hand (no
    // drag) and disable every turn control. Mirrors the allJoined / endPhase
    // logic without changing it.
    const waiting = isWaitingForPlayers(ctx, matchData);

    // S3-U2: surface the boardgame.io socket status. Only while an in-play match
    // is live (not gameover, not the join phase) and the prop is explicitly false
    // do we show a non-blocking "Reconnecting…" pill; a brief "Syncing…" pill
    // appears after a local move. Neither blocks input.
    const inPlay = !ctx.gameover && ctx.phase !== 'playersJoin';
    const showReconnecting = inPlay && isConnected === false;
    const showSyncing = inPlay && isConnected !== false && syncing;
    const connectionCue = (showReconnecting || showSyncing) ? (
        <div
            className={'connection-cue ' + (showReconnecting ? 'connection-cue--offline' : 'connection-cue--syncing')}
            role="status"
            aria-live="polite"
        >
            <span className="connection-cue__dot" aria-hidden="true"/>
            {showReconnecting ? 'Reconnecting…' : 'Syncing…'}
        </div>
    ) : null;

    // T3 / WS-A: the all-visible "time's up" toast, fed by the server-authoritative
    // G.lastTimeout transient. Suppressed on gameover so a stale "turn passed"
    // announcement can't linger on the end screen. Self gets a longer dwell.
    const timeoutIsSelf = !!G.lastTimeout && String(G.lastTimeout.seat) === String(playerID);
    const timeoutAnnouncement = !ctx.gameover ? (
        <TimeoutAnnouncement
            lastTimeout={G.lastTimeout}
            playerID={playerID}
            matchData={matchData}
            durationMs={timeoutIsSelf ? 4500 : 3000}
        />
    ) : null;

    // S2-U6 / WS-D: canUndo/canRedo are the single source of truth shared by the
    // keyboard shortcuts (below) and the corner Undo/Redo icon buttons (.rack-tools),
    // so the shortcuts only fire on your turn when there is something to undo/redo.
    // handlers are stable so the listener isn't churned.
    const canUndo = !!G.gameStateStack.length && !ctx.gameover && ctx.currentPlayer === playerID && !waiting;
    const canRedo = !!G.redoMoveStack.length && !ctx.gameover && ctx.currentPlayer === playerID && !waiting;
    const onUndoKey = useCallback(() => moves.undo(), [moves]);
    const onRedoKey = useCallback(() => moves.redo(), [moves]);
    useUndoRedoHotkeys({canUndo, canRedo, onUndo: onUndoKey, onRedo: onRedoKey});

    // Pass button, used only when there's nothing to submit and no tile to draw.
    const endBut = (<button disabled={!isMyTurn || waiting}
                            className={'rummikub-button primary-action'}
                            title={'Pass your turn'}
                            onClick={() => {
                                endTurn()
                            }}>End
    </button>)

    // Non-destructive submit. Disabled until at least one tile is staged.
    const submitBut = (<button disabled={!isMyTurn || !hasStaged || waiting}
                               className={'rummikub-button primary-action' + endStateClass}
                               title={'Submit your placed tiles as a meld'}
                               onClick={() => {
                                   onSubmitMeld()
                               }}>{endStateGlyph}Submit meld
    </button>)

    // Explicit forfeit, shown only when you have staged tiles to give back. Two-click
    // in-game confirm: the armed state swaps to the warning style and confirm label.
    const forfeitBut = (<button disabled={!isMyTurn || !hasStaged || waiting}
                                className={'rummikub-button' + (giveUpArmed ? ' is-arming' : '')}
                                title={'Return your tiles and draw — ends your turn'}
                                onClick={() => {
                                    armGiveUp()
                                }}>{giveUpArmed ? 'Click again to confirm' : 'Give up turn'}
    </button>)

    const drawTitle = hasStaged
        ? 'Clear your placed tiles to draw instead'
        : 'Take a tile and skip the turn'
    const drawBut = (<button
        disabled={!(ctx.currentPlayer === playerID && G.tilesPool.length) || ctx.gameover || waiting || hasStaged}
        title={drawTitle}
        className={'rummikub-button primary-action'}
        onClick={() => {
            drawTile()
        }}>Draw
    </button>)

    // R5b-T6: one-time +15s turn extension. Server-authoritative — moves.extendTurn
    // only ever pushes G.timerExpireAt forward, once per turn, for the current
    // player. Disabled off-turn, while waiting, and once already used this turn.
    const canExtend = isMyTurn && !waiting && !G.turnExtended?.[Number(playerID)]
    const extendBut = (<button disabled={!canExtend}
                               className={'rummikub-button secondary-action'}
                               title={'Add 15 seconds to your turn (once per turn)'}
                               onClick={() => {
                                   moves.extendTurn()
                               }}>+15s
    </button>)
    const {board, hands} = buildGridsFromTilePositions(G.tilePositions, ctx.numPlayers)

    // T8 (WS-G): keyboard tap-to-place. firstFreeBoardCell is the v1 landing target
    // — the first free board cell scanned row-major, with NO cursor/cell selection
    // yet. placeFocusedHandTile routes a single focused hand tile through the SAME
    // validated dispatchDrop the drag/empty-cell-tap paths use, so the move stays
    // server-authoritative (a wrong guess snaps/rejects, never desyncs).
    // TODO: cursor cell selection (arrow-key a focus ring across empty cells, Enter
    //   to place at the chosen cell) — deferred; v1 always uses the first free cell.
    let firstFreeBoardCell = null;
    for (let r = 0; r < BOARD_ROWS && !firstFreeBoardCell; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            if (board[r][c] == null) { firstFreeBoardCell = {col: c, row: r}; break; }
        }
    }
    const placeFocusedHandTile = (tileId) => {
        if (!firstFreeBoardCell) return;
        dispatchDrop({gridId: BOARD_GRID_ID, col: firstFreeBoardCell.col, row: firstFreeBoardCell.row}, tileId, [tileId]);
    };
    useTilePlacementHotkeys({
        enabled: isMyTurn && !waiting,
        getTilePos: (id) => G.tilePositions[id],
        onPlaceTile: placeFocusedHandTile,
    });

    // WS-10 highlight-only, T4 opt-in: mark the rack tiles that could extend a
    // valid board group right now, plus a count pill. Only computed when the
    // viewer has turned hints on (hintsOn); when off there are no rack markers
    // and no pill. Computed locally from the viewer's own hand + the live board
    // groups. Jokers are excluded from the set/count for v1 (see planning.js).
    const myHandTiles = getPlayerHandTiles(G, playerID);
    const playableTileList = hintsOn && playerID != null
        ? Array.from(playableTiles(myHandTiles, extractSeqs(G)))
        : [];
    const playableCount = playableTileList.length;

    const boardGrid = (<div className="ref">
        <GridContainer
            rows={BOARD_ROWS}
            cols={BOARD_COLS}
            tiles2dArray={board}
            gridId={BOARD_GRID_ID}
            canDnD={!waiting && ctx.currentPlayer === playerID}
            isDragActive={isDragActive}
            moveTiles={moveTilesUseCb}
            onCellTap={onCellTap}
            highlightTiles={showInvalidTiles}
            validTiles={validTiles}
            selectedTiles={state.selectedTiles}
            onTileDragEnd={onTileDragEnd}
            handleTileSelection={handleTileSelectionCb}
            onLongPress={onLongPressCb}
            hoverPosition={hoverPosition}
            setHoverPosition={setHoverPosition}
            newlyAdded={[]}
        /></div>)

    const handGrid = (
        <GridContainer rows={HAND_ROWS}
                       cols={HAND_COLS}
                       className="hand-grid"
                       tiles2dArray={hands[playerID]}
                       gridId={HAND_GRID_ID}
                       canDnD={!waiting}
                       highlightTiles={false}
                       playableTiles={playableTileList}
                       moveTiles={moveTilesUseCb}
                       onCellTap={onCellTap}
                       selectedTiles={state.selectedTiles}
                       onTileDragEnd={onTileDragEnd}
                       handleTileSelection={handleTileSelectionCb}
                       onLongPress={onLongPressCb}
                       hoverPosition={hoverPosition}
                       setHoverPosition={setHoverPosition}
                       newlyAdded={recentlyDrawnTiles}
        />)

    const allJoined = (matchData || []).length && every(matchData, (item) => item.name)
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
            handCounts={G.handCounts}
            connected={G.connected}
            timerExpireAt={showTurnTimer ? G.timerExpireAt : null}
            timePerTurn={G.timePerTurn}
            showTurnTimer={showTurnTimer}
        />
    )

    const selfData = (matchData || [])[Number(playerID)]
    const bannerLabel = showTurnTimer ? turnBannerLabel(ctx.currentPlayer, playerID, matchData) : null
    const isMyTurnBanner = ctx.currentPlayer === playerID
    const selfAvatar = selfData && selfData.name ? (
        <div className="rack-self">
            <PlayerAvatarWithTimer isActive={ctx.currentPlayer === playerID}
                                   name={selfData.name}
                                   matchId={matchID}
                                   seatId={Number(playerID)}
                                   tiles={G.handCounts && G.handCounts[playerID] != null
                                       ? G.handCounts[playerID]
                                       : count2dArrItems(hands[playerID])}
                                   isConnected={seatConnected(G.connected, Number(playerID), selfData.isConnected)}
                                   timerExpireAt={showTurnTimer ? G.timerExpireAt : null}
                                   totalTime={G.timePerTurn}
                                   showTurnTimer={showTurnTimer}/>
        </div>
    ) : null

    const playableHint = hintsOn ? (
        <div className="playable-hint" role="status" aria-live="polite">
            {playableCount > 0
                ? (playableCount === 1
                    ? '💡 1 tile fits the table'
                    : `💡 ${playableCount} tiles fit the table`)
                : '💡 No tiles fit the table yet'}
        </div>
    ) : null

    const turnBanner = bannerLabel ? (
        <div className={`turn-banner ${isMyTurnBanner ? "is-my-turn" : ""}`}
             role="status" aria-live="polite">
            <span className="turn-dot" aria-hidden="true"/>
            <span className="turn-banner-label">{bannerLabel}</span>
        </div>
    ) : null

    // S2-U11: first turn only — your move, initial meld not yet done, match
    // underway (not joining), not over, and not previously dismissed.
    const showCoachCard = !coachSeen
        && isMyTurnBanner
        && !ctx.gameover
        && !waiting
        && !(G.firstMoveDone && G.firstMoveDone[playerID])
    const coachCard = showCoachCard ? <CoachCard onDismiss={dismissCoach}/> : null

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
                <Suspense fallback={null}>
                    <GameOverModal
                        gameover={ctx.gameover}
                        matchId={matchID}
                        playerID={playerID}
                        matchData={matchData}
                    />
                </Suspense>}

            {sidebar}
            <div className="board" onClick={onBoardClick}>
                <div className="board-kick-layer">
                <div className="top-cue-stack">
                    {connectionCue}
                    {timeoutAnnouncement}
                </div>
                {waiting &&
                    <div className="waiting-overlay" role="status" aria-live="polite"
                         aria-label="Waiting for players">
                        <div className="waiting-card">
                            <div className="waiting-spinner" aria-hidden="true"/>
                            <div className="waiting-title">Waiting for players</div>
                            <div className="waiting-count">{waitingLabel(matchData)} joined</div>
                            {matchID &&
                                <div className="waiting-invite">
                                    <span className="invite-label">Invite a friend</span>
                                    <button
                                        type="button"
                                        className="invite-code"
                                        onClick={onCopyInvite}
                                        title="Click to copy the join link">
                                        {matchID}
                                    </button>
                                    <button type="button" className="invite-copy" onClick={onCopyInvite}>
                                        {inviteCopied ? 'Copied!' : 'Copy link'}
                                    </button>
                                </div>}
                        </div>
                    </div>}
                <Suspense fallback={null}>
                    <ComboOverlay combo={combo} by={comboBy}/>
                </Suspense>
                <TurnDeadlineWatcher
                    timerExpireAt={showTurnTimer ? G.timerExpireAt : null}
                    onTimeout={onTurnTimeout}/>
                {tableSeats}
                {boardGrid}
                <div className={'hand-buttons'}>
                    {selfAvatar}
                    <div className="rack-tools">
                        <IconButton glyph="↶" label="Undo" disabled={!canUndo} onClick={() => moves.undo()}/>
                        <IconButton glyph="↷" label="Redo" disabled={!canRedo} onClick={() => moves.redo()}/>
                    </div>
                    {turnBanner}
                    {playableHint}
                    {handGrid}
                    {coachCard}
                    <div className="controls-wrapper">
                        <div className="controls-secondary">
                            <button disabled={ctx.gameover || waiting}
                                    title={'Order by runs'}
                                    className={'rummikub-button secondary-action'} onClick={() => {
                                onOrderByColorClicked()
                            }}>Sort: runs
                            </button>
                            <button disabled={ctx.gameover || waiting}
                                    title={'Order by sets'}
                                    className={'rummikub-button secondary-action'} onClick={() => {
                                onOrderByValColor()
                            }}>Sort: colours
                            </button>
                            {extendBut}
                        </div>
                        <div className="controls-primary">
                            {drawOrEnd}
                        </div>
                        <div className="controls-tools">
                            <HintsToggle on={hintsOn} onToggle={toggleHints}/>
                            {showHintsTip && (
                                <div className="hints-tip" role="status" aria-live="polite">
                                    These highlight tiles you can add to a group already on the table. You still need your 30-point opening meld first.
                                    <button type="button" className="hints-tip__close" aria-label="Dismiss" onClick={dismissHintsTip}>Got it</button>
                                </div>
                            )}
                        </div>
                    </div>
                    {submitReason &&
                        <div className="submit-reason" role="alert">{submitReason}</div>}
                </div>
                </div>
            </div>
        </div>
        <DragOverlay dropAnimation={null}>
            {activeTile ? (
                <div className="tile-lift" style={{display: 'flex', gap: '2px'}}>
                    {state.selectedTiles.includes(activeTile)
                        ? orderTilesBySource(state.selectedTiles, G.tilePositions).map(id => <TilePreview key={id} tile={id} canDnD={true} isDragging={true}/>)
                        : <TilePreview tile={activeTile} canDnD={true} isDragging={true}/>}
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