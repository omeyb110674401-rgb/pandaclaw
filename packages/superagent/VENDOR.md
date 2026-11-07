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

## 本地 Windows 适配

以下是为在 Windows 上本地运行而加入的改动，不属于上游 vendoring 内容；与上面的 vendored commit 做 diff 时会看到这些差异。

1. `src/deployment.ts`：`stateDir` 的绝对路径校验从只接受 POSIX 的 `/…`，放宽为同时接受 Windows 盘符路径（`C:/…`、`C:\…`）；通过校验后仍只把路径交给 Node 的 path API。
2. `src/policy.ts`：Executor `directory` 的绝对路径校验同样接受 Windows 盘符路径，空值仍表示 `<stateDir>/work`。
3. `src/app/setup.ts`：未配置 GitHub Source 时不再调用 `resolveDeployment`，改用占位部署（空 repository、`gh-unavailable` 身份）继续启动；只有真正使用 GitHub 的路径才会失败。不加载 GitHub Source、仅由 `main-window` Source 驱动的部署属于这种情况。
4. `src/app/sessions.ts`：master Session 的工具白名单按平台过滤 `bash`/`pwsh`，只保留 profile 实际注册的那个 shell；`restrict()` 不再因为另一平台的内置工具不存在而拒绝整个白名单。

这些改动只涉及路径校验、部署来源和工具装配，不改变上游的 ticket、审批与执行语义。
