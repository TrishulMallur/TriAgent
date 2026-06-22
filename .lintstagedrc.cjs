// lint-staged config
//
// We return commands from functions so lint-staged doesn't append the
// staged file list. `tsc -b` operates on the full TS project graph (driven
// by tsconfig project references), not on a list of files, so passing
// individual paths would be wrong.
//
// The pre-commit hook in .husky/pre-commit also runs `tsc -b --noEmit`
// unconditionally as a safety net. When TS files are staged this is a
// fast incremental re-run; when only non-TS files are staged it's the
// only type-check that fires.

module.exports = {
  '*.{ts,tsx}': () => 'npx tsc -b --noEmit',
};
