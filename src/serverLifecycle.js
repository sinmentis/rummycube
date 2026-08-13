const DEFAULT_SHUTDOWN_TIMEOUT_MS = 8000;

function closeServer(server) {
    if (!server) return Promise.resolve();
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

export function createServerLifecycle({
    io,
    appServer,
    apiServer,
    timers = [],
    timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
    logger = console,
    exit = (code) => process.exit(code),
}) {
    let ready = false;
    let stopping = false;
    let shutdownPromise;

    const markReady = () => {
        if (!stopping) ready = true;
    };

    const isReady = () => ready && !stopping;

    const shutdown = (signal = 'SIGTERM') => {
        if (shutdownPromise) return shutdownPromise;
        stopping = true;
        ready = false;
        for (const timer of timers) clearInterval(timer);

        shutdownPromise = new Promise((resolve) => {
            let finished = false;
            const finish = (code) => {
                if (finished) return;
                finished = true;
                clearTimeout(watchdog);
                exit(code);
                resolve();
            };
            const watchdog = setTimeout(() => {
                logger.error(`graceful shutdown timed out after ${timeoutMs}ms`);
                finish(1);
            }, timeoutMs);
            watchdog.unref?.();

            const primaryServer = io || appServer;
            Promise.all([
                closeServer(primaryServer),
                apiServer && apiServer !== primaryServer
                    ? closeServer(apiServer)
                    : Promise.resolve(),
            ]).then(() => {
                if (finished) return;
                logger.log(`graceful shutdown complete (${signal})`);
                finish(0);
            }).catch((error) => {
                if (finished) return;
                logger.error('graceful shutdown failed', error);
                finish(1);
            });
        });
        return shutdownPromise;
    };

    return {isReady, markReady, shutdown};
}
