# RaTeX for Paseo

[English](README.md) | [简体中文](README.zh-CN.md)

在 Paseo 对话中渲染 LaTeX 公式，划选时保留原始源码，双击后可在公式原位置查看 TeX 代码。

## 功能

- 自动渲染助手消息和用户消息中的公式。
- 支持行内定界符 `$...$`、`\(...\)`，以及独立公式定界符 `$$...$$`、`\[...\]`。
- 跨公式划选复制时，保留公式原始的定界符、空格和换行。
- 双击公式，将其原位替换为 Markdown 风格的代码框；右上角的 **Copy** 用于复制，**Show formula** 用于切回公式。
- 支持键盘操作：聚焦公式后，按 **Enter** 或 **Space** 显示源码。
- 内嵌公式字体和 WASM 二进制，渲染时无需从 CDN 获取资源。
- 提供 **RaTeX** 侧栏试写面板和 **RaTeX formula** 工作区面板。
- 加载中、渲染失败，以及原生 iOS/Android 客户端均显示可选择的 TeX 源码。

插件的按钮、悬停提示和无障碍标签统一使用英语。当前使用的 Paseo 插件 SDK 未向插件暴露宿主语言设置。

## 环境要求

| 组件 | 要求 |
| --- | --- |
| Paseo | 插件声明兼容 `>=0.8.0 <0.10.0`，开发使用的 SDK 为 `0.9.0-beta.2` |
| 客户端 | 网页端支持公式渲染和双击交互；原生客户端显示源码 |
| 开发环境 | 建议 Node.js 22.14+；已在 Node.js 22.21.1、npm 11.10.1 下验证 |
| 安装环境 | daemon 所在机器可运行 Node.js 和 npm；Paseo 版本需要支持 npm 插件来源 |

目标 daemon 需要已启用 Paseo 插件。插件作为可信代码在 daemon 和连接的客户端中运行。

## 从 npm 安装（推荐）

