// scripts/test/check-npm-install-sites.test.mjs: the case manifest of the strict npm install
// site check (transformate WI-4821, section F). node:test and node built-ins only.
// usage: node --test scripts/test/check-npm-install-sites.test.mjs
//
// Each case has a stable id, a class and its source (a comment on its line):
//   ALLOWED      supported and policy-allowed: rc 0 and zero FAIL row (and any row it names).
//   FORBIDDEN    supported and policy-forbidden: rc 1 and EXACTLY its FAIL rows (master's policy rows).
//   UNSUPPORTED  outside G1, Y1 or D1: rc 1 and EXACTLY its FAIL rows (the UNSUPPORTED row and its
//                kind). The row never claims that an install runs; safe or unsafe, the form is refused.
// Every rc 1 case asserts rc AND the exact list of FAIL rows (file, line and row text, so the count).
// Fixtures are synthetic: built at run time under os.tmpdir() only (never under the repo root), each
// file with a marker comment or name; P below is a made-up package name. The check runs by its
// absolute path in a child process.
//
// THE MAPPING (section F): every entry of the WI-4774 F5 test file (10af925b, CASE-SOURCE-f5tip.tsv
// by line and name) and every finding id of the 13 WI-4774 verdicts, each to ONE case id here or to a
// named duplicate ("dup <id>"), with its class here and a one-line reason.
// THE MAPPING, part 1: the 160 F5 entries (F5 line, kind, name -> target, class: reason)
//   F5 :114 test CONTROL-OK: one safe site in each modelled form reads OK -> A01, ALLOWED: plain npm ci in each modelled form; master's SITE OK rows
//   F5 :130 test F1 YAML anchor: an anchored run block FAILs -> U72, UNSUPPORTED: Y1.2 an anchor: the whole file is refused
//   F5 :140 test F2 YAML alias or merge key: a run by alias FAILs -> U73, UNSUPPORTED: Y1.2 an alias: the whole file is refused
//   F5 :150 test F3 workflow env: the registry token in a workflow-level env FAILs -> A14, ALLOWED: section D: master has no env row outside image-build; the WI-4774 F3 row is not in this item
//   F5 :158 test F3 SAFE twin: a plain workflow-level env reads OK -> A04, ALLOWED: a plain workflow-level env map
//   F5 :164 test F4 job env: the registry token in a job-level env FAILs -> dup A14, ALLOWED: section D: the WI-4774 F4 job-env row is not in this item
//   F5 :172 test F4 SAFE twin: a plain job-level env reads OK -> dup A04, ALLOWED: a plain job-level env map
//   F5 :180 test F5 multi-line flow scalar: a run split over two lines FAILs -> dup UJ2, UNSUPPORTED: Y1.4 a multi-line plain run value
//   F5 :190 test F6 exec-form JSON RUN: npm install in exec form FAILs -> U103, UNSUPPORTED: D1 an exec-form RUN
//   F5 :195 test F6 SAFE twin: an exec-form RUN with no npm reads OK -> U104, UNSUPPORTED: outside G1/Y1/D1 by design (D1 exec form)
//   F5 :199 test F7 RUN heredoc: npm install in a RUN heredoc FAILs -> dup UJ5, UNSUPPORTED: G1.2 a << (a RUN heredoc)
//   F5 :204 test F7 SAFE twin: a RUN heredoc with no npm reads OK -> U110, UNSUPPORTED: outside G1/Y1/D1 by design (a RUN heredoc)
//   F5 :208 test F8 npm by path: /usr/local/bin/npm install FAILs -> U57, UNSUPPORTED: PM.3 npm by path
//   F5 :213 test F8 SAFE twin: npm ci by path in a workflow reads OK -> U58, UNSUPPORTED: outside G1/Y1/D1 by design (PM.3 npm by path)
//   F5 :217 test UNREADABLE: an unclosed flow collection FAILs -> U78, UNSUPPORTED: Y1.3 a flow value under jobs:
//   F5 :227 test UNREADABLE: a tab-indented line FAILs -> U69, UNSUPPORTED: Y1.1 a tab in the indentation
//   F5 :237 describe F1 fix round -> group F14-F18 U19 U24-U28 U45-U65 U70-U88 U98-U108 A08-A14, -: a describe block: each of its tests is mapped on its own line
//   F5 :264 test M1-a D08: a double-quoted "<<EOF" opens no heredoc; both base FAIL rows stay -> F14, FORBIDDEN: a quoted <<EOF is literal; both base rows stay; the real heredoc is refused
//   F5 :268 test M1-b D08: a single-quoted '<<EOF' opens no heredoc; both base FAIL rows stay -> F15, FORBIDDEN: the single-quoted form of F14
//   F5 :272 test M1-c D08c: a quoted <<EOF before FROM: the runtime stage keeps its own FAIL row -> F16, FORBIDDEN: the runtime install keeps master's row; the heredoc RUN is refused
//   F5 :291 test M1-d PIN D08b: the same root with no quoted opener keeps both base FAIL rows -> F17, FORBIDDEN: both base rows stay beside the refused heredoc RUN
//   F5 :298 test M1-e a <<EOF after a shell comment opens nothing: both base FAIL rows stay, the comment opener FAILs closed -> F18, FORBIDDEN: G1.2 refuses the commented opener; both base rows stay
//   F5 :302 test M1-f PIN: a quoted word before a real <<EOF on the same RUN still opens the heredoc -> U24, UNSUPPORTED: G1.2 a << after a quoted word
//   F5 :306 test M1-g PIN: a quoted delimiter word <<'EOF' opens a heredoc -> U25, UNSUPPORTED: G1.2 a << with a quoted delimiter
//   F5 :310 test M1-h: a '<<EOF' glued inside a word (cat<<EOF) is no BuildKit heredoc word: it FAILs closed -> U26, UNSUPPORTED: G1.2 a << glued in a word
//   F5 :316 test m1-a: /usr/bin/npx npm install FAILs with the row THE BASE prints -> U61, UNSUPPORTED: PM.3 /usr/bin/npx is not read by npmCalls
//   F5 :320 test m1-b: npx npm install FAILs -> U62, UNSUPPORTED: PM.3 npm is npx's sub-command to npmCalls (it would read npx only)
//   F5 :324 test m1 SAFE twin: npx of a tool reads as its NOTE, no SITE -> A11, ALLOWED: npx of a tool: master's NOTE row (an npx policy change is not in this item)
//   F5 :331 test m2-a Y03b: a step env merged by '<< :' holding the token FAILs as F2 -> U74, UNSUPPORTED: Y1.2 a merge key '<< :'
//   F5 :335 test m2-b: a job env merged by '<< : *x' names the merge key as F2 -> U75, UNSUPPORTED: Y1.2 a merge key and an alias
//   F5 :341 test m3-a Y04: run: > over 'npm' / 'install <pkg>' FAILs at the run's first line -> U82, UNSUPPORTED: Y1.4 a folded run value
//   F5 :345 test m3-b Y04b (OpenAI R1): run: >- over 'npm' / 'install <pkg>' FAILs at the run's first line -> U83, UNSUPPORTED: Y1.4 a folded run value (>-)
//   F5 :349 test m3-c PIN: the folded direct control (the whole command on one line) FAILs -> dup U83, UNSUPPORTED: Y1.4 a folded run value, the command on one line
//   F5 :353 test m3-d: a more-indented line of a folded scalar keeps its newline; the line after it is folded alone -> dup U82, UNSUPPORTED: Y1.4 a folded run value with a more-indented line
//   F5 :357 test m3 SAFE twin: a folded echo reads no SITE -> U84, UNSUPPORTED: outside G1/Y1/D1 by design (a folded run value)
//   F5 :361 test m3 SAFE twin: a folded 'npm' / 'ci' prints its SITE OK row -> dup U84, UNSUPPORTED: outside G1/Y1/D1 by design (a folded npm / ci)
//   F5 :368 test m4-a Y06: run: "npm install <pkg>" FAILs with the unquoted row -> U85, UNSUPPORTED: Y1.4 a double-quoted run value
//   F5 :371 test m4-b Y07: run: 'npm install <pkg>' FAILs with the unquoted row -> U86, UNSUPPORTED: Y1.4 a single-quoted run value
//   F5 :374 test m4-c D04: RUN sh -c "npm install <pkg>" FAILs -> U48, UNSUPPORTED: PM.2 a package-manager word inside quotes (RUN)
//   F5 :378 test m4-d S02: sh -c "npm install <pkg>" in scripts/*.sh FAILs -> U49, UNSUPPORTED: PM.2 a package-manager word inside quotes (script)
//   F5 :382 test m4-e: a backtick command substitution holding npm install FAILs -> U19, UNSUPPORTED: G1.2 a backtick outside quotes
//   F5 :386 test m4 SAFE twin: echo "npm is a tool" reads no SITE -> U50, UNSUPPORTED: outside G1/Y1/D1 by design (PM.2)
//   F5 :392 test m5-a Y05: a line continuation splitting npm and install in a run block FAILs -> U05, UNSUPPORTED: G1.2 a backslash (a continuation) in a run block
//   F5 :396 test m5-a S01: a line continuation splitting npm and install in scripts/*.sh FAILs -> U06, UNSUPPORTED: G1.2 a backslash (a continuation) in a script
//   F5 :400 test m5-b Y19: npm --prefix /app install in a workflow FAILs -> U64, UNSUPPORTED: PM.4 an option before the sub-command (workflow)
//   F5 :404 test m5-b D12: npm --prefix /app install in a RUN FAILs -> U65, UNSUPPORTED: PM.4 an option before the sub-command (RUN)
//   F5 :408 test m5-c Y13: $(which npm) install in a workflow FAILs -> U45, UNSUPPORTED: PM.1 a $( on a package-manager line (workflow)
//   F5 :412 test m5-c D05: $(which npm) install in a RUN FAILs -> U46, UNSUPPORTED: PM.1 a $( on a package-manager line (RUN)
//   F5 :416 test m5-d Y14: $NPM_BIN install in a workflow FAILs closed as UNREADABLE -> A12, ALLOWED: C4 NOT GUARANTEED: a command name in a variable; no PM word, so STAGE 2 reads no install
//   F5 :420 test m5-d D06: ENV NPM_BIN=npm then RUN $NPM_BIN install FAILs closed as UNREADABLE -> dup A12, ALLOWED: C4 NOT GUARANTEED: the Dockerfile form (ENV NPM_BIN, RUN $NPM_BIN)
//   F5 :424 test m5-d: RUN ${NPM} ci FAILs closed as UNREADABLE -> U47, UNSUPPORTED: PM.1 a ${ on a package-manager line
//   F5 :427 test m5-d SAFE twin: $PY install (a name with no npm or npx) reads no SITE -> A10, ALLOWED: no package-manager word
//   F5 :444 test m5-e D09: a '# escape=`' parser directive FAILs closed naming the directive -> U98, UNSUPPORTED: D1 a parser directive (the whole Dockerfile)
//   F5 :447 test m5-e SAFE twin: '# escape=\\' (the backslash) reads OK with its SITE row -> U99, UNSUPPORTED: outside G1/Y1/D1 by design (D1 a parser directive)
//   F5 :451 test m5-f D10: CMD exec form holding npm install FAILs -> U106, UNSUPPORTED: D1 a PM word in CMD (exec form)
//   F5 :454 test m5-f: CMD shell form holding npm install FAILs -> U107, UNSUPPORTED: D1 a PM word in CMD (shell form)
//   F5 :457 test m5-f: ENTRYPOINT exec form holding npx FAILs -> U108, UNSUPPORTED: D1 a PM word in ENTRYPOINT
//   F5 :460 test m5-f SAFE twin: CMD [node, server.js] reads no SITE -> A09, ALLOWED: CMD with no PM word
//   F5 :475 test m5-g Y21: a composite action's run: npm install FAILs -> F09, FORBIDDEN: B3: a composite action's run is read; master's fetch row
//   F5 :479 test m5-g SAFE twin: a composite action's run: npm ci prints its SITE OK row -> A08, ALLOWED: B3: a composite action's npm ci; master's SITE OK row
//   F5 :483 test m5-h Y11: the token in jobs.<id>.container.env FAILs as F4 -> dup A14, ALLOWED: section D: the WI-4774 container-env row is not in this item
//   F5 :487 test m5-h SAFE twin: a plain container env reads OK with the run's SITE row -> dup A04, ALLOWED: a plain container env map
//   F5 :493 test m6 PIN: a merge key '<<:' FAILs as F2 -> U76, UNSUPPORTED: Y1.2 a merge key '<<:'
//   F5 :497 test m6 PIN: a tag on a run FAILs as UNREADABLE -> U77, UNSUPPORTED: Y1.2 a tag on a run
//   F5 :501 test m6 PIN: a job env row named for npm FAILs as F4 -> dup A14, ALLOWED: section D: an env row named NODE_AUTH_TOKEN is not a master row
//   F5 :505 test m6 PIN: a COPY heredoc FAILs as F7 -> A13, ALLOWED: D1 reads RUN: a COPY heredoc writes a file and runs nothing
//   F5 :509 test m6 PIN: an unterminated heredoc FAILs as F7 -> U27, UNSUPPORTED: G1.2 an unterminated RUN heredoc
//   F5 :513 test m6 PIN: npm-cli.js by path FAILs as F8 -> U60, UNSUPPORTED: PM.3 npm by path (npm-cli.js)
//   F5 :517 test m6 PIN: /run/secrets in an exec-form RUN FAILs -> U105, UNSUPPORTED: D1 an exec-form RUN (/run/secrets: the RUN is not read)
//   F5 :521 test m6 PIN: /run/secrets in a heredoc RUN FAILs -> U28, UNSUPPORTED: G1.2 a heredoc RUN (/run/secrets: the RUN is not read)
//   F5 :525 test m6 PIN: an anchor in a flow sequence FAILs as F1 -> U79, UNSUPPORTED: Y1.3 a flow sequence under jobs:
//   F5 :529 test m6 PIN: a workflow env that is no block map FAILs as F3 -> dup A14, ALLOWED: section D: a workflow env that is no block map is not a master row
//   F5 :533 test m6 PIN: a job env row that is no one NAME: value FAILs as F4 -> dup A14, ALLOWED: section D: a nested job env row is not a master row
//   F5 :537 test m6 PIN: a YAML directive FAILs as UNREADABLE -> U70, UNSUPPORTED: Y1.1 a YAML directive
//   F5 :541 test m6 PIN: a block scalar header it does not read FAILs as UNREADABLE -> U88, UNSUPPORTED: Y1.4 a block header with an indentation digit
//   F5 :545 test m6 PIN: a second document FAILs as UNREADABLE -> U71, UNSUPPORTED: Y1.1 a second document
//   F5 :551 test R2-a: RUN "/usr/bin/npm" install FAILs as F8 -> U51, UNSUPPORTED: PM.2 a double-quoted npm path
//   F5 :555 test R2-a: RUN '/usr/bin/npm' install FAILs as F8 -> U52, UNSUPPORTED: PM.2 a single-quoted npm path
//   F5 :559 test R2-b PIN: RUN ./node_modules/.bin/npm install FAILs as F8 -> U59, UNSUPPORTED: PM.3 a relative npm path
//   F5 :563 test R2-c: RUN "./node_modules/.bin/npm" install FAILs as F8 -> U53, UNSUPPORTED: PM.2 a quoted relative npm path
//   F5 :567 test R2-d: a workflow run line "/usr/bin/npm" install FAILs as F8 -> U54, UNSUPPORTED: PM.2 a quoted npm path in a run block
//   F5 :571 test R2-e: a scripts/*.sh line './node_modules/.bin/npm' install FAILs as F8 -> U55, UNSUPPORTED: PM.2 a quoted npm path in a script
//   F5 :575 test R2 SAFE twin: "./node_modules/.bin/npm" ci in a workflow prints its SITE OK row -> U56, UNSUPPORTED: outside G1/Y1/D1 by design (PM.2)
//   F5 :581 test NW-a: a tab-indented run keeps THE BASE's SITE FAIL row beside its UNREADABLE row -> dup U69, UNSUPPORTED: Y1.1 a tab: the whole file is refused (rc 1 at base and tip)
//   F5 :589 test U1 F3 SAFE twin + row: a plain workflow env, the run's SITE OK row -> dup A04, ALLOWED: a plain workflow env; the run's SITE OK row
//   F5 :593 test U1 F4 SAFE twin + row: a plain job env, the run's SITE OK row -> dup A04, ALLOWED: a plain job env; the run's SITE OK row
//   F5 :597 test U1 F6 SAFE twin + row: the exec-form RUN reads no SITE, the deps install keeps its OK row -> dup U104, UNSUPPORTED: outside G1/Y1/D1 by design (D1 exec form)
//   F5 :602 test U1 F7 SAFE twin + row: the heredoc RUN reads no SITE, the deps install keeps its OK row -> dup U110, UNSUPPORTED: outside G1/Y1/D1 by design (a RUN heredoc)
//   F5 :607 test U1 F8 SAFE twin + row: ./node_modules/.bin/npm ci prints its SITE OK row -> dup U58, UNSUPPORTED: outside G1/Y1/D1 by design (PM.3)
//   F5 :616 describe F2 fix round -> group F10-F13 U05 A03, -: a describe block: each of its tests is mapped on its own line
//   F5 :640 test N1-a NG_wf_comment_cont: a comment ending in \\ then npm install FAILs at the install line -> F10, FORBIDDEN: a standalone comment passes; the next line is read; master's fetch row
//   F5 :644 test N1-b NG_wf_comment_cont_mid: echo, a comment ending in \\, then npm install FAILs at the install line -> F11, FORBIDDEN: the same with an echo before the comment
//   F5 :648 test N1-c the action form: a composite action's comment ending in \\ then npm install FAILs at the install line -> F12, FORBIDDEN: the action form of F10
//   F5 :652 test PIN-N1-ctl: a comment with no \\ then npm install FAILs at the install line -> F13, FORBIDDEN: a comment with no backslash; master's fetch row
//   F5 :656 test PIN-N1-cont: a real continuation npm \\ then install joins: ONE SITE FAIL row at the first line -> dup U05, UNSUPPORTED: G1.2 a backslash (a continuation)
//   F5 :663 test SAFE-N1: a comment that names an install and ends in \\ then echo runs nothing: rc 0 -> A03, ALLOWED: a standalone comment passes whatever its bytes
//   F5 :669 test SAFE-N1-skip: a more-indented comment line naming an install in a run: > block runs nothing: rc 0 -> dup U84, UNSUPPORTED: outside G1/Y1/D1 by design (a folded run value)
//   F5 :675 describe F3 fix round -> group U07-U10 F11 A03, -: a describe block: each of its tests is mapped on its own line
//   F5 :711 test F3-a NG_wf_cont_then_comment: echo \\, a comment line, then npm install FAILs at the install line, not joined -> U07, UNSUPPORTED: G1.2 a backslash, then a comment line
//   F5 :715 test F3-b the action form: echo \\, a comment line, then npm install FAILs at the action's install line -> U08, UNSUPPORTED: G1.2 the action form of U07
//   F5 :720 test F3-c PIN the N1 shape: echo with no \\, a comment ending in \\, then npm install FAILs at the install line -> dup F11, FORBIDDEN: no backslash outside the comment: the install line FAILs
//   F5 :724 test F3-d NF_install_cont_comment_echo: npm install \\, a comment line, then echo: ONE FAIL row at line 1, the install alone -> U09, UNSUPPORTED: G1.2 a backslash after an install
//   F5 :728 test F3-e NF_ci_cont_comment_install: npm ci \\, a comment line, then npm install FAILs at line 3; line 1 is npm ci alone -> U10, UNSUPPORTED: G1.2 a backslash after npm ci
//   F5 :735 test SAFE-F3-names PIN: echo \\, a comment line naming npm install, then echo runs no install: rc 0 -> dup U07, UNSUPPORTED: outside G1/Y1/D1 by design (G1.2 a backslash)
//   F5 :738 test SAFE-F3-npm: npm \\, a comment line, then install runs no npm install (the shell runs npm, then install): rc 0 -> dup U05, UNSUPPORTED: outside G1/Y1/D1 by design (G1.2 a backslash)
//   F5 :741 test SAFE-F3-only PIN: a run block's comment line then echo: rc 0, zero row of any kind for the comment line -> dup A03, ALLOWED: a standalone comment then echo
//   F5 :747 describe F4 pin round -> group U07 U08 U11-U13 U85 U86, -: a describe block: each of its tests is mapped on its own line
//   F5 :790 test F4-a PIN comment_backslash: echo \\, a comment ending in \\, then npm install FAILs at the install line alone -> dup U07, UNSUPPORTED: G1.2 a backslash (comments ending in a backslash after it)
//   F5 :794 test F4-b PIN the action form of comment_backslash FAILs at the action's install line alone -> dup U08, UNSUPPORTED: G1.2 a backslash (the action form)
//   F5 :798 test F4-c PIN two_comments: echo \\, two comments ending in \\, then npm install FAILs at the install line alone -> dup U07, UNSUPPORTED: G1.2 a backslash (two comments)
//   F5 :802 test F4-d PIN the action form of two_comments FAILs at the action's install line alone -> dup U08, UNSUPPORTED: G1.2 a backslash (the action form)
//   F5 :807 test SAFE-Q-dq PIN: run: "# npm install <pkg>" (double-quoted) is a shell comment: rc 0, zero FAIL row -> dup U85, UNSUPPORTED: outside G1/Y1/D1 by design (Y1.4 a quoted run value)
//   F5 :810 test SAFE-Q-sq PIN: run: '# npm install <pkg>' (single-quoted) is a shell comment: rc 0, zero FAIL row -> dup U86, UNSUPPORTED: outside G1/Y1/D1 by design (Y1.4 a quoted run value)
//   F5 :813 test PIN-Q-dq: run: "npm install <pkg>" (double-quoted) FAILs at its line naming the package -> dup U85, UNSUPPORTED: Y1.4 a double-quoted run value
//   F5 :817 test PIN-Q-sq: run: 'npm install <pkg>' (single-quoted) FAILs at its line naming the package -> dup U86, UNSUPPORTED: Y1.4 a single-quoted run value
//   F5 :823 test O1-a midword_semicolon: echo a\\ then '#; npm install' at the block indent FAILs with the joined row at line 1 -> U11, UNSUPPORTED: G1.2 a midword backslash
//   F5 :826 test O1-b midword_assign: x=\\ then '#; npm install' at the block indent FAILs with the joined row at line 1 -> U12, UNSUPPORTED: G1.2 x=\
//   F5 :829 test O1-c midword_bs: echo a\\, '#b; npm \\', then install FAILs with the joined row at line 1 -> dup U11, UNSUPPORTED: G1.2 a midword backslash (twice)
//   F5 :832 test O1-d the action form of midword_semicolon FAILs with the joined row at the action's line 1 -> dup U08, UNSUPPORTED: G1.2 a backslash (the action form)
//   F5 :835 test SAFE-O1-ind PIN: echo a\\ then '#; npm install' indented past the block is a comment: rc 0, zero FAIL row -> dup U11, UNSUPPORTED: outside G1/Y1/D1 by design (G1.2 a backslash)
//   F5 :838 test NIT-midword-safe: echo a\\, '#b \\', then npm install (sh runs one echo) FAILs closed with the joined row at line 1 -> dup U11, UNSUPPORTED: outside G1/Y1/D1 by design (G1.2 a backslash)
//   F5 :841 test NIT-blank-cont PIN: echo a \\, an empty line, then npm install FAILs with a row naming the install -> U13, UNSUPPORTED: G1.2 a backslash before an empty line
//   F5 :847 describe F5 final repair -> group U14-U23 U30-U44 A23, -: a describe block: each of its tests is mapped on its own line
//   F5 :893 test F5-R1-esc_blank-wf: echo a\\ \\ then '#; npm install' FAILs with the joined row at line 1 -> U14, UNSUPPORTED: G1.2 an escaped blank before the backslash
//   F5 :896 test F5-R1-esc_blank-ac: the action form of esc_blank FAILs with the joined row at the action's line 1 -> dup U15, UNSUPPORTED: G1.2 a backslash (the action form)
//   F5 :899 test F5-R1-esc_tab-wf: echo a\\<TAB>\\ then '#; npm install' FAILs with the joined row at line 1 -> dup U14, UNSUPPORTED: G1.2 an escaped tab before the backslash
//   F5 :902 test F5-R1-esc_tab-ac: the action form of esc_tab FAILs with the joined row at the action's line 1 -> U15, UNSUPPORTED: G1.2 the action form of the escaped tab
//   F5 :906 test F5-R2-dq_blank-wf: echo "a \\ then \'#"; npm install\' FAILs with the joined row at line 1 -> U32, UNSUPPORTED: G1.4 a double quote open at the line end
//   F5 :909 test F5-R2-dq_blank-ac: the action form of dq_blank FAILs with the joined row at the action's line 1 -> dup U32, UNSUPPORTED: G1.4 (the action form)
//   F5 :912 test F5-R2-sq_blank-wf: echo 'a \\ then '#'; npm install' FAILs with the joined row at line 1 -> U31, UNSUPPORTED: G1.3 a single quote open at the line end
//   F5 :915 test F5-R2-sq_blank-ac: the action form of sq_blank FAILs with the joined row at the action's line 1 -> dup U31, UNSUPPORTED: G1.3 (the action form)
//   F5 :918 test F5-R2-dq_ind-wf: echo "a\\ then an indented \'#"; npm install\' FAILs with the joined row at line 1 -> dup U32, UNSUPPORTED: G1.4 a double quote open (a backslash as its last byte)
//   F5 :921 test F5-R2-dq_ind-ac: the action form of dq_ind FAILs with the joined row at the action's line 1 -> dup U32, UNSUPPORTED: G1.4 (the action form)
//   F5 :924 test F5-R2-sq_ind-wf: echo 'a\\ then an indented '#'; npm install' FAILs with the joined row at line 1 -> dup U31, UNSUPPORTED: G1.3 a single quote open
//   F5 :927 test F5-R2-sq_ind-ac: the action form of sq_ind FAILs with the joined row at the action's line 1 -> dup U31, UNSUPPORTED: G1.3 (the action form)
//   F5 :931 test F5-m1-dq_nobs-wf: echo "a then \'#"; npm install\' FAILs with the joined row at line 1 -> U33, UNSUPPORTED: G1.4 a double quote open with no backslash
//   F5 :934 test F5-m1-dq_nobs-ac: the action form of dq_nobs FAILs with the joined row at the action's line 1 -> dup U33, UNSUPPORTED: G1.4 (the action form)
//   F5 :937 test F5-m1-sq_nobs-wf: echo 'a then '#'; npm install' FAILs with the joined row at line 1 -> U30, UNSUPPORTED: G1.3 a single quote open with no backslash
//   F5 :940 test F5-m1-sq_nobs-ac: the action form of sq_nobs FAILs with the joined row at the action's line 1 -> dup U30, UNSUPPORTED: G1.3 (the action form)
//   F5 :943 test F5-m1-bt_nobs-wf: x=`echo a then '#`; npm install' FAILs with the joined row at line 1 -> U21, UNSUPPORTED: G1.2 a backtick open across lines
//   F5 :946 test F5-m1-bt_nobs-ac: the action form of bt_nobs FAILs with the joined row at the action's line 1 -> dup U21, UNSUPPORTED: G1.2 (the action form)
//   F5 :950 test F5-LONG-dq-wf: echo "a \\, b \\, then \'#"; npm install\' FAILs with the joined row at line 1 -> U35, UNSUPPORTED: G1.4 then G1.2 (two lines)
//   F5 :953 test F5-LONG-dq-ac: the action form of LONG-dq FAILs with the joined row at the action's line 1 -> dup U35, UNSUPPORTED: G1.4 then G1.2 (the action form)
//   F5 :956 test F5-LONG-sq-wf: echo 'a \\, b \\, then '#'; npm install' FAILs with the joined row at line 1 -> dup U35, UNSUPPORTED: G1.3 then G1.2 (the single-quoted form)
//   F5 :960 test F5-T-esc_blank_ctrl-wf: echo a\\ b \\ then '#; npm install' is a comment: rc 0, zero FAIL row -> dup U14, UNSUPPORTED: outside G1/Y1/D1 by design (G1.2 a backslash)
//   F5 :963 test F5-T-dq_closed_blank-wf: echo "a" \\ then \'#; npm install\' is a comment: rc 0, zero FAIL row -> dup U07, UNSUPPORTED: outside G1/Y1/D1 by design (G1.2 a backslash)
//   F5 :966 test F5-T-midword_ind-wf: echo a\\ then an indented '#; npm install' is a comment: rc 0, zero FAIL row -> dup U11, UNSUPPORTED: outside G1/Y1/D1 by design (G1.2 a backslash)
//   F5 :969 test F5-T-sq_closed-wf: echo 'a' \\ then '#; npm install' is a comment: rc 0, zero FAIL row -> dup U07, UNSUPPORTED: outside G1/Y1/D1 by design (G1.2 a backslash)
//   F5 :973 test F5-S580-dq_blankline-wf: echo "a, an empty line, then \'#"; npm install\' FAILs with the joined row at line 1 -> U34, UNSUPPORTED: G1.4 a double quote open across an empty line
//   F5 :976 test F5-S670-fold_dq-wf: run: > echo "a then a more-indented \'#"; npm install\' FAILs with the joined row at line 1 -> dup U82, UNSUPPORTED: Y1.4 a folded run value
//   F5 :979 test F5-S670-one_dq-wf: run: "echo \\"a\\n#\\"; npm install" FAILs with the joined row at its line -> dup U85, UNSUPPORTED: Y1.4 a double-quoted run value
//   F5 :982 test F5-S436-dq_nobs: docker-entrypoint.sh echo "a then \'#"; npm install\' FAILs at its line 3 -> U36, UNSUPPORTED: G1.4 (docker-entrypoint.sh)
//   F5 :986 test F5-S701-dq_nobs: a scripts/*.sh echo "a then \'#"; npm install\' FAILs at its line 3 -> U37, UNSUPPORTED: G1.4 (a script)
//   F5 :989 test F5-S701-esc_blank: a scripts/*.sh echo a\\ \\ then '#; npm install' FAILs at its line 3 -> dup U06, UNSUPPORTED: G1.2 a backslash (a script)
//   F5 :993 test F5-U-bs_trailing_sp-wf: echo a\\ with trailing blanks, then '#; npm install' FAILs closed as unsupported -> dup U11, UNSUPPORTED: G1.2 a backslash with trailing blanks
//   F5 :996 test F5-U-ansic-wf: echo $'a then '#'; npm install' FAILs closed as unsupported -> U42, UNSUPPORTED: G1.6 an ANSI-C quote
//   F5 :999 test F5-U-heredoc-wf: cat <<QZX, '#; npm install', QZX FAILs closed as unsupported -> U22, UNSUPPORTED: G1.2 a heredoc
//   F5 :1002 test F5-U-cs-wf: x=$(echo a then '#); npm install' FAILs closed as unsupported -> A23, ALLOWED: inside G1: a $( outside quotes may span lines; the # line is a comment in sh; no install runs
//   F5 :1005 test F5-U-unbalanced-wf: echo "a then npm install with no closing quote FAILs closed as unsupported -> dup U33, UNSUPPORTED: G1.4 a double quote open at the block's end
//   F5 :1009 test F5-T-nested_subst-wf: one-line $( ) inside quotes, <<< and $(( )) read no unsupported form: rc 0, zero FAIL row -> U38, UNSUPPORTED: G1.4 a $( inside double quotes; G1.2 <<< and an inline #
//   (160 of 160 F5 entries)
// THE MAPPING, part 2: every finding id of the 13 WI-4774 verdicts (verdict file, id -> target, class: reason)
//   opus-tfm-wi4774-u1 (w1 98c4c8a7) M1 -> F14 (F15-F18), FORBIDDEN: a quoted <<EOF is literal (G1); master's base rows stay; the real heredoc is refused
//   opus-tfm-wi4774-u1 (w1 98c4c8a7) m1 -> U61, UNSUPPORTED: PM.3: /usr/bin/npx is not read by npmCalls
//   opus-tfm-wi4774-u1 (w1 98c4c8a7) m2 -> U74 (U75), UNSUPPORTED: Y1.2: a merge key '<< :'
//   opus-tfm-wi4774-u1 (w1 98c4c8a7) m3 -> U82, UNSUPPORTED: Y1.4: a folded run value
//   opus-tfm-wi4774-u1 (w1 98c4c8a7) m4 -> U85 U86 U48 U49 U19, UNSUPPORTED: the quote and backtick boundary: Y1.4, PM.2, G1.2
//   opus-tfm-wi4774-u1 (w1 98c4c8a7) m5 -> U05 U64 U45 U98 U106; A12 F09 A14, UNSUPPORTED: the open forms: G1.2, PM.4, PM.1, D1; A12 is C4 NOT GUARANTEED, F09 is B3 read, A14 is section D
//   opus-tfm-wi4774-u1 (w1 98c4c8a7) m6 -> U76 U77 U27 U60 U105 U28 U79 U70 U88 U71; A13 A14, UNSUPPORTED: one case per sub-rule (the teeth); A13 and A14 as named in THE MAPPING
//   openai-tfm-wi4774-u1 (w1, prejudge-5) R1 -> U83, UNSUPPORTED: Y1.4: a folded run value (>-)
//   openai-tfm-wi4774-u1 (w1, prejudge-5) R2 -> U51 (U52-U56), UNSUPPORTED: PM.2 or PM.3: a quoted or relative npm path
//   opus-tfm-wi4774-u1-f1 (79656fe6) N1 -> F10 (F11 F12), FORBIDDEN: a standalone comment passes whatever its bytes; the next line is read
//   openai-tfm-wi4774-u1-f1 (79656fe6) (none: GREEN C0 M0) -> -, -: no finding id; it confirms m1 to m6, mapped above
//   opus-tfm-wi4774-u1-f2 (76104784) m1 -> U07, UNSUPPORTED: G1.2: a continuation, then a comment line
//   openai-tfm-wi4774-u1-f2 (76104784) F2-R1 -> U07, UNSUPPORTED: the continued_then_comment root is refused: no row to replace
//   opus-tfm-wi4774-u1-f3 (65fdee16) O1 -> U11, UNSUPPORTED: G1.2: a midword backslash
//   openai-tfm-wi4774-u1-f3 (65fdee16) F3-R1 -> U11 U12 U07, UNSUPPORTED: the row-replacement class is the continuation class: refused
//   opus-tfm-wi4774-u1-f4 (72188a8b) F4-R1 -> U14 (U15), UNSUPPORTED: G1.2: an escaped blank or tab before the backslash
//   opus-tfm-wi4774-u1-f4 (72188a8b) F4-R2 -> U32 (U31), UNSUPPORTED: G1.4 or G1.3: a quote open across the backslash-newline
//   opus-tfm-wi4774-u1-f4 (72188a8b) m1 -> U33 U30 U21, UNSUPPORTED: G1.4, G1.3, G1.2: a # line inside a multi-line quote or backtick
//   opus-tfm-wi4774-u1-f4 (72188a8b) NIT 1 -> dup U11, UNSUPPORTED: G1.2: a backslash with trailing blanks
//   opus-tfm-wi4774-u1-f4 (72188a8b) NIT 2 -> dup U14 U32, UNSUPPORTED: the F4 safe twins hold a backslash: outside G1/Y1/D1 by design
//   openai-tfm-wi4774-u1-f4 (72188a8b) (none: GREEN C0 M0) -> -, -: no finding id
//   opus-tfm-wi4774-u1-f5-r2 (10af925b) F5-C1 -> U16, UNSUPPORTED: G1.2: a blank inside an unquoted ${...}, then a backslash
//   opus-tfm-wi4774-u1-f5-r2 (10af925b) F5-C2 -> U17, UNSUPPORTED: G1.2: a ) kept inside a word, then a backslash
//   opus-tfm-wi4774-u1-f5-r2 (10af925b) F5-C3 -> U18, UNSUPPORTED: G1.2: a non-ASCII byte (U+00A0) outside quotes
//   opus-tfm-wi4774-u1-f5-r2 (10af925b) F5-n1 -> U44, UNSUPPORTED: C: a ' inside a double-quoted ${...} (a boundary the rules cannot establish)
//   opus-tfm-wi4774-u1-f5-r2 (10af925b) F5-n2 -> U01, UNSUPPORTED: G1.1: a CR byte (CRLF)
//   opus-tfm-wi4774-u1-f5-r2 (10af925b) NIT A -> U20 (U03), UNSUPPORTED: G1.2: a backtick, an inline #
//   opus-tfm-wi4774-u1-f5-r2 (10af925b) NIT B -> U13, UNSUPPORTED: G1.2: a backslash before an empty line
//   opus-tfm-wi4774-u1-f5-r2 (10af925b) NIT C -> dup U82 U11, UNSUPPORTED: no new form: the folded and midword forms
//   openai-tfm-wi4774-u1-f5-r2 (prejudge-9) R1 -> U03, UNSUPPORTED: G1.2: an inline comment suffix
//   openai-tfm-wi4774-u1-f5-r2 (prejudge-9) R2 -> U13, UNSUPPORTED: G1.2: a backslash before an empty line
//   openai-tfm-wi4774-u1-f5-r2 (prejudge-9) m2 -> U44, UNSUPPORTED: C: quotes inside a quoted parameter expansion
//   openai-tfm-wi4774-u1-f5.r2 (prejudge-3) R1 -> U32 (U03), UNSUPPORTED: safe quoted or comment text: refused, never an asserted install
//   openai-tfm-wi4774-u1-f5.r2 (prejudge-3) R2 -> U16, UNSUPPORTED: G1.2: an unquoted parameter expansion before a backslash
//   (32 finding ids in 13 verdict files)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK = resolve(HERE, "..", "check-npm-install-sites.mjs");
const REPO = resolve(HERE, "..", "..");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const MOUNT = "--mount=type=secret,id=arkon_npm_token,env=ARKON_NPM_TOKEN";
const MARK = "# QZX4821MARK synthetic fixture";
const P = "qzx4821-pkg";
const WF = ".github/workflows/probe.yml";
const AC = ".github/actions/probe/action.yml";
const SH = "scripts/probe.sh";
const EN = "docker-entrypoint.sh";

