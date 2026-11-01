# Vendored: dsh-superagent

- Upstream: https://github.com/deepseek-ai/dsh-superagent-prototype
- Commit at vendoring: 6337fc823ce20251c8de8085948165c81aaa701e
- License: MIT (see LICENSE in this directory)
- Vendored on: 2026-11-01

This tree is a copy of the upstream source without build artefacts
(`node_modules`, `lib`, `.git`, `.artifacts`). It is modified in place as the
skeleton of this repository; see docs/adr/0013.

To diff against upstream:

    git clone https://github.com/deepseek-ai/dsh-superagent-prototype /tmp/upstream
    git -C /tmp/upstream checkout unknown
    diff -ru /tmp/upstream packages/superagent --exclude=node_modules --exclude=lib --exclude=.git
