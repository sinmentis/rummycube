import React from 'react';
import {render} from '@testing-library/react';
import PlayerAvatarWithTimer from '../rummikub/components/PlayerAvatar';
import {getSecTs} from '../rummikub/util';

// S2-U4: the active avatar shows the remaining whole seconds as centered SVG
// text in the ring center — a NON-color channel, so it stays colorblind-safe.
// timeLeft is milliseconds (timePerTurn = seconds * 1000), so the cue is
// Math.ceil(timeLeft / 1000).
describe('S2-U4 ring seconds', () => {
    test('active avatar renders the remaining whole seconds in the ring', () => {
        const {container} = render(
            <PlayerAvatarWithTimer
                isActive={true}
                showTurnTimer={true}
                name="P0"
                matchId="m1"
                seatId={0}
                tiles={3}
                isConnected={true}
                timerExpireAt={getSecTs() + 5000}
                totalTime={10000}
            />
        );
        const seconds = container.querySelector('.timer-seconds');
        expect(seconds).not.toBeNull();
        expect(seconds.textContent).toBe('5');
    });

    test('low time (<=5s) adds the pulse class to the ring', () => {
        const {container} = render(
            <PlayerAvatarWithTimer
                isActive={true}
                showTurnTimer={true}
                name="P0"
                matchId="m1"
                seatId={0}
                tiles={3}
                isConnected={true}
                timerExpireAt={getSecTs() + 3000}
                totalTime={10000}
            />
        );
        expect(container.querySelector('.timer-ring.timer-low')).not.toBeNull();
    });

    test('plenty of time does not add the pulse class', () => {
        const {container} = render(
            <PlayerAvatarWithTimer
                isActive={true}
                showTurnTimer={true}
                name="P0"
                matchId="m1"
                seatId={0}
                tiles={3}
                isConnected={true}
                timerExpireAt={getSecTs() + 9000}
                totalTime={10000}
            />
        );
        expect(container.querySelector('.timer-ring.timer-low')).toBeNull();
    });

    test('inactive avatar shows no seconds text and no ring', () => {
        const {container} = render(
            <PlayerAvatarWithTimer
                isActive={false}
                showTurnTimer={true}
                name="P1"
                matchId="m1"
                seatId={1}
                tiles={5}
                isConnected={true}
                timerExpireAt={getSecTs() + 5000}
                totalTime={10000}
            />
        );
        expect(container.querySelector('.timer-seconds')).toBeNull();
        expect(container.querySelector('.timer-circle')).toBeNull();
    });
});
