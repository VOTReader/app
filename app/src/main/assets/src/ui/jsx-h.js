/* jsx-h — React.createElement and React.Fragment under one short name each.
   A file that opts in with the pragmas
       /** @jsx h *\/  and  /** @jsxFrag Fragment *\/
   and imports { h, Fragment } from here compiles its JSX to h(...), which the minifier shortens to one
   letter at every element instead of 19 characters ("React.createElement"). The AOGCG Answers stages
   added some 2,000 elements to bundle-d.js; this holds it inside its budget ceiling
   (tools/check-bundle-budget.js) without changing what any element does. React is a global before any
   bundle runs (index.html, bundle-a), and vitest.setup.js makes it one for the tests. */
export const h = React.createElement;
export const Fragment = React.Fragment;
