# Tiny Stack VM — make.fun tiny-stack-vm-01-run-20261122

Faithful interpreter of the tiny stack ISA v1: 32-bit wrapping arithmetic,
256-value stack, calls, 256 words of memory, input/output, all ten traps
with exact exit codes, step and output limits.

Run (practice):
`MAKEFUN_INPUT_DIR=<kit>/practice/input MAKEFUN_OUTPUT_DIR=out node main.ts`

Writes `<id>/stdout.bin` + `<id>/exit.txt` per instance. Node 22+, no deps.

Practice: 40/40, score 1,000,000. NOT submitted — submit needs login,
GitHub repo and transcripts.
