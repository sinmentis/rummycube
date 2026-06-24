// Test-only Babel plugin: rewrite dynamic `import(x)` into
// `Promise.resolve().then(() => require(x))` so Jest (CommonJS) can run code
// that uses `React.lazy(() => import(...))`. The production Vite build handles
// dynamic import natively and never uses this plugin.
module.exports = function ({types: t}) {
    return {
        name: "dynamic-import-to-require",
        visitor: {
            Import(path) {
                const call = path.parentPath;
                const arg = call.node.arguments[0];
                call.replaceWith(
                    t.callExpression(
                        t.memberExpression(
                            t.callExpression(
                                t.memberExpression(t.identifier("Promise"), t.identifier("resolve")),
                                [],
                            ),
                            t.identifier("then"),
                        ),
                        [
                            t.arrowFunctionExpression(
                                [],
                                t.callExpression(t.identifier("require"), [arg]),
                            ),
                        ],
                    ),
                );
            },
        },
    };
};
