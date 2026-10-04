# Browser tests

`current/` contains the maintained Playwright acceptance suite for the current user interface. The default `npm run test:e2e` command only runs this directory.

`legacy/` preserves interaction scripts from earlier review iterations. Later product decisions intentionally removed or renamed controls asserted by those scripts, so they are retained as design history and are not executable release gates. When a legacy scenario is still relevant, rewrite it against the current workflow and move the new behavior-focused test into `current/`.

Browser tests require `npm run dev` and use the independent `slidebi_test`/development fixtures described in [docs/testing.md](../docs/testing.md).
