---
name: tauri-capability-bridge
description: Define permission-gated Tauri capability invocations (file/clipboard/screenshot/shell/window) with input validation and unified structured results. Use when wiring sidecar-to-Tauri system capability calls that must enforce minimal permissions.
---

# Tauri Capability Bridge

## When to Use
- 实现或调整 Tauri Rust 与 sidecar（Node/NestJS）之间的 capability 调用通道。
- 需要对“读取/写入文件、剪贴板、截图、执行外部程序、窗口操作”等动作做权限边界与参数校验。

## Input 契约
根据你的工程实现方式，统一抽象为类似下面的结构（示例字段可按实际调整）：

```json
{
  "capability": "<one-of-allowed-capabilities>",
  "params": { "any": "capability-specific payload" },
  "requestContext": {
    "requestId": "string",
    "userIntent": "string",
    "conversationId": "string|null",
    "actor": "string"
  }
}
```

## Output 契约
技能要求返回“统一结构”，方便上层编排处理失败与降级：

```json
{
  "ok": true,
  "code": "SUCCESS|null",
  "data": { "capability-specific": "result" }
}
```

失败时：

```json
{
  "ok": false,
  "code": "<error-code>",
  "message": "human-readable",
  "retryable": true,
  "nextAction": "what to do"
}
```

## Workflow
1. **能力白名单**：定义允许的 `capability` 集合（例如 `fs-read`, `fs-write`, `clipboard-get`, `clipboard-set`, `screenshot-capture`, `shell-exec`, `window-open` 等；仅作为抽象示例）。
2. **参数校验**：
   - 对路径类参数做规范化、越权检查（例如禁止目录穿越、禁止访问未授权根目录）。
   - 对执行类参数做命令/参数白名单化或限制（例如限制可执行程序与参数范围）。
3. **权限与审计线索**：
   - 输出结果里包含可追踪字段（`requestId`、capability、拒绝原因/权限不足原因）。
4. **调用封装**：
   - 在 sidecar 内部创建一个“唯一入口”的函数/服务方法，所有 capability 都通过它调用。
5. **失败降级策略**：
   - 权限不足：返回明确的 `retryable=false` 与 `nextAction`（提示授权/配置）。
   - 参数越界：返回 `retryable=false`，并说明具体校验失败原因。
   - 运行时失败：返回 `retryable=true`，允许上层重试或降级为“仅文本模式”。

## Failure 与 Fallback
- 权限不足：不执行动作；返回 `PERMISSION_DENIED`。
- capability 不存在：返回 `UNKNOWN_CAPABILITY`。
- 参数不合法：返回 `INVALID_PARAMS`。
- Tauri 执行失败：返回 `CAPABILITY_FAILED`（`retryable=true`）。

## Non-goals
- 不负责业务编排（由 `ai-response-orchestrator` 等负责）。
- 不负责 embedding/索引/召回逻辑。
- 不负责 UI 展示与交互细节。

