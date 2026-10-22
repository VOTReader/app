/* jsx-inject — the JSX factory for every file in bundle-d.js (package.json build:d).
   esbuild's --inject makes these two bindings visible to every module it bundles, and
   --jsx-factory / --jsx-fragment point JSX at them, so each element compiles to one short
   minified name instead of "React.createElement" (19 characters, some 4,300 elements:
   about 79 KB of bundle-d). An element does exactly what it did before: it IS
   React.createElement, read once here. React is a global before any bundle runs
   (index.html, bundle-a). The names are deliberately ones no source file uses, so no local
   variable can shadow the factory (a JSX tag inside `const h = ...` would call it).
   Only the build reads this file: vitest compiles JSX with its own React.createElement,
   and a file with its own pragma (jsx-h.js) keeps that pragma. */
export const __jsx = React.createElement;
export const __jsxFrag = React.Fragment;