// ---------- fixtures ----------
const dockerfile = (extra = []) => [
  MARK, "FROM node:20-alpine AS deps", "WORKDIR /app", "COPY package.json package-lock.json .npmrc ./",
  `RUN ${MOUNT} npm ci --omit=dev`, ...extra,
  "FROM node:20-alpine AS runtime", "WORKDIR /app", "COPY --from=deps /app/node_modules ./node_modules", "",
].join("\n");
// the runtime stage with lines appended (line 9 on)
const dockerRt = (extra = []) => [
  MARK, "FROM node:20-alpine AS deps", "WORKDIR /app", "COPY package.json package-lock.json .npmrc ./",
  `RUN ${MOUNT} npm ci --omit=dev`,
  "FROM node:20-alpine AS runtime", "WORKDIR /app", "COPY --from=deps /app/node_modules ./node_modules", ...extra, "",
].join("\n");
const IMAGE_BUILD = [
  MARK, "name: image-build", "on:", "  push:", "    branches: [master]", "  pull_request:", "    branches: [master]",
  "permissions:", "  contents: read", "jobs:", "  image-stages:", "    runs-on: ubuntu-latest", "    steps:",
  `      - uses: actions/checkout@${SHA}`,
  "      - name: Check every npm install site",
  "        run: node scripts/check-npm-install-sites.mjs .",
  "      - name: Fork pull request, no registry token",
  "        if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository",
  '        run: echo "fork, the token stage is skipped"',
  "      - name: Build the deps stage",
  "        if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository",
  "        env:",
  "          ARKON_NPM_TOKEN: ${{ secrets.ARKON_NPM_TOKEN }}",
  "        run: |",
  "          docker buildx build --secret id=arkon_npm_token,env=ARKON_NPM_TOKEN --target deps .", "",
].join("\n");
const BASE = {
  "package.json": JSON.stringify({ name: "qzx4821mark-fixture", version: "0.0.0", private: true, description: "QZX4821MARK synthetic fixture" }, null, 2) + "\n",
  "package-lock.json": JSON.stringify({ name: "qzx4821mark-fixture", version: "0.0.0", lockfileVersion: 3, requires: true, packages: { "": { name: "qzx4821mark-fixture", version: "0.0.0" } } }, null, 2) + "\n",
  ".npmrc": MARK + "\n@arkon-ai:registry=https://npm.pkg.github.com\n",
  Dockerfile: dockerfile(),
  ".github/workflows/image-build.yml": IMAGE_BUILD,
};
// a workflow: its first step line is line 10 (+ the top and job lines given)
const workflow = (steps, { top = [], job = [] } = {}) => [
  MARK, "name: fixture", "on:", "  pull_request:", ...top, "jobs:", "  test:", "    runs-on: ubuntu-latest", ...job,
  "    steps:", `      - uses: actions/checkout@${SHA}`, ...steps, "",
].join("\n");
const wf = (steps, opts) => ({ [WF]: workflow(steps, opts) });
const wfOne = (v) => wf([`      - run: ${v}`]); // the run at :10
const wfRun = (ls) => wf(["      - run: |", ...ls.map((l) => (l === "" ? "" : `          ${l}`))]); // run :10, k-th line :10+k
// a composite action: its run is line 7
const action = (run) => [MARK, "name: a", "description: QZX4821MARK synthetic composite action", "runs:", "  using: composite", "  steps:", `    - run: ${run}`, "      shell: bash", ""].join("\n");
const acOne = (v) => ({ [AC]: action(v) });
const acRun = (ls) => ({ [AC]: action(["|", ...ls.map((l) => (l === "" ? "" : `        ${l}`))].join("\n")) }); // run :7, k-th line :7+k
const sh = (ls, f = SH) => ({ [f]: ["#!/bin/sh", MARK, ...ls, ""].join("\n") }); // k-th line :2+k
const entry = (ls) => sh([...ls, 'exec "$@"'], EN);
// package.json with its scripts one per line: the k-th script is line 5+k; raw lines are written as given
const pkgRaw = (lines) => ({ "package.json": ["{", '  "name": "qzx4821mark-fixture",', '  "version": "0.0.0",', '  "description": "QZX4821MARK synthetic fixture",', ...lines, "}", ""].join("\n") });
const pkg = (scripts) => {
  const e = Object.entries(scripts);
  return pkgRaw(['  "scripts": {', ...e.map(([k, v], i) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}${i < e.length - 1 ? "," : ""}`), "  }"]);
};

function run(files) {
  const root = mkdtempSync(join(tmpdir(), "wi4821-check-"));
  for (const [rel, text] of Object.entries({ ...BASE, ...files })) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  const r = spawnSync(process.execPath, [CHECK, root], { encoding: "utf8" });
  const lines = (r.stdout || "").split("\n");
  const fails = lines.filter((l) => l.includes(" FAIL: ") && !l.startsWith("T1 RESULT"));
  const brief = lines.filter((l) => / FAIL|^T1 RESULT/.test(l)).join("\n") + (r.stderr ? `\nstderr bytes ${r.stderr.length}` : "");
  return { rc: r.status, lines, fails, brief };
}

// ---------- the rows ----------
const K = {
  cr: "G1.1 a CR byte",
  ctl: "G1.1 a control byte",
  hash: "G1.2 a # that is not the line's first non-blank byte",
  bs: "G1.2 a backslash outside quotes",
  bt: "G1.2 a backtick outside quotes",
  na: "G1.2 a non-ASCII byte outside quotes",
  hd: "G1.2 a << (a heredoc or a here-string)",
  sq: "G1.3 a single quote open at the line end",
  dq: "G1.4 a double quote open at the line end",
  dqbt: "G1.4 a backtick inside double quotes",
  dqsub: "G1.4 a $( inside double quotes",
  dqesc: "G1.4 an escaping backslash inside double quotes",
  expr: "G1.5 a ${{ expression in a run value",
  qopen: "G1.6 a quote that opens inside a word",
  qclose: "G1.6 a quote that closes inside a word",
  cq: "C a ' inside a double-quoted ${...} (a quote boundary the rules cannot establish)",
  pm1: "PM.1 a ${ or $( on a package-manager line",
  pm2: "PM.2 a package-manager word inside quotes",
  pm3: "PM.3 a package-manager word that npmCalls does not read",
  pm4: "PM.4 an option right after the package-manager word",
  pm5: "PM.5 a sub-command word that npmCalls does not read whole",
  pm6: "PM.6 a package-manager name in a line that holds ${",
  y11cr: "Y1.1 a CR byte",
  y11tab: "Y1.1 a tab in the indentation",
  y11doc: "Y1.1 a document marker or a directive",
  y12: "Y1.2 an anchor, an alias, a tag or a merge key",
  y13: "Y1.3 a flow value, a quoted key or a ? key under jobs:",
  y13ac: "Y1.3 a flow value, a quoted key or a ? key under runs:",
  y14hdr: "Y1.4 a block scalar header the reader does not read",
  y14ml: "Y1.4 an empty or a multi-line plain run value",
  y14fold: "Y1.4 a folded, keep or indented block run value",
  y14q: "Y1.4 a quoted, flow or tagged run value",
  y15: "Y1.5 a shell: other than bash or sh",
  c0run: "C0 a run line the reader did not extract",
  c0hash: "C0 a # in a plain run value",
  c0ind: "C0 a block line indented less than the block's first line",
  c0esc: "C0 a backslash escape in the package.json string",
  c0shape: 'C0 the scripts block is not one "key": "value" string per line',
  d1dir: "D1 a parser directive",
  d1shell: "D1 a SHELL instruction",
  d1onbuild: "D1 an ONBUILD instruction",
  d1exec: "D1 an exec-form RUN",
  d1cmd: "D1 a package-manager word in CMD, ENTRYPOINT or HEALTHCHECK",
};
const more = (n) => (n ? ` and ${n} more` : "");
// one container refused: its row line, its first miss and its line, and the count of further miss lines
const U = (f, ln, kind, at = ln, n = 0) => `UNSUPPORTED ${f}:${ln} FAIL: ${kind} at :${at}${more(n)}`;
const UF = (f, at, kind, n = 0) => `UNSUPPORTED ${f}:${at} FAIL: ${kind} at :${at}${more(n)} (the whole file: no step read)`;
const UD = (at, kind, n = 0) => `UNSUPPORTED Dockerfile:${at} FAIL: ${kind} at :${at}${more(n)} (the whole Dockerfile: no RUN read)`;
const UP = (ln, kind, k) => `UNSUPPORTED package.json:${ln} FAIL: ${kind} at :${ln} (scripts.${k})`;
const UL = (where) => `CHECK ${where} FAIL: UNLISTED: a build file outside the manifest`;
// master's policy rows (section D: unchanged)
const S = (f, ln, cmd, text = "npm install") => `SITE ${f}:${ln} FAIL: "${cmd}": '${text}' can fetch a package by name (not from the lock)`;
const SD = (ln, stage, body) => `SITE Dockerfile:${ln} FAIL: stage=${stage} "${body}": 'npm install' can fetch a package by name from a registry (not from the lock)`;
const SR = (ln, body) => `SITE Dockerfile:${ln} FAIL: stage=runtime "${body}": a registry install in the runtime stage (npm install, no lock, no .npmrc)`;
const SE = (ln, cmd) => `SITE docker-entrypoint.sh:${ln} FAIL: 'npm install' at container start can fetch from a registry (${cmd})`;
const SP = (k) => `SITE package.json scripts.${k} FAIL: 'npm install' can fetch a package by name`;
const ARG_TOKEN = (ln) => `CHECK Dockerfile:${ln} FAIL: ARG names a token (ARG NPM_TOKEN): a token in a build arg or env lands in the image history`;
const RT_NPMRC = (ln) => `CHECK Dockerfile:${ln} FAIL: stage runtime (runtime) copies .npmrc`;
const OK_WF = (f, ln, cmd) => `SITE ${f}:${ln} OK: "${cmd}": npm ci from the lock in the checkout; the checked-out repo .npmrc pins the scope`;
const OK_DEPS = 'SITE Dockerfile:5 OK: stage=deps "npm ci --omit=dev": npm ci from the lock; .npmrc copied at :4; token by the secret mount only';

// the D08 root (Opus w1 M1): a runtime stage that copies .npmrc and names a token in an ARG, then a RUN heredoc
const d08 = (opener) => ({ Dockerfile: dockerRt([opener, "COPY .npmrc ./", "ARG NPM_TOKEN", "RUN cat <<EOF", "built", "EOF"]) });
const tokenEnv = "${{ secrets.ARKON_NPM_TOKEN }}";

// ---------- the cases ----------
const CASES = [];
const c = (id, cls, what, files, want = [], has = []) => CASES.push({ id, cls, what, files, want, has });

// ALLOWED: the positive controls; each must read rc 0 with zero FAIL row
c("A01", "ALLOWED", "one plain npm ci in a workflow, a run block, a script and the deps stage", { // src: F5 :114 CONTROL-OK
  [WF]: workflow(["      - run: npm ci", "      - name: block form", "        run: |", "          npm ci", "          npm test"]),
  ...sh(["npm ci"]) }, [], [OK_DEPS, OK_WF(WF, 10, "npm ci"), OK_WF(WF, 13, "npm ci"), 'SITE scripts/probe.sh:3 OK: "npm ci": npm ci from the lock; the repo .npmrc travels with it']);
c("A02", "ALLOWED", "plain non-install lines in every container type", { // src: r3a F ALLOWED (plain non-install lines)
  ...wfRun(["echo built", "node --version"]), ...acOne("echo built"), ...sh(["echo built"]), ...entry(["node scripts/migrate.js"]),
  Dockerfile: dockerfile(["RUN echo built"]), ...pkg({ build: "next build", start: "node server.js" }) });
c("A03", "ALLOWED", "standalone comment lines, one naming an install and ending in a backslash", wfRun([`# npm install ${P} \\`, "echo b", "# a comment", "echo c"])); // src: F5 :663 SAFE-N1, :741 SAFE-F3-only
c("A04", "ALLOWED", "plain env maps at workflow, job and container level", wf(["      - run: npm ci"], { top: ["env:", "  QZX_LEVEL: plain"], job: ["    container:", "      image: node:20-alpine", "      env:", "        QZX_LEVEL: plain", "    env:", "      PG_BASE_URL: postgresql://127.0.0.1:5432"] }),
  [], [OK_WF(WF, 18, "npm ci")]); // src: F5 :158, :172, :487, :589, :593 (the plain env SAFE twins)
c("A05", "ALLOWED", "a double-quoted string with a literal backslash-dot", wfRun(['grep -c "a\\.b" README.md || true'])); // src: r3a F ALLOWED; G1.4 control
c("A06", "ALLOWED", "a non-ASCII byte inside a closed quote", wfRun(['echo "café"', "echo 'naïve'"])); // src: r3a F ALLOWED; G1.2 control
c("A07", "ALLOWED", "branches: [master] outside jobs", wf(["      - run: npm ci"], { top: ["  push:", "    branches: [master]"] })); // src: r3a F ALLOWED; Y1.3 control
c("A08", "ALLOWED", "a composite action's run: npm ci prints its SITE OK row", acOne("npm ci"), [], [OK_WF(AC, 7, "npm ci")]); // src: F5 :479 m5-g SAFE twin
c("A09", "ALLOWED", "CMD [node, server.js] holds no package-manager word", { Dockerfile: dockerRt(['CMD ["node", "server.js"]']) }); // src: F5 :460 m5-f SAFE twin
c("A10", "ALLOWED", "$PY install (a name with no package-manager word)", wfOne("$PY install qzx4821-x")); // src: F5 :427 m5-d SAFE twin
c("A11", "ALLOWED", "npx of a tool reads as master's NOTE", wfOne("npx qzx4821-tool --help"), [], // src: F5 :324 m1 SAFE twin
  [`NOTE ${WF}:10: "npx qzx4821-tool --help": npx qzx4821-tool is NOT in the lock: npx fetches it by name from the default registry (a public name, not @arkon-ai)`]);
c("A12", "ALLOWED", "C4 limit: a command name in a variable is NOT GUARANTEED", { // src: F5 :416 m5-d Y14, :420 m5-d D06
  ...wf(["      - env:", "          NPM_BIN: npm", `        run: $NPM_BIN install ${P}`]), Dockerfile: dockerfile(["ENV NPM_BIN=npm", `RUN $NPM_BIN install ${P}`]) });
c("A13", "ALLOWED", "a COPY heredoc writes a file and runs nothing (D1 reads RUN)", { Dockerfile: dockerfile(["COPY <<EOF /app/qzx4821.txt", "built", "EOF"]) }); // src: F5 :505 m6 PIN COPY heredoc
c("A14", "ALLOWED", "workflow, job and container env rows: master's policy has no env row outside image-build (section D)", wf(["      - run: npm ci"], { // src: F5 :150 F3, :164 F4, :483 m5-h, :501, :529, :533
  top: ["env:", `  ARKON_NPM_TOKEN: ${tokenEnv}`], job: ["    container:", "      image: node:20-alpine", "      env:", `        ARKON_NPM_TOKEN: ${tokenEnv}`, "    env:", "      NODE_AUTH_TOKEN: plain", "      QZX_A:", "        QZX_B: plain"] }));
c("A15", "ALLOWED", "PM.5 control: npm ci with options and npm run", wfRun(["npm ci --omit=dev --no-audit", "npm run build", "npm test"])); // src: r3a F PLUS (PM.5 control)
c("A16", "ALLOWED", "PM.6 control: a ${ line with no package-manager name", wfRun(["echo ${HOME}/qzx4821", 'x="${PG_BASE_URL:-postgresql://127.0.0.1}"'])); // src: r3a F PLUS (PM.6 control)
c("A17", "ALLOWED", "control-byte control: a tab inside a line", wfRun(["echo a\tb", "npm ci\t--omit=dev"])); // src: r3a F PLUS (G1.1 control)
c("A18", "ALLOWED", "C0 control: a run block with blank lines kept, and a scripts value with no escape", { // src: r3a F PLUS (C0 control)
  ...wfRun(["echo a", "", "npm ci"]), ...pkg({ build: "next build", check: "node scripts/check.mjs && echo done" }) }, [], [OK_WF(WF, 13, "npm ci")]);
c("A19", "ALLOWED", "Y1.5 control: shell: bash on a step and defaults: run: shell: sh", wf(["      - run: npm ci", "        shell: bash"], { top: ["defaults:", "  run:", "    shell: sh"] })); // src: r3a C2 Y1.5
c("A20", "ALLOWED", "Y1.1 control: one --- as the first line", { [WF]: "---\n" + workflow(["      - run: npm ci"]) }); // src: r3a C2 Y1.1
c("A21", "ALLOWED", "a step uses: ./ that names a B3 action file", { ...wf(["      - uses: ./.github/actions/probe"]), ...acOne("echo built") }); // src: r3a B8 (uses ./)
c("A22", "ALLOWED", "B7 exclusions: lefthook, .lefthook, docs, ISSUE_TEMPLATE, dependabot and a compose file with no package-manager word", { // src: r3a B7
  "lefthook.yml": MARK + "\npre-commit:\n  commands:\n    tsc:\n      run: npx tsc --noEmit\n", ".lefthook/gate.sh": MARK + "\nnpm install " + P + "\n",
  "docs/example.sh": MARK + "\nnpm install " + P + "\n", ".github/ISSUE_TEMPLATE/bug.yml": MARK + "\nname: bug\n", ".github/dependabot.yml": MARK + "\nversion: 2\n",
  "docker-compose.yml": MARK + "\nservices:\n  app:\n    build: .\n" });
c("A23", "ALLOWED", "a $( outside quotes left open across lines runs no install (sh: the # line is a comment inside it)", wfRun(["x=$(echo a", `#); npm install ${P}`])); // src: F5 :1002 F5-U-cs-wf
c("A24", "ALLOWED", "a quoted <<EOF opens nothing; << inside quotes is literal", { Dockerfile: dockerfile(['RUN echo "<<EOF"', "RUN echo '<<EOF'"]) }); // src: F5 :264, :268 (the quoted opener, alone)
c("A25", "ALLOWED", "the docker-entrypoint.sh form of master: node scripts/migrate.js", entry(["set -e", "node scripts/migrate.js"]), [], ["CHECK docker-entrypoint.sh OK: zero npm/npx/yarn/pnpm call"]); // src: r3a F (container type)

// FORBIDDEN: supported, and master's policy row says FAIL
c("F01", "FORBIDDEN", "Joseph 1.3 control: run: | / npm install P", wfRun([`npm install ${P}`]), [S(WF, 11, `npm install ${P}`)]); // src: JOSEPH-VIEW 1.3 row 1
c("F02", "FORBIDDEN", "Joseph 1.3 control: RUN npm install P", { Dockerfile: dockerfile([`RUN npm install ${P}`]) }, [SD(6, "deps", `npm install ${P}`)]); // src: JOSEPH-VIEW 1.3 row 6
c("F03", "FORBIDDEN", "an install in the runtime stage", { Dockerfile: dockerRt([`RUN npm install ${P}`]) }, [SR(9, `npm install ${P}`)]); // src: r3a D (runtime-stage install)
c("F04", "FORBIDDEN", "npm ci with missing prerequisites (no COPY, no .npmrc, no secret mount)", { Dockerfile: dockerfile(["FROM node:20-alpine AS other", "RUN npm ci"]) }, // src: r3a D (missing prerequisites)
  ['SITE Dockerfile:7 FAIL: stage=other "npm ci": no package.json + package-lock.json COPY before it; no .npmrc COPY before it (the @arkon-ai scope is not pinned); no secret mount (type=secret,id=arkon_npm_token,env=ARKON_NPM_TOKEN) on this RUN']);
c("F05", "FORBIDDEN", "a token named in an ARG", { Dockerfile: dockerfile(["ARG NPM_TOKEN"]) }, [ARG_TOKEN(6)]); // src: r3a D (token in ARG or ENV)
c("F06", "FORBIDDEN", "docker-entrypoint.sh: npm install at container start", entry([`npm install ${P}`]), [SE(3, `npm install ${P}`)]); // src: r3a D (docker-entrypoint.sh)
c("F07", "FORBIDDEN", "a script: npm install, and npm ci after a cd with no .npmrc", { ...sh([`npm install ${P}`]), ...sh(["cd /srv", "npm ci"], "scripts/other.sh") }, // src: r3a D (scripts)
  ['SITE scripts/other.sh:4 FAIL: "npm ci": npm ci from the lock; it changes dir and does not copy the repo .npmrc', S(SH, 3, `npm install ${P}`)]);
c("F08", "FORBIDDEN", "a package.json script: npm install P", pkg({ build: "next build", setup: `npm install ${P}` }), [SP("setup")]); // src: r3a D (package.json scripts)
c("F09", "FORBIDDEN", "a composite action's run: npm install P", acOne(`npm install ${P}`), [S(AC, 7, `npm install ${P}`)]); // src: F5 :475 m5-g Y21
c("F10", "FORBIDDEN", "a comment ending in a backslash, then npm install: the install line FAILs", wfRun([`# install deps \\`, `npm install ${P}`]), [S(WF, 12, `npm install ${P}`)]); // src: F5 :640 N1-a; opus f1 N1
c("F11", "FORBIDDEN", "echo, a comment ending in a backslash, then npm install", wfRun(["echo start", "# install deps \\", `npm install ${P}`]), [S(WF, 13, `npm install ${P}`)]); // src: F5 :644 N1-b, :720 F3-c
c("F12", "FORBIDDEN", "the action form: a comment ending in a backslash, then npm install", acRun(["# install deps \\", `npm install ${P}`]), [S(AC, 9, `npm install ${P}`)]); // src: F5 :648 N1-c
c("F13", "FORBIDDEN", "a comment with no backslash, then npm install", wfRun(["# install deps", `npm install ${P}`]), [S(WF, 12, `npm install ${P}`)]); // src: F5 :652 PIN-N1-ctl
c("F14", "FORBIDDEN", 'D08 with a double-quoted "<<EOF": both base rows stay, the real heredoc is refused', d08('RUN echo "<<EOF"'), [U("Dockerfile", 12, K.hd), ARG_TOKEN(11), RT_NPMRC(10)]); // src: F5 :264 M1-a; opus w1 M1
c("F15", "FORBIDDEN", "D08 with a single-quoted '<<EOF'", d08("RUN echo '<<EOF'"), [U("Dockerfile", 12, K.hd), ARG_TOKEN(11), RT_NPMRC(10)]); // src: F5 :268 M1-b
c("F16", "FORBIDDEN", "a quoted <<EOF before FROM: the runtime install keeps its row", { Dockerfile: [MARK, "FROM node:20-alpine AS deps", "WORKDIR /app", "COPY package.json package-lock.json .npmrc ./", // src: F5 :272 M1-c
  `RUN ${MOUNT} npm ci --omit=dev`, 'RUN echo "<<EOF"', "FROM node:20-alpine AS runtime", "WORKDIR /app", `RUN npm install ${P}`, "RUN cat <<EOF", "built", "EOF", ""].join("\n") },
  [U("Dockerfile", 10, K.hd), SR(9, `npm install ${P}`)]);
c("F17", "FORBIDDEN", "D08 with no quoted opener keeps both base rows", { Dockerfile: dockerRt(["COPY .npmrc ./", "ARG NPM_TOKEN", "RUN cat <<EOF", "built", "EOF"]) }, // src: F5 :291 M1-d
  [U("Dockerfile", 11, K.hd), ARG_TOKEN(10), RT_NPMRC(9)]);
c("F18", "FORBIDDEN", "D08 with a <<EOF after a shell comment: both base rows stay", d08("RUN echo hi # <<EOF"), [U("Dockerfile", 9, K.hash), U("Dockerfile", 12, K.hd), ARG_TOKEN(11), RT_NPMRC(10)]); // src: F5 :298 M1-e

// UNSUPPORTED: outside G1, Y1 or D1; one row, its kind, and no line of the container reaches STAGE 2
// the six probe roots of Joseph 1.3: the four fail-open ones
c("UJ2", "UNSUPPORTED", "Joseph 1.3: a plain run scalar over two lines", wf(["      - name: folded", "        run: npm", `          install ${P}`]), [UF(WF, 11, K.y14ml)]); // src: JOSEPH-VIEW 1.3 row 2; F5 :180
c("UJ3", "UNSUPPORTED", "Joseph 1.3: a YAML double-quoted escape", wfOne(`"\\x6epm install ${P}"`), [UF(WF, 10, K.y14q)]); // src: JOSEPH-VIEW 1.3 row 3
c("UJ4", "UNSUPPORTED", "Joseph 1.3: a tool word split by quotes", wfRun([`n"p"m install ${P}`]), [U(WF, 10, K.qopen, 11)]); // src: JOSEPH-VIEW 1.3 row 4
c("UJ5", "UNSUPPORTED", "Joseph 1.3: a RUN heredoc", { Dockerfile: dockerfile(["RUN <<EOF", `npm install ${P}`, "EOF"]) }, [U("Dockerfile", 6, K.hd)]); // src: JOSEPH-VIEW 1.3 row 5; F5 :199 F7
// G1
c("U01", "UNSUPPORTED", "G1.1: a CRLF script", { [SH]: ["#!/bin/sh", MARK, "echo a\\", `#; npm install ${P}`, ""].join("\r\n") }, [U(SH, 1, K.cr, 1, 3)]); // src: opus f5 F5-n2
c("U02", "UNSUPPORTED", "G1.1: a vertical tab between npm and its word", wfRun([`npm\u000binstall ${P}`]), [U(WF, 10, K.ctl, 11)]); // src: r3a C1 G1.1 (npmCalls' \s matches \v)
c("U03", "UNSUPPORTED", "G1.2: an inline comment suffix", wfRun([`echo a #; npm install ${P}`]), [U(WF, 10, K.hash, 11)]); // src: prejudge-9 f5-r2 R1
c("U04", "UNSUPPORTED", "G1.2: $# is a # that is not the first byte", wfRun(["echo $#"]), [U(WF, 10, K.hash, 11)]); // src: r3a C1 G1.2 ($#, ${#x})
c("U05", "UNSUPPORTED", "G1.2: a continuation splitting npm and install in a run block", wfRun(["npm \\", `  install ${P}`]), [U(WF, 10, K.bs, 11)]); // src: F5 :392 m5-a Y05, :656 PIN-N1-cont
c("U06", "UNSUPPORTED", "G1.2: a continuation in a script", sh(["npm \\", `  install ${P}`]), [U(SH, 3, K.bs)]); // src: F5 :396 m5-a S01
c("U07", "UNSUPPORTED", "G1.2: echo \\, a comment line, then npm install", wfRun(["echo a \\", "# c", `npm install ${P}`]), [U(WF, 10, K.bs, 11)]); // src: F5 :711 F3-a; openai f2 F2-R1; opus f2 m1
c("U08", "UNSUPPORTED", "G1.2: the action form of a continuation then a comment", acRun(["echo a \\", "# c", `npm install ${P}`]), [U(AC, 7, K.bs, 8)]); // src: F5 :715 F3-b
c("U09", "UNSUPPORTED", "G1.2: npm install \\, a comment, then echo", wfRun([`npm install ${P} \\`, "# c", "echo b"]), [U(WF, 10, K.bs, 11)]); // src: F5 :724 F3-d
c("U10", "UNSUPPORTED", "G1.2: npm ci \\, a comment, then npm install", wfRun(["npm ci \\", "# c", `npm install ${P}`]), [U(WF, 10, K.bs, 11)]); // src: F5 :728 F3-e
c("U11", "UNSUPPORTED", "G1.2: a midword backslash then '#; npm install'", wfRun(["echo a\\", `#; npm install ${P}`]), [U(WF, 10, K.bs, 11)]); // src: F5 :823 O1-a; opus f3 O1; openai f3 F3-R1
c("U12", "UNSUPPORTED", "G1.2: x=\\ then '#; npm install'", wfRun(["x=\\", `#; npm install ${P}`]), [U(WF, 10, K.bs, 11)]); // src: F5 :826 O1-b
c("U13", "UNSUPPORTED", "G1.2: a backslash, an empty line, then npm install", wfRun(["echo a \\", "", `npm install ${P}`]), [U(WF, 10, K.bs, 11)]); // src: F5 :841 NIT-blank-cont; opus f5 NIT B; prejudge-9 R2
c("U14", "UNSUPPORTED", "G1.2: an escaped blank before the backslash", wfRun(["echo a\\ \\", `#; npm install ${P}`]), [U(WF, 10, K.bs, 11)]); // src: F5 :893 F5-R1-esc_blank-wf; opus f4 F4-R1
c("U15", "UNSUPPORTED", "G1.2: an escaped tab before the backslash, the action form", acRun(["echo a\\\t\\", `#; npm install ${P}`]), [U(AC, 7, K.bs, 8)]); // src: F5 :902 F5-R1-esc_tab-ac
c("U16", "UNSUPPORTED", "G1.2: a blank inside an unquoted ${...} then a backslash", wfRun(["echo ${x:- a}\\", `#; npm install ${P}`]), [U(WF, 10, K.bs, 11)]); // src: opus f5 F5-C1; prejudge-3 R2
c("U17", "UNSUPPORTED", "G1.2: a ) kept inside a word then a backslash", wfRun(["echo a)b\\", `#; npm install ${P}`]), [U(WF, 10, K.bs, 11)]); // src: opus f5 F5-C2
c("U18", "UNSUPPORTED", "G1.2: U+00A0 before the backslash", wfRun(["echo a \\", `#; npm install ${P}`]), [U(WF, 10, K.na, 11)]); // src: opus f5 F5-C3
c("U19", "UNSUPPORTED", "G1.2: a backtick command substitution holding npm install", wfOne(`echo \`npm install ${P}\``), [U(WF, 10, K.bt)]); // src: F5 :382 m4-e
c("U20", "UNSUPPORTED", "G1.2: a backtick then an inline comment", wfRun([`x=\`echo a\` #; npm install ${P}`]), [U(WF, 10, K.bt, 11)]); // src: opus f5 NIT A
c("U21", "UNSUPPORTED", "G1.2: a backtick open across lines", wfRun(["x=`echo a", `#\`; npm install ${P}`]), [U(WF, 10, K.bt, 11)]); // src: F5 :943 F5-m1-bt_nobs-wf
c("U22", "UNSUPPORTED", "G1.2: a heredoc in a run block", wfRun(["cat <<QZX", `#; npm install ${P}`, "QZX"]), [U(WF, 10, K.hd, 11)]); // src: F5 :999 F5-U-heredoc-wf
c("U23", "UNSUPPORTED", "G1.2: a here-string", wfRun(['grep -c a <<<"$x"']), [U(WF, 10, K.hd, 11)]); // src: r3a C1 G1.2 (here-string)
c("U24", "UNSUPPORTED", "G1.2: a heredoc after a quoted word on the same RUN", { Dockerfile: dockerfile(['RUN echo "start" && sh <<EOF', `npm install ${P}`, "EOF"]) }, [U("Dockerfile", 6, K.hd)]); // src: F5 :302 M1-f
c("U25", "UNSUPPORTED", "G1.2: RUN <<'EOF'", { Dockerfile: dockerfile(["RUN <<'EOF'", `npm install ${P}`, "EOF"]) }, [U("Dockerfile", 6, K.hd)]); // src: F5 :306 M1-g
c("U26", "UNSUPPORTED", "G1.2: RUN cat<<EOF glued in a word", { Dockerfile: dockerfile(["RUN cat<<EOF", `npm install ${P}`, "EOF"]) }, [U("Dockerfile", 6, K.hd)]); // src: F5 :310 M1-h
c("U27", "UNSUPPORTED", "G1.2: an unterminated RUN heredoc", { Dockerfile: dockerRt(["RUN cat <<EOF", "built"]) }, [U("Dockerfile", 9, K.hd)]); // src: F5 :509 m6 PIN
c("U28", "UNSUPPORTED", "G1.2: /run/secrets in a heredoc RUN", { Dockerfile: dockerfile(["RUN <<EOF", "cat /run/secrets/qzx4821", "EOF"]) }, [U("Dockerfile", 6, K.hd)]); // src: F5 :521 m6 PIN
c("U29", "UNSUPPORTED", "G1.2: a RUN continued by a backslash", { Dockerfile: dockerfile(["RUN echo a && \\", `    npm install ${P}`]) }, [U("Dockerfile", 6, K.bs)]); // src: r3a C3 D1 (a continued RUN)
c("U30", "UNSUPPORTED", "G1.3: a single quote open at the line end", wfRun(["echo 'a", `#'; npm install ${P}`]), [U(WF, 10, K.sq, 11)]); // src: F5 :937 F5-m1-sq_nobs-wf; opus f4 m1
c("U31", "UNSUPPORTED", "G1.3: a single quote open across a backslash-newline", wfRun(["echo 'a \\", `#'; npm install ${P}`]), [U(WF, 10, K.sq, 11)]); // src: F5 :912 F5-R2-sq_blank-wf
c("U32", "UNSUPPORTED", "G1.4: a double quote open across a backslash-newline", wfRun(['echo "a \\', `#"; npm install ${P}`]), [U(WF, 10, K.dq, 11)]); // src: F5 :906 F5-R2-dq_blank-wf; opus f4 F4-R2; prejudge-3 R1
c("U33", "UNSUPPORTED", "G1.4: a double quote open with no backslash", wfRun(['echo "a', `#"; npm install ${P}`]), [U(WF, 10, K.dq, 11)]); // src: F5 :931 F5-m1-dq_nobs-wf; opus f4 m1
c("U34", "UNSUPPORTED", "G1.4: a double quote open across an empty line", wfRun(['echo "a', "", `#"; npm install ${P}`]), [U(WF, 10, K.dq, 11)]); // src: F5 :973 F5-S580-dq_blankline-wf
c("U35", "UNSUPPORTED", "G1.4: a double quote then a backslash line", wfRun(['echo "a \\', "b \\", `#"; npm install ${P}`]), [U(WF, 10, K.dq, 11, 1)]); // src: F5 :950 F5-LONG-dq-wf
c("U36", "UNSUPPORTED", "G1.4: the entrypoint form of an open double quote", entry(['echo "a', `#"; npm install ${P}`]), [U(EN, 3, K.dq)]); // src: F5 :982 F5-S436-dq_nobs
c("U37", "UNSUPPORTED", "G1.4: the script form of an open double quote", sh(['echo "a', `#"; npm install ${P}`]), [U(SH, 3, K.dq)]); // src: F5 :986 F5-S701-dq_nobs
c("U38", "UNSUPPORTED", "G1.4: a $( inside double quotes, a here-string and a comment suffix", wfRun(['x="$(echo "a" | tr a b)"', `y="$(grep -c '^a' <<<"$x" || true)"`, "z=$(( ( $(date +%s) - 1 ) / 2 ))", 'echo "$x $y $z" # it\'s done']), // src: F5 :1009 F5-T-nested_subst-wf
  [U(WF, 10, K.dqsub, 11, 2)]);
c("U39", "UNSUPPORTED", "G1.4: a backtick inside double quotes", wfRun(['echo "a `date`"']), [U(WF, 10, K.dqbt, 11)]); // src: r3a C1 G1.4
c("U40", "UNSUPPORTED", "G1.4: an escaping backslash inside double quotes", wfRun(['echo "a \\$b"']), [U(WF, 10, K.dqesc, 11)]); // src: r3a C1 G1.4
c("U41", "UNSUPPORTED", "G1.5: a ${{ expression in a run value", wfOne("echo ${{ github.ref }}"), [U(WF, 10, K.expr)]); // src: r3a C1 G1.5
c("U42", "UNSUPPORTED", "G1.6: an ANSI-C quote $'...'", wfRun(["echo $'a", `#'; npm install ${P}`]), [U(WF, 10, K.qopen, 11)]); // src: F5 :996 F5-U-ansic-wf
c("U43", "UNSUPPORTED", "G1.6: a quote that closes inside a word", wfRun(['echo "a"b']), [U(WF, 10, K.qclose, 11)]); // src: r3a C1 G1.6
c("U44", "UNSUPPORTED", "C: a ' inside a double-quoted ${...}", wfRun(["echo \"${x:-'}\"", `#'}"; npm install ${P}`]), [U(WF, 10, K.cq, 11)]); // src: opus f5 F5-n1; prejudge-9 m2
// G1-PM
c("U45", "UNSUPPORTED", "PM.1: $(which npm) install in a workflow", wfOne(`$(which npm) install ${P}`), [U(WF, 10, K.pm1)]); // src: F5 :408 m5-c Y13
c("U46", "UNSUPPORTED", "PM.1: $(which npm) install in a RUN", { Dockerfile: dockerfile([`RUN $(which npm) install ${P}`]) }, [U("Dockerfile", 6, K.pm1)]); // src: F5 :412 m5-c D05
c("U47", "UNSUPPORTED", "PM.1: RUN ${NPM} ci", { Dockerfile: dockerfile(["RUN ${NPM} ci"]) }, [U("Dockerfile", 6, K.pm1)]); // src: F5 :424 m5-d
c("U48", "UNSUPPORTED", "PM.2: sh -c \"npm install P\" in a RUN", { Dockerfile: dockerfile([`RUN sh -c "npm install ${P}"`]) }, [U("Dockerfile", 6, K.pm2)]); // src: F5 :374 m4-c D04
c("U49", "UNSUPPORTED", "PM.2: sh -c \"npm install P\" in a script", sh([`sh -c "npm install ${P}"`]), [U(SH, 3, K.pm2)]); // src: F5 :378 m4-d S02
c("U50", "UNSUPPORTED", "PM.2: echo \"npm is a tool\" (safe, refused by design)", wfOne('echo "npm is a tool"'), [U(WF, 10, K.pm2)]); // src: F5 :386 m4 SAFE twin
c("U51", "UNSUPPORTED", "PM.2: a quoted literal npm path in a RUN", { Dockerfile: dockerfile([`RUN "/usr/bin/npm" install ${P}`]) }, [U("Dockerfile", 6, K.pm2)]); // src: F5 :551 R2-a; openai w1 R2
c("U52", "UNSUPPORTED", "PM.2: a single-quoted npm path in a RUN", { Dockerfile: dockerfile([`RUN '/usr/bin/npm' install ${P}`]) }, [U("Dockerfile", 6, K.pm2)]); // src: F5 :555 R2-a
c("U53", "UNSUPPORTED", "PM.2: a quoted relative npm path in a RUN", { Dockerfile: dockerfile([`RUN "./node_modules/.bin/npm" install ${P}`]) }, [U("Dockerfile", 6, K.pm2)]); // src: F5 :563 R2-c
c("U54", "UNSUPPORTED", "PM.2: a quoted npm path in a run block", wfRun([`"/usr/bin/npm" install ${P}`]), [U(WF, 10, K.pm2, 11)]); // src: F5 :567 R2-d
c("U55", "UNSUPPORTED", "PM.2: a quoted npm path in a script", sh([`'./node_modules/.bin/npm' install ${P}`]), [U(SH, 3, K.pm2)]); // src: F5 :571 R2-e
c("U56", "UNSUPPORTED", "PM.2: a quoted npm path with ci (safe, refused by design)", wfRun(['"./node_modules/.bin/npm" ci']), [U(WF, 10, K.pm2, 11)]); // src: F5 :575 R2 SAFE twin
c("U57", "UNSUPPORTED", "PM.3: /usr/local/bin/npm install in a RUN", { Dockerfile: dockerfile([`RUN /usr/local/bin/npm install ${P}`]) }, [U("Dockerfile", 6, K.pm3)]); // src: F5 :208 F8
c("U58", "UNSUPPORTED", "PM.3: ./node_modules/.bin/npm ci (safe, refused by design)", wfOne("./node_modules/.bin/npm ci"), [U(WF, 10, K.pm3)]); // src: F5 :213 F8 SAFE twin, :607
c("U59", "UNSUPPORTED", "PM.3: ./node_modules/.bin/npm install in a RUN", { Dockerfile: dockerfile([`RUN ./node_modules/.bin/npm install ${P}`]) }, [U("Dockerfile", 6, K.pm3)]); // src: F5 :559 R2-b
c("U60", "UNSUPPORTED", "PM.3: npm-cli.js by path", { Dockerfile: dockerfile([`RUN node /usr/local/lib/node_modules/npm/bin/npm-cli.js install ${P}`]) }, [U("Dockerfile", 6, K.pm3)]); // src: F5 :513 m6 PIN
c("U61", "UNSUPPORTED", "PM.3: /usr/bin/npx npm install", wfOne(`/usr/bin/npx npm install ${P}`), [U(WF, 10, K.pm3)]); // src: F5 :316 m1-a; opus w1 m1
c("U62", "UNSUPPORTED", "PM.3: npx npm install (npm is npx's sub-command to npmCalls)", wfOne(`npx npm install ${P}`), [U(WF, 10, K.pm3)]); // src: F5 :320 m1-b
c("U63", "UNSUPPORTED", "PM.3: corepack, NPM and npm.cmd", wfRun(["corepack enable", `NPM install ${P}`, `npm.cmd install ${P}`]), [U(WF, 10, K.pm3, 11, 2)]); // src: r3a C1 PM.3
c("U64", "UNSUPPORTED", "PM.4: npm --prefix /app install in a workflow", wfOne(`npm --prefix /app install ${P}`), [U(WF, 10, K.pm4)]); // src: F5 :400 m5-b Y19
c("U65", "UNSUPPORTED", "PM.4: npm --prefix /app install in a RUN", { Dockerfile: dockerfile([`RUN npm --prefix /app install ${P}`]) }, [U("Dockerfile", 6, K.pm4)]); // src: F5 :404 m5-b D12
c("U66", "UNSUPPORTED", "PM.5: a sub-command npmCalls does not read whole", wfRun([`npm "install" ${P}`, `npm 'i' ${P}`, `npm $SUB ${P}`, `npm {install,} ${P}`, 'npm "$@"']), [U(WF, 10, K.pm5, 11, 4)]); // src: r3a C1 PM.5 (S1, B1)
c("U67", "UNSUPPORTED", "PM.6: a package-manager name inside ${...}", wfRun([`\${x:-npm} install ${P}`]), [U(WF, 10, K.pm6, 11)]); // src: r3a C1 PM.6 (S1, B1)
// Y1 (the whole file: no step of it is read)
c("U68", "UNSUPPORTED", "Y1.1: a CRLF workflow", { [WF]: workflow(["      - run: npm ci"]).replace(/\n/g, "\r\n") }, [UF(WF, 1, K.y11cr, 9)]); // src: r3a C2 Y1.1
c("U69", "UNSUPPORTED", "Y1.1: a tab-indented line", wf(["      - name: tab", `\t\trun: npm install ${P}`]), [UF(WF, 11, K.y11tab)]); // src: F5 :227 UNREADABLE tab, :581 NW-a
c("U70", "UNSUPPORTED", "Y1.1: a YAML directive", { [WF]: "%YAML 1.2\n" + workflow(["      - run: npm ci"]) }, [UF(WF, 1, K.y11doc)]); // src: F5 :537 m6 PIN
c("U71", "UNSUPPORTED", "Y1.1: a second document", { [WF]: workflow(["      - run: npm ci"]) + "---\nname: second\n" }, [UF(WF, 11, K.y11doc)]); // src: F5 :545 m6 PIN
c("U72", "UNSUPPORTED", "Y1.2: an anchored run block", wf(["      - name: anchored", "        run: &install |", `          npm install ${P}`]), [UF(WF, 11, K.y12)]); // src: F5 :130 F1
c("U73", "UNSUPPORTED", "Y1.2: an alias run", wf([`      - name: &cmd npm install ${P}`, "        run: echo first", "      - run: *cmd"]), [UF(WF, 10, K.y12, 1)]); // src: F5 :140 F2
c("U74", "UNSUPPORTED", "Y1.2: a step env merged by '<< :'", wf(["      - run: npm ci", "        env:", "          << :", `            ARKON_NPM_TOKEN: ${tokenEnv}`]), [UF(WF, 12, K.y12)]); // src: F5 :331 m2-a; opus w1 m2
c("U75", "UNSUPPORTED", "Y1.2: a job env merged by '<< : *x'", wf(["      - run: npm ci"], { job: ["    env:", "      << : *x"] }), [UF(WF, 9, K.y12)]); // src: F5 :335 m2-b
c("U76", "UNSUPPORTED", "Y1.2: a merge key '<<:'", wf(["      - run: npm ci", "        env:", "          <<:", "            QZX_LEVEL: plain"]), [UF(WF, 12, K.y12)]); // src: F5 :493 m6 PIN
c("U77", "UNSUPPORTED", "Y1.2: a tag on a run", wfOne("!!str echo built"), [UF(WF, 10, K.y12)]); // src: F5 :497 m6 PIN
c("U78", "UNSUPPORTED", "Y1.3: an unclosed flow collection under jobs", wf(["      - name: flow", `        with: [{run: npm install ${P},`, "          name: unclosed}]"]), [UF(WF, 11, K.y13)]); // src: F5 :217 UNREADABLE flow
c("U79", "UNSUPPORTED", "Y1.3: an anchor in a flow sequence under jobs", wf(["      - run: echo built", "        with: [a, &q b]"]), [UF(WF, 11, K.y13)]); // src: F5 :525 m6 PIN
c("U80", "UNSUPPORTED", "Y1.3: a quoted key under jobs", wf([`      - "run": npm install ${P}`]), [UF(WF, 10, K.y13)]); // src: r3a C2 Y1.3 (quoted key)
c("U81", "UNSUPPORTED", "Y1.3: a ? key under runs: in an action", { [AC]: [MARK, "name: a", "description: a", "runs:", "  using: composite", "  steps:", "    - shell: bash", "      ? run", `      : npm install ${P}`, ""].join("\n") }, [UF(AC, 8, K.y13ac)]); // src: r3a C2 Y1.3 (? key), B3
c("U82", "UNSUPPORTED", "Y1.4: run: > over npm / install", wf(["      - run: >", "          npm", `          install ${P}`]), [UF(WF, 10, K.y14fold)]); // src: F5 :341 m3-a; opus w1 m3
c("U83", "UNSUPPORTED", "Y1.4: run: >- over npm / install", wf(["      - run: >-", "          npm", `          install ${P}`]), [UF(WF, 10, K.y14fold)]); // src: F5 :345 m3-b; openai w1 R1
c("U84", "UNSUPPORTED", "Y1.4: a folded echo (safe, refused by design)", wf(["      - run: >", "          echo", "          built"]), [UF(WF, 10, K.y14fold)]); // src: F5 :357 m3 SAFE twin
c("U85", "UNSUPPORTED", "Y1.4: run: \"npm install P\"", wfOne(`"npm install ${P}"`), [UF(WF, 10, K.y14q)]); // src: F5 :368 m4-a; opus w1 m4
c("U86", "UNSUPPORTED", "Y1.4: run: 'npm install P'", wfOne(`'npm install ${P}'`), [UF(WF, 10, K.y14q)]); // src: F5 :371 m4-b
c("U87", "UNSUPPORTED", "Y1.4: a keep block |+", wf(["      - run: |+", `          npm install ${P}`]), [UF(WF, 10, K.y14fold)]); // src: r3a C2 Y1.4 (|+)
c("U88", "UNSUPPORTED", "Y1.4: a block header with an indentation digit", wf(["      - run: |2", "          echo built"]), [UF(WF, 10, K.y14hdr)]); // src: F5 :541 m6 PIN
c("U89", "UNSUPPORTED", "Y1.4: an empty run value", wf(["      - run:", "      - run: npm ci"]), [UF(WF, 10, K.y14ml)]); // src: r3a C2 Y1.4
c("U90", "UNSUPPORTED", "Y1.5: shell: pwsh on a step", wf(["      - run: echo built", "        shell: pwsh"]), [UF(WF, 11, K.y15)]); // src: r3a C2 Y1.5
c("U91", "UNSUPPORTED", "Y1.5: defaults: run: shell: python", wf(["      - run: npm ci"], { top: ["defaults:", "  run:", "    shell: python {0}"] }), [UF(WF, 7, K.y15)]); // src: r3a C2 Y1.5
// C0
c("U92", "UNSUPPORTED", "C0: a run key the reader does not extract (run :)", wf(["      - name: spaced", `        run : npm install ${P}`]), [UF(WF, 11, K.c0run)]); // src: r3a C0 (the run-line count)
c("U93", "UNSUPPORTED", "C0: a # in a plain run value", wfOne(`echo a # npm install ${P}`), [U(WF, 10, K.c0hash)]); // src: r3a C0 (a plain one-line run value holds no #)
c("U94", "UNSUPPORTED", "C0: a block line indented less than the first", wf(["      - run: |", "            echo a", `          npm install ${P}`]), [U(WF, 10, K.c0ind, 12)]); // src: r3a C0 (decoded = preserved less the block indentation)
c("U95", "UNSUPPORTED", "C0: a backslash escape in a package.json string", pkgRaw(['  "scripts": {', '    "build": "next build",', `    "setup": "echo \\"a\\" && npm install ${P}"`, "  }"]), [UP(7, K.c0esc, "setup")]); // src: r3a C0 (B5)
c("U96", "UNSUPPORTED", "C0: a scripts block on one line", pkgRaw([`  "scripts": { "build": "next build", "setup": "npm install ${P}" }`]), // src: r3a C0 (B5)
  [`UNSUPPORTED package.json:5 FAIL: ${K.c0shape} at :5 (every scripts value: none read)`]);
c("U97", "UNSUPPORTED", "G1.2 in a package.json script: an inline comment", pkg({ build: "next build", lint: "eslint . # all" }), [UP(7, K.hash, "lint")]); // src: r3a F (container type: package.json)
// D1
c("U98", "UNSUPPORTED", "D1: a '# escape=`' directive", { Dockerfile: ["# escape=`", MARK, "FROM node:20-alpine AS deps", "WORKDIR /app", "COPY package.json package-lock.json .npmrc ./", `RUN ${MOUNT} npm ci --omit=dev`, "RUN npm `", `    install ${P}`, "FROM node:20-alpine AS runtime", ""].join("\n") }, // src: F5 :444 m5-e D09
  [UD(1, K.d1dir)]);
c("U99", "UNSUPPORTED", "D1: a '# escape=\\' directive (safe, refused by design)", { Dockerfile: "# escape=\\\n" + dockerfile() }, [UD(1, K.d1dir)]); // src: F5 :447 m5-e SAFE twin
c("U100", "UNSUPPORTED", "D1: a '# syntax=' directive; master's syntax CHECK row stays", { Dockerfile: "# syntax=docker/dockerfile:1\n" + dockerfile() }, // src: r3a C3 D1 (the syntax CHECK row stays)
  [UD(1, K.d1dir), "CHECK Dockerfile syntax FAIL: a '# syntax=' frontend line at :1 (it pulls a frontend that sees the secret mount)"]);
c("U101", "UNSUPPORTED", "D1: a SHELL instruction", { Dockerfile: dockerfile(['SHELL ["/bin/bash", "-c"]']) }, [UD(6, K.d1shell)]); // src: r3a C3 D1
c("U102", "UNSUPPORTED", "D1: an ONBUILD instruction", { Dockerfile: dockerfile([`ONBUILD RUN npm install ${P}`]) }, [UD(6, K.d1onbuild)]); // src: r3a C3 D1
c("U103", "UNSUPPORTED", "D1: an exec-form RUN holding npm install", { Dockerfile: dockerfile([`RUN ["npm", "install", "${P}"]`]) }, [U("Dockerfile", 6, K.d1exec)]); // src: F5 :190 F6
c("U104", "UNSUPPORTED", "D1: an exec-form RUN with no npm (safe, refused by design)", { Dockerfile: dockerfile(['RUN ["node", "--version"]']) }, [U("Dockerfile", 6, K.d1exec)]); // src: F5 :195 F6 SAFE twin, :597
c("U105", "UNSUPPORTED", "D1: /run/secrets in an exec-form RUN", { Dockerfile: dockerfile(['RUN ["sh", "-c", "cat /run/secrets/qzx4821"]']) }, [U("Dockerfile", 6, K.d1exec)]); // src: F5 :517 m6 PIN
c("U106", "UNSUPPORTED", "D1: CMD exec form holding npm install", { Dockerfile: dockerRt([`CMD ["npm", "install", "${P}"]`]) }, [UD(9, K.d1cmd)]); // src: F5 :451 m5-f D10
c("U107", "UNSUPPORTED", "D1: CMD shell form holding npm install", { Dockerfile: dockerRt([`CMD npm install ${P}`]) }, [UD(9, K.d1cmd)]); // src: F5 :454 m5-f
c("U108", "UNSUPPORTED", "D1: ENTRYPOINT exec form holding npx", { Dockerfile: dockerRt([`ENTRYPOINT ["npx", "${P}"]`]) }, [UD(9, K.d1cmd)]); // src: F5 :457 m5-f
c("U109", "UNSUPPORTED", "D1: HEALTHCHECK holding npm", { Dockerfile: dockerRt([`HEALTHCHECK CMD npm view ${P}`]) }, [UD(9, K.d1cmd)]); // src: r3a C3 D1 (HEALTHCHECK, S11, R4)
c("U110", "UNSUPPORTED", "a RUN heredoc with no npm (safe, refused by design)", { Dockerfile: dockerfile(["RUN <<EOF", "echo built", "EOF"]) }, [U("Dockerfile", 6, K.hd)]); // src: F5 :204 F7 SAFE twin, :602
// B8: THE UNLISTED GUARD, one case per form, and the compose guard
c("B01", "UNSUPPORTED", "B8: a *.sh outside scripts/", { "tests/run.sh": MARK + "\necho a\n" }, [UL("tests/run.sh")]); // src: r3a B8 (*.sh)
c("B02", "UNSUPPORTED", "B8: a *.bash at the root", { "build.bash": MARK + "\necho a\n" }, [UL("build.bash")]); // src: r3a B8 (*.bash)
c("B03", "UNSUPPORTED", "B8: Dockerfile.dev", { "Dockerfile.dev": MARK + "\nFROM node:20-alpine\n" }, [UL("Dockerfile.dev")]); // src: r3a B8 (Dockerfile*)
c("B04", "UNSUPPORTED", "B8: a *.Dockerfile", { "app.Dockerfile": MARK + "\nFROM node:20-alpine\n" }, [UL("app.Dockerfile")]); // src: r3a B8 (*.Dockerfile)
c("B05", "UNSUPPORTED", "B8: a Containerfile", { Containerfile: MARK + "\nFROM node:20-alpine\n" }, [UL("Containerfile")]); // src: r3a B8 (Containerfile*)
c("B06", "UNSUPPORTED", "B8: a compose file other than docker-compose.yml", { "compose.yaml": MARK + "\nservices: {}\n" }, [UL("compose.yaml")]); // src: r3a B8 (*compose*.yaml)
c("B07", "UNSUPPORTED", "B8: a workflow below .github/workflows/", { ".github/workflows/sub/x.yml": MARK + "\nname: x\n" }, [UL(".github/workflows/sub/x.yml")]); // src: r3a B8 (*.yml under .github/)
c("B08", "UNSUPPORTED", "B8: an action.yml outside .github/actions/<name>/", { "tools/act/action.yml": MARK + "\nname: x\n" }, [UL("tools/act/action.yml")]); // src: r3a B8 (action.yml at any depth)
c("B09", "UNSUPPORTED", "B8: a step uses: ./<path> that names no B3 file", wf(["      - uses: ./tools/act"]), [UL(`${WF}:10 uses ./tools/act`)]); // src: r3a B8 (uses: ./)
c("B10", "UNSUPPORTED", "B7: docker-compose.yml with a package-manager word", { "docker-compose.yml": MARK + "\nservices:\n  app:\n    command: npm start\n" }, // src: r3a B7 (the compose guard)
  ["CHECK docker-compose.yml FAIL: a package-manager word at :4 (the compose file is outside the manifest, B7)"]);
// per container type: an UNSUPPORTED action and a FORBIDDEN-or-UNSUPPORTED mix in one root
c("B11", "UNSUPPORTED", "Y1 in an action: a folded run makes the whole action file UNSUPPORTED", { [AC]: action(">\n        npm\n        ci") }, [UF(AC, 7, K.y14fold)]); // src: r3a C2 (B3 file as a whole)

describe("the strict npm install site check (transformate WI-4821)", () => {
  for (const k of CASES) {
    test(`${k.id} ${k.cls}: ${k.what}`, () => {
      const r = run(k.files);
      if (k.cls === "ALLOWED") {
        assert.equal(r.rc, 0, `want rc 0, got ${r.rc}\n${r.brief}`);
        assert.deepEqual(r.fails, [], `want zero FAIL row\n${r.brief}`);
      } else {
        assert.equal(r.rc, 1, `want rc 1, got ${r.rc}\n${r.brief}`);
        assert.deepEqual(r.fails, k.want, `want exactly these FAIL rows\n${r.brief}`);
      }
      for (const row of k.has) assert.ok(r.lines.includes(row), `want the row: ${row}\n${r.brief}`);
    });
  }
  // THE LIVE CASE: the check over this repo's own tree reads rc 0
  test("L01 ALLOWED: THE LIVE CASE, the check over the repo root reads rc 0", () => {
    const r = spawnSync(process.execPath, [CHECK, REPO], { encoding: "utf8" });
    const fails = (r.stdout || "").split("\n").filter((l) => l.includes(" FAIL: ") && !l.startsWith("T1 RESULT"));
    assert.deepEqual(fails, [], "want zero FAIL row on the repo tree");
    assert.equal(r.status, 0, `want rc 0, got ${r.status}`);
  });
});
