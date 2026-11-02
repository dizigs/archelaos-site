// Focus on fatal or demonstrably unsafe constructs in existing project code.
// New rules can be tightened gradually without obscuring existing technical debt.
export default [
  {
    files: ["rebuild/**/*.js", "rebuild/**/*.cjs", "rebuild/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        window: "readonly", document: "readonly", navigator: "readonly",
        localStorage: "readonly", location: "readonly", console: "readonly",
        fetch: "readonly", URL: "readonly", URLSearchParams: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly",
        setInterval: "readonly", clearInterval: "readonly",
        requestAnimationFrame: "readonly", IntersectionObserver: "readonly",
        MutationObserver: "readonly", FormData: "readonly", FileReader: "readonly",
        HTMLElement: "readonly", CustomEvent: "readonly", Event: "readonly",
        Node: "readonly", AbortController: "readonly", Intl: "readonly",
        process: "readonly", require: "readonly", module: "readonly",
        __dirname: "readonly", Buffer: "readonly", global: "readonly"
      }
    },
    rules: {
      "no-unsafe-finally": "error",
      "no-compare-neg-zero": "error",
      "no-dupe-args": "error",
      "no-dupe-class-members": "error",
      "no-dupe-else-if": "error",
      "no-duplicate-case": "error",
      "no-ex-assign": "error",
      "no-func-assign": "error",
      "no-import-assign": "error",
      "no-irregular-whitespace": "error",
      "no-loss-of-precision": "error",
      "no-self-assign": "error",
      "no-sparse-arrays": "error",
      "no-unexpected-multiline": "error",
      "no-unreachable": "error",
      "no-constant-binary-expression": "error"
    }
  },
  { files: ["rebuild/ai/**/*.js", "rebuild/cloudflare/functions/**/*.js"], languageOptions: {sourceType:"module"} }
];
