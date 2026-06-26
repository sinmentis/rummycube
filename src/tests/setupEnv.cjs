// Jest does not load .env files, and src/rummikub/constants.js validates these
// env-derived rule constants at import time (throwing on NaN). Provide them
// before any test imports constants so the whole suite stays importable.
// Values mirror the project's .env / .env.production; a pre-set value (shell
// env, or a test that sets its own) takes precedence.
process.env.REACT_APP_TILES_TO_DRAW ??= '14';
process.env.REACT_APP_FIRST_MOVE_SCORE_LIMIT ??= '30';