在 Paseo daemon 所在机器安装已发布的 [ratex-math-render](https://www.npmjs.com/package/ratex-math-render)：

```bash
paseo plugin install npm:ratex-math-render
paseo plugin ls
```

也可以在 Paseo 的 **Settings → Plugins → Plugin source** 中填写 `npm:ratex-math-render`。Paseo 会下载包并安装依赖，无需额外执行 `npm install`。

安装指定版本：

```bash
paseo plugin install npm:ratex-math-render@0.1.0
```

npm 包名是 `ratex-math-render`，安装后的插件 ID 为 **`ratex-formula`**。更新时使用插件 ID：

```bash
paseo plugin update ratex-formula
```

安装完成后刷新网页客户端，加载公式界面。

## 从 GitHub 安装

```bash
paseo plugin add ZedRover/ratex-paseo --ref main
paseo plugin ls
```

如果仓库为私有，daemon 所在机器需要具备相应的 Git 访问权限。插件声明会在 Git 安装时执行 `npm ci --omit=dev`，同时生成内嵌资源。插件运行 ID 为 **`ratex-formula`**。

更新通过 Git 安装的插件：

```bash
paseo plugin update ratex-formula
```

## 本地开发

```bash
git clone https://github.com/ZedRover/ratex-paseo.git
cd ratex-paseo
npm ci
npm run typecheck
npm test
npm run render:launch
```

将当前目录安装到本地 daemon：

```bash
paseo plugin install "$PWD"
paseo plugin ls
```

修改源码后：

```bash
npm run typecheck
paseo plugin reload ratex-formula
```

如果网页仍显示旧界面，请刷新客户端。修改插件源码无需重启 daemon。

## 使用公式

例如，发送包含以下内容的消息：

```text
能量公式是 $E=mc^2$。

\[
a^2 + b^2 = c^2
\]
```

跨消息内容划选时，公式会以 TeX 源码形式进入剪贴板。双击任意公式，可在原位置显示代码框。复制按钮会复制包含定界符的完整公式源码。

试写面板可以从 **RaTeX** 侧栏入口、**RaTeX formula** 工作区面板，或 Command Center 中的 **Open RaTeX formula** 操作打开。

## 渲染原理

1. 客户端的时间线转换器识别消息中完整的公式。
2. 客户端通过插件 RPC 发送 TeX、显示模式和颜色。
3. daemon 中的 `ratex-wasm` 解析公式并完成排版，返回 DisplayList 绘制指令。
4. 网页端使用 Canvas 2D 和内嵌的 KaTeX 字体绘制公式。
5. 可选择的源码文本保证复制行为；打开代码框时，可见源码会替换画布。

服务端缓存同时限制条目数量和序列化大小，较大的结果不进入缓存。单个公式最多允许 4096 个字符。

## Markdown 行为与限制

不包含完整公式的消息继续使用 Paseo 内置的 Markdown 渲染器。包含公式的消息由本插件接管整条消息的渲染，支持标题、强调、删除线、行内代码、围栏和缩进代码块、链接、引用、列表、任务列表、管道表格及分隔线。

- 这是有限的 Markdown 实现，不是完整的 CommonMark/GFM 引擎。
- 图片显示为标签和 URL，不会加载图片内容。
- 复制可以保留公式源码，但不会还原所有 Markdown 格式标记或表格分隔符。
- 原生客户端显示 TeX 源码；Canvas 渲染和双击查看源码属于网页端功能。
- 不支持的公式会回退为源码显示。

## 自动生成的资源

`npm ci` 和 `npm install` 会执行 `prepare` 脚本，生成以下文件：

| 生成文件 | 对应命令 |
| --- | --- |
| `server/vendor/ratex-wasm-bytes.ts` | `npm run embed-wasm` |
| `client/vendor/fonts.ts` | `npm run embed-fonts` |

这些文件由 Git 忽略，并根据锁定版本的 `ratex-wasm` 依赖重新生成。如果安装时使用了 `--ignore-scripts`，需要随后手动执行 `npm run prepare`。`npm test` 会检查资源与依赖的一致性。

## 浏览器回归验证

浏览器验证使用实际组件、React Query 和服务端渲染函数，仅替换 Paseo 宿主钩子。在独立目录中安装浏览器测试工具：

```bash
mkdir -p /tmp/ratex-browser-tools
npm install --prefix /tmp/ratex-browser-tools \
  esbuild puppeteer-core@25.11.0 react@19.1.0 react-dom@19.1.0 react-native-web@0.21.2
```

指定已安装的 Chrome 或 Chromium 可执行文件，运行真实浏览器验证：

```bash
RATEX_BROWSER_DEPS=/tmp/ratex-browser-tools \
CHROME_BIN=/absolute/path/to/chrome \
npm run test:browser
```

如果 `PATH` 中已安装 `obscura`，也可以执行：

```bash
RATEX_BROWSER_DEPS=/tmp/ratex-browser-tools npm run test:browser -- --obscura
```

Chrome 验证覆盖真实鼠标拖选、剪贴板读写、行内和独立公式的原位源码框、右上角复制按钮、键盘操作、字体、加载状态、主题切换、错误回退、原生端回退和紧凑布局。Obscura 通过 Puppeteer/CDP 验证程序化 Range 选区，不用于证明原生鼠标选区或剪贴板行为。两个命令结束时都会关闭自己启动的测试服务与浏览器。

## 目录结构

```text
index.client.tsx       客户端注册与时间线转换器
index.server.ts       服务端 RPC 注册
client/               消息、公式、源码框和画布界面
server/               WASM 初始化、渲染和缓存
shared/               解析、布局和 RPC 契约
scripts/              内嵌资源生成与渲染冒烟检查
tests/                单元测试与浏览器回归验证
```

## 发布

npm 包名为 `ratex-math-render`。发布新版本前执行：

```bash
npm ci
npm run typecheck
npm test
npm run check:package
npm publish --access public
```

`files` 明确包含生成的 WASM、字体、中英文 README 和许可证声明。锁定版本的 `ratex-wasm` 依赖随包分发，保留渲染器与 WASM 绑定所需的内部路径。测试和开发工具不进入安装包。

Paseo 从 npm 安装时跳过生命周期脚本，因此发布包内已经包含可用资源。插件的准备命令会对带锁文件的 Git 检出执行 `npm ci --omit=dev`，对 npm 安装则检查随包资源。

每次发布都需要新版本号。通过 GitHub Release 自动发布前，还需要另行配置 GitHub Actions 和 npm Trusted Publishing。

## 致谢

本插件建立在以下项目及其贡献者的工作之上：

- [RaTeX](https://github.com/erweixin/RaTeX)：通过 `ratex-wasm` 提供 Rust/WASM 数学公式解析与排版引擎，以及网页端 DisplayList 渲染器。
- [Paseo](https://github.com/getpaseo/paseo)：提供宿主应用、插件 SDK、时间线集成和客户端／服务端运行环境。
- [KaTeX](https://github.com/KaTeX/KaTeX)：提供由 `ratex-wasm` 附带并内嵌到本插件中的数学字体。

感谢这些项目的维护者和贡献者，让本插件的集成成为可能。

## 许可证与第三方声明

本项目的原创代码采用 [MIT 许可证](LICENSE)，版权所有 © 2026 ZedRover。

第三方代码和资源保留各自的许可证。RaTeX（`ratex-wasm`）采用 MIT 许可证；附带的 KaTeX 字体采用 SIL Open Font License 1.1。相关版权和许可证声明保留在 [client/vendor/FONT-LICENSE.txt](client/vendor/FONT-LICENSE.txt)。本项目的 MIT 许可证不会替代字体的 OFL 许可证或其他依赖的许可证。

分发包含这些第三方组件的插件时，应同时保留相关组件适用的版权和许可证声明，以及本项目的许可证。
