# Traceforge

[English](README.md) | [简体中文](README.zh-CN.md)

> 面向 AI Agent 的开源重放与回归测试工具。
>
> 捕获真实运行。重放失败。导出测试。

Traceforge 的目标是让 Agent 的运行过程可复现。

它会记录终端（terminal）、MCP 和浏览器（browser）工具里真实发生过的事情，
把一次运行打包成可移植的 trace 包（trace bundle），帮助你定位失败边界，
并把真实故障转成可复用的回归测试夹具与测试。

## 为什么做这个

现代 Agent 工作流很强，但很难真正建立信任。

- 终端输出往往不完整
- MCP 调用常常淹没在协议日志里
- 浏览器失败很难稳定复现
- 代价高的线上事故很少真正沉淀成测试
- 团队修过一次的问题，后面还是可能反复出现

Traceforge 只专注解决一个明确的问题：

`capture -> inspect -> replay -> export test`

它不是另一个 Agent 框架。
它是 Agent 生态里的验证层。

## 你会得到什么

- 来自终端、MCP 和浏览器的统一 trace 记录
- 本地 trace 查看器（viewer），可查看时间线、产物和失败边界
- replay 能重新执行流程，并检查从哪里开始分叉
- 可导出为可复用的回归测试夹具和测试模板
- 可共享的 trace 包（trace bundle），便于调试与协作

## CLI

```bash
traceforge capture -- node -v
traceforge view ./.traceforge/traces/run_xxxxxxxx
traceforge replay ./.traceforge/traces/run_xxxxxxxx
traceforge export-test ./.traceforge/traces/run_xxxxxxxx
```

## 从源码安装

Traceforge 当前处于 early alpha 阶段。

环境要求：

- Node.js 20+
- pnpm 10.6.0+

```bash
pnpm install
pnpm build
```

## 开发

主要验证命令：

```bash
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm test:generated
```

常用本地开发入口：

```bash
pnpm dev:cli
pnpm dev:viewer
```

## 仓库结构

- `apps/cli` - CLI 入口与本地 trace bridge
- `apps/viewer` - 本地 viewer 应用
- `packages/schema` - 规范化 trace schema 与 capability contract
- `packages/core` - trace 包、replay 与 view-server 相关工具
- `packages/adapter-*` - 终端、MCP、浏览器的采集适配器
- `packages/fixtures` - 导出的回归测试模板
- `examples/` - 可运行示例与 smoke 测试辅助文件

## 贡献

贡献说明见 `CONTRIBUTING.md`。

如果你的改动影响可发布的 package，请补一个 changeset：

```bash
pnpm changeset
```

## 安全

安全问题请私下报告。
当前策略见 `SECURITY.md`。

## 许可证

MIT，详见 `LICENSE`。

## 友链

- [linux.do](https://linux.do/)

## 仓库导航

- 产品与系统设计：`ARCHITECTURE.md`
- 交付计划与里程碑：`ROADMAP.md`

## 当前状态

Early alpha。

这个项目的目标很简单：

**让任何一次 Agent 运行都可以被复现。**
