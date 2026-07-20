# 双语界面验收报告 v1.0

- 验收日期：2026-07-19（America/Los_Angeles）
- 验收分支：`development`
- 目标：验证桌面端中文界面、语言切换和核心 Skill 管理流程
- 结论：通过

## 验收范围

本次使用 Docker 内的合成项目 `/app` 和测试 Skill `xtest-project-builder`，按桌面用户的实际操作顺序检查：

1. 首次语言选择与侧栏语言切换。
2. 概览数据和导航。
3. Skill 目录、搜索/筛选区、安装入口及实例信息。
4. Skill 详情、项目选择、状态说明、维护和全局拆分影响。
5. 项目列表、Agent 启用状态和项目 Skill 矩阵。
6. 在 Skill 详情页切换中英文，确认 URL、所选项目及业务上下文不被重置。

## 结果

- 中文覆盖核心固定界面文案；`Skill`、Agent 名称、Skill 名称、路径和来源保持技术原文。
- 默认语言按浏览器语言选择；用户手动选择持久化。
- 语言切换即时生效，无页面重载，详情路由保持不变。
- 已知 API 错误和维护状态可本地化；无法识别但可安全展示的诊断信息保留原文。
- 中文文案长度未造成遮挡、截断或关键操作错位；1440×900 桌面布局层级清晰。
- 安装、卸载、全局拆分等高影响操作仍在操作前说明范围和受影响目标。
- 人工浏览过程中浏览器控制台无 warning/error。

## 自动化验证

- Vitest：83/83 通过。
- Playwright：24/24 通过。
- Docker 测试镜像、Docker E2E 镜像和生产构建通过。
- 额外桌面截图采集流程：1/1 通过。

## 截图证据

- [中文概览](screenshots/01-dashboard-zh.jpg)
- [中文 Skill 目录](screenshots/02-skills-zh.jpg)
- [中文 Skill 详情](screenshots/03-skill-detail-zh.jpg)
- [同一 Skill 详情的英文状态](screenshots/04-skill-detail-en.jpg)
- [中文项目列表](screenshots/05-projects-zh.jpg)
- [中文项目详情](screenshots/06-project-detail-zh.jpg)

## 隐私与边界

- 验收数据只包含 Docker 内的 `/app`、`/tmp/skills-ui-development-e2e/...` 合成路径。
- 截图及报告不包含宿主机真实路径、令牌、账户信息或个人数据。
- 产品定位为电脑端技术人员工具，本轮未做手机和平板适配验收。
- 本轮不是完整 WCAG 或屏幕阅读器认证；键盘和语义可访问性由现有自动化与 DOM 检查覆盖基础行为。
