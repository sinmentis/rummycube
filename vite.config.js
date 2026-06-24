import {resolve} from "node:path";
import {readFileSync} from "node:fs";
import {defineConfig, loadEnv} from "vite";
import react from "@vitejs/plugin-react";
// https://vitejs.dev/config/
export default defineConfig(({mode}) => {
    setEnv(mode);
    return {
        plugins: [
            react(),
            envPlugin(),
            devServerPlugin(),
            sourcemapPlugin(),
            buildPathPlugin(),
            chunkSplitPlugin(),
            dropConsolePlugin(),
            basePlugin(),
            importPrefixPlugin(),
            htmlPlugin(mode),
        ],
    };
});

function setEnv(mode) {
    Object.assign(process.env, loadEnv(mode, ".", ["REACT_APP_", "NODE_ENV", "PUBLIC_URL"]));
    process.env.NODE_ENV ||= mode;
    const {homepage} = JSON.parse(readFileSync("package.json", "utf-8"));
    process.env.PUBLIC_URL ||= homepage
        ? `${homepage.startsWith("http") || homepage.startsWith("/")
            ? homepage
            : `/${homepage}`}`.replace(/\/$/, "")
        : "";
}

// Expose `process.env` environment variables to your client code
// Migration guide: Follow the guide below to replace process.env with import.meta.env in your app, you may also need to rename your environment variable to a name that begins with VITE_ instead of REACT_APP_
// https://vitejs.dev/guide/env-and-mode.html#env-variables
function envPlugin() {
    return {
        name: "env-plugin",
        config(_, {mode}) {
            const env = loadEnv(mode, ".", ["REACT_APP_", "NODE_ENV", "PUBLIC_URL"]);
            return {
                define: Object.fromEntries(Object.entries(env).map(([key, value]) => [
                    `process.env.${key}`,
                    JSON.stringify(value),
                ])),
            };
        },
    };
}

// Setup HOST, SSL, PORT
// Migration guide: Follow the guides below
// https://vitejs.dev/config/server-options.html#server-host
// https://vitejs.dev/config/server-options.html#server-https
// https://vitejs.dev/config/server-options.html#server-port
function devServerPlugin() {
    return {
        name: "dev-server-plugin",
        config(_, {mode}) {
            const {
                HOST,
                PORT,
                HTTPS,
                SSL_CRT_FILE,
                SSL_KEY_FILE
            } = loadEnv(mode, ".", ["HOST", "PORT", "HTTPS", "SSL_CRT_FILE", "SSL_KEY_FILE"]);
            const https = HTTPS === "true";
            return {
                server: {
                    host: HOST || "0.0.0.0",
                    port: parseInt(PORT || "3000", 10),
                    open: true,
                    ...(https &&
                        SSL_CRT_FILE &&
                        SSL_KEY_FILE && {
                            https: {
                                cert: readFileSync(resolve(SSL_CRT_FILE)),
                                key: readFileSync(resolve(SSL_KEY_FILE)),
                            },
                        }),
                },
            };
        },
    };
}

// Migration guide: Follow the guide below
// https://vitejs.dev/config/build-options.html#build-sourcemap
function sourcemapPlugin() {
    return {
        name: "sourcemap-plugin",
        config(_, {mode}) {
            const {GENERATE_SOURCEMAP} = loadEnv(mode, ".", [
                "GENERATE_SOURCEMAP",
            ]);
            return {
                build: {
                    sourcemap: GENERATE_SOURCEMAP === "true",
                },
            };
        },
    };
}

// Migration guide: Follow the guide below
// https://vitejs.dev/config/build-options.html#build-outdir
function buildPathPlugin() {
    return {
        name: "build-path-plugin",
        config(_, {mode}) {
            const {BUILD_PATH} = loadEnv(mode, ".", [
                "BUILD_PATH",
            ]);
            return {
                build: {
                    outDir: BUILD_PATH || "build",
                },
            };
        },
    };
}

// Split heavy third-party code out of the app entry so the main chunk stays
// small and vendor code can be cached across deploys.
//
// react/react-dom/react-router and boardgame.io share a circular dependency
// (boardgame.io renders through react-dom). Splitting them into *separate*
// chunks makes Rollup emit a cross-chunk cycle that throws
// "Cannot access 'X' before initialization" at load, so they're deliberately
// kept together in one `vendor` chunk. canvas-confetti is independent and goes
// to its own `fx` chunk.
// https://rollupjs.org/configuration-options/#output-manualchunks
function chunkSplitPlugin() {
    return {
        name: "chunk-split-plugin",
        config() {
            return {
                build: {
                    rollupOptions: {
                        output: {
                            manualChunks(id) {
                                if (!id.includes("node_modules")) return;
                                if (id.includes("node_modules/canvas-confetti")) return "fx";
                                if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return "vendor";
                                if (id.includes("node_modules/boardgame.io")) return "vendor";
                            },
                        },
                    },
                },
            };
        },
    };
}

// Strip console.* and debugger statements from the production bundle only.
// esbuild's `drop` runs during the build transform; gating on command === "build"
// keeps console output intact during local dev (`vite serve`).
// https://esbuild.github.io/api/#drop
function dropConsolePlugin() {
    return {
        name: "drop-console-plugin",
        config(_, {command}) {
            return command === "build"
                ? {esbuild: {drop: ["console", "debugger"]}}
                : {};
        },
    };
}

// Migration guide: Follow the guide below and remove homepage field in package.json
// https://vitejs.dev/config/shared-options.html#base
function basePlugin() {
    return {
        name: "base-plugin",
        config(_, {mode}) {
            const {PUBLIC_URL} = loadEnv(mode, ".", ["PUBLIC_URL"]);
            return {
                base: "/",
            };
        },
    };
}

// To resolve modules from node_modules, you can prefix paths with ~
// https://create-react-app.dev/docs/adding-a-sass-stylesheet
// Migration guide: Follow the guide below
// https://vitejs.dev/config/shared-options.html#resolve-alias
function importPrefixPlugin() {
    return {
        name: "import-prefix-plugin",
        config() {
            return {
                resolve: {
                    alias: [{find: /^~([^/])/, replacement: "$1"}],
                },
            };
        },
    };
}

// Replace %ENV_VARIABLES% in index.html
// https://vitejs.dev/guide/api-plugin.html#transformindexhtml
// Migration guide: Follow the guide below, you may need to rename your environment variable to a name that begins with VITE_ instead of REACT_APP_
// https://vitejs.dev/guide/env-and-mode.html#html-env-replacement
function htmlPlugin(mode) {
    const env = loadEnv(mode, ".", ["REACT_APP_", "NODE_ENV", "PUBLIC_URL"]);
    return {
        name: "html-plugin",
        transformIndexHtml: {
            order: "pre",
            handler(html) {
                return html.replace(/%(.*?)%/g, (match, p1) => env[p1] ?? match);
            },
        },
    };
}
