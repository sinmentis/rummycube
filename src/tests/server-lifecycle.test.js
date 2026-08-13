import {createServerLifecycle} from '../serverLifecycle';

function closeable() {
    let callback;
    return {
        server: {
            close: jest.fn((done) => {
                callback = done;
            }),
        },
        finish(error) {
            callback(error);
        },
    };
}

test('marks the server unready before waiting for shutdown', async () => {
    const io = closeable();
    const exit = jest.fn();
    const lifecycle = createServerLifecycle({
        io: io.server,
        timeoutMs: 1000,
        exit,
        logger: {log: jest.fn(), error: jest.fn()},
    });
    lifecycle.markReady();
    expect(lifecycle.isReady()).toBe(true);

    const shutdown = lifecycle.shutdown('SIGTERM');
    expect(lifecycle.isReady()).toBe(false);
    expect(io.server.close).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();

    io.finish();
    await shutdown;
    expect(exit).toHaveBeenCalledWith(0);
});

test('coalesces repeated shutdown signals', async () => {
    const io = closeable();
    const exit = jest.fn();
    const lifecycle = createServerLifecycle({
        io: io.server,
        timeoutMs: 1000,
        exit,
        logger: {log: jest.fn(), error: jest.fn()},
    });

    const first = lifecycle.shutdown('SIGTERM');
    const second = lifecycle.shutdown('SIGINT');
    expect(second).toBe(first);
    expect(io.server.close).toHaveBeenCalledTimes(1);

    io.finish();
    await first;
    expect(exit).toHaveBeenCalledTimes(1);
});

test('fails closed when the server cannot close', async () => {
    const io = closeable();
    const exit = jest.fn();
    const logger = {log: jest.fn(), error: jest.fn()};
    const lifecycle = createServerLifecycle({
        io: io.server,
        timeoutMs: 1000,
        exit,
        logger,
    });

    const shutdown = lifecycle.shutdown();
    io.finish(new Error('close failed'));
    await shutdown;

    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith(
        'graceful shutdown failed',
        expect.any(Error),
    );
});

test('times out once when close never completes', async () => {
    jest.useFakeTimers();
    const io = closeable();
    const exit = jest.fn();
    const logger = {log: jest.fn(), error: jest.fn()};
    const lifecycle = createServerLifecycle({
        io: io.server,
        timeoutMs: 25,
        exit,
        logger,
    });

    const shutdown = lifecycle.shutdown();
    jest.advanceTimersByTime(25);
    await shutdown;
    expect(exit).toHaveBeenCalledWith(1);

    io.finish();
    await Promise.resolve();
    expect(exit).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
});
