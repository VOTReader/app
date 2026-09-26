/* n7-03 (sweep 2026-09-25): the tests run the React the readers run.
   Readers get the vendored app/src/main/assets/react.min.js + react-dom.min.js (18.2.0);
   the npm react/react-dom are test-only. They had drifted to 19.3 (Dependabot's minor group,
   58c034f9), so every component test proved behaviour under a React no reader has.
   v15-code-health-02: tsc now types the React global from @types/react / @types/react-dom
   (tools/globals.generated.d.ts), so the types check every hook call and JSX prop against
   an API: they are held to the shipped MAJOR too, or tsc would pass code 18 cannot run. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const vendored = (file) => /\.version="(\d+\.\d+\.\d+)"|[Vv]ersion:"(\d+\.\d+\.\d+)"/.exec(read(`app/src/main/assets/${file}`))?.slice(1).find(Boolean);

describe('the React under test is the React that ships', () => {
  const pkg = JSON.parse(read('package.json'));
  const shipped = vendored('react.min.js');

  it('reads the vendored version', () => {
    expect(shipped).toMatch(/^\d+\.\d+\.\d+$/);
    expect(vendored('react-dom.min.js')).toBe(shipped);
  });

  it('package.json pins react and react-dom to it exactly', () => {
    expect(pkg.devDependencies.react).toBe(shipped);
    expect(pkg.devDependencies['react-dom']).toBe(shipped);
  });

  it('and that is what is installed', () => {
    expect(JSON.parse(read('node_modules/react/package.json')).version).toBe(shipped);
    expect(JSON.parse(read('node_modules/react-dom/package.json')).version).toBe(shipped);
  });

  it('@types/react and @types/react-dom describe the shipped major', () => {
    const major = shipped.split('.')[0];
    for (const name of ['@types/react', '@types/react-dom']) {
      expect(pkg.devDependencies[name], name).toMatch(new RegExp(`^${major}\\.`));
      expect(JSON.parse(read(`node_modules/${name}/package.json`)).version.split('.')[0], name).toBe(major);
    }
  });

  it('Dependabot does not offer a react / react-dom bump the vendored files would not follow', () => {
    const cfg = read('.github/dependabot.yml');
    expect(cfg).toMatch(/dependency-name: "react"/);
    expect(cfg).toMatch(/dependency-name: "react-dom"/);
  });
});
