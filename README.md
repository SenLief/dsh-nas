# DeepSeek DSH：绿联 DXP4800 Plus 部署

[![Build and publish DSH image](https://github.com/SenLief/dsh-nas/actions/workflows/build-image.yml/badge.svg)](https://github.com/SenLief/dsh-nas/actions/workflows/build-image.yml)

仓库：[SenLief/dsh-nas](https://github.com/SenLief/dsh-nas)。镜像：`ghcr.io/senlief/dsh-nas:latest`。

使用官方 npm 包 `@deepseek-ai/dsh@0.2.0-rc.2`，GitHub Actions 构建 `linux/amd64` 镜像并推送到你的 GitHub Container Registry（GHCR），NAS 通过 Compose 拉取运行。

本配置按内网使用要求默认免登录，直接打开 NAS 地址即可。官方 npm 版没有关闭网页登录的开关，因此镜像构建时会应用本目录的版本限定补丁；这属于本镜像的定制行为。

这是 DeepSeek Harness 的 Web 服务，模型通过 API 调用。安装它不会在 NAS 上下载或运行 DeepSeek 模型权重。

## 文件

- `Dockerfile`：Node 24 / Debian，构建阶段安装 npm 包和 native 依赖；以 UID/GID `1000:1000` 的 node 用户运行。
- `.github/workflows/build-image.yml`：构建、真实启动检查、推送 GHCR。
- `compose.yaml`：NAS 部署，持久化用户目录、独立挂载工作目录。
- `docker-entrypoint.sh`、`healthcheck.cjs`：镜像必需的辅助文件，不要遗漏。
- `patch-browser-auth.cjs`：构建时加入免登录开关、容器 IPv4 监听及内网设置持久化及工作区默认路径补丁，仅支持已核对的 `0.2.0-rc.2`；不匹配的版本会中止构建。
- `patch-mobile-ui.cjs`、`mobile-ui.css`：手机设置全屏单列、顶部分类导航及侧栏抽屉，版本限定为 `0.2.0-rc.2`。
- `.env.example`：NAS 部署参数模板。
- `.github/scripts/smoke-test.py`：无须 API Key 的免登录与令牌登录两种模式验证。
- `.github/scripts/settings-browser-test.cjs`：Chromium 模拟非 localhost 访问，验证模型设置目录、保存和刷新后持久化；只使用无效测试密钥，不请求模型服务。

## 1. 上传到自己的 GitHub 仓库

本目录是 `SenLief/dsh-nas` 的仓库根目录，默认分支为 `main`。构建文件位于根目录，工作流位于 `.github/workflows/build-image.yml`。

推送到 `main` / `master` 会触发构建，也可打开 Actions → **Build and publish DSH image** → **Run workflow**，选择默认分支执行。

工作流使用自动提供的 `GITHUB_TOKEN` 和 `packages: write` 权限，无须创建 Docker Hub 账号，也无须额外保存 GHCR 推送密码。组织仓库需要组织策略允许发布 Packages。

只有默认分支会推送镜像；Pull Request 和其他分支上的手动运行只构建、验证。

生成的镜像地址自动使用小写的 GitHub 用户名/组织名及仓库名：

```text
ghcr.io/senlief/dsh-nas:latest
ghcr.io/senlief/dsh-nas:dsh-0.2.0-rc.2
ghcr.io/senlief/dsh-nas:sha-提交哈希前12位
```

`dsh-版本号` 标识包版本，同一包版本重新构建可覆盖该标签；需要固定某次镜像，可使用 GHCR 显示的 `@sha256:...` digest。

当前 `ghcr.io/senlief/dsh-nas:latest` 已验证可以匿名拉取，NAS 无须登录 GHCR。若迁移到新仓库，首次发布后应检查 Package 可见性；需要匿名拉取时，在 **Package settings → Change visibility** 设置为 **Public**。

如果保留私有镜像，NAS 必须先用有该包读取权限的 GitHub classic PAT（`read:packages`）登录 `ghcr.io`。在终端交互式执行 `docker login ghcr.io -u 你的用户名`，在密码提示处输入 PAT，不要把 PAT 写进 Compose。

## 2. 在 NAS 配置 Compose

在 NAS 创建专用应用目录，将 `compose.yaml` 和 `.env.example` 放进去，复制模板：

```sh
cp .env.example .env
```

编辑 `.env`，至少修改镜像地址和 NAS 的真实局域网 IPv4：

```dotenv
DSH_IMAGE=ghcr.io/senlief/dsh-nas:latest
NAS_IP=192.168.1.20
DSH_PORT=3080
DSH_DISABLE_BROWSER_AUTH=1
WORKSPACE_DIR=./workspace
DSH_EXTRA_TRUSTED_HOSTS=
TZ=Asia/Shanghai
```

镜像地址已配置为本仓库的 GHCR 地址。`NAS_IP` 必须换成实际地址，不要填容器 IP，也不要包含 `http://`。`WORKSPACE_DIR` 可以改成 NAS 上实际存在的绝对路径，容器内始终使用 `/workspace`。

通过 NAS SSH，在应用目录创建专用工作目录并授权容器用户：

```sh
mkdir -p workspace
sudo chown 1000:1000 workspace
sudo chmod 700 workspace
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose logs --tail=100 dsh
```

上面的授权命令只针对新建的专用目录；若挂载已有 NAS 共享目录，使用 UGOS 的权限/ACL 管理给 UID 1000 写入权限，不要直接递归修改整个共享目录所有权。

也可以在 UGOS Docker 应用的 Compose 项目功能中导入 `compose.yaml`，并确保 `.env` 与其位于同一项目目录。

## 3. 打开 Web 页面

日志准备完成后，直接访问 `.env` 中的 `NAS_IP:DSH_PORT`：

```text
http://192.168.1.20:3080/
```

默认无须 token 或登录 Cookie，重启后也可直接访问。日志中的 `127.0.0.1` 是 DSH 发布版固定打印的地址，浏览器应使用 NAS 的真实地址。

目录选择器默认打开容器的 `/workspace`，对应 NAS 的 `WORKSPACE_DIR`（默认 `./workspace`）。首次自动工作区位于 `/workspace/default-workspace`；在这里新建项目目录，如 `/workspace/my-project`，文件会出现在 NAS 的 `./workspace/my-project`。

进入设置 → 模型，填写自己的 DeepSeek API Key 并保存；选择相应工作区后开始任务。API Key 会随 DSH 配置保存在持久化用户目录中，不进入镜像或 GitHub 构建过程。

默认只向 `.env` 指定的 NAS 网络接口发布端口。免登录时，能访问该端口的内网用户都能操作 DSH；API 的 Host/Origin 校验仍保留。

若以后恢复官方网页登录，将 `.env` 中的 `DSH_DISABLE_BROWSER_AUTH` 改为 `0`，运行 `docker compose up -d`。此时首次访问需从日志获取 `/?token=...` 链接，把地址换成 `NAS_IP:DSH_PORT` 并保留 token，浏览器随后保存登录 Cookie。

`DSH_DISABLE_BROWSER_AUTH` 是本镜像加入的变量；仅给未经补丁的官方 npm 包设置该变量不会生效。直接运行镜像而不使用此 Compose 时，变量默认为 `0`。

### 提供商目录加载失败

`0.2.0-rc.2` 原始前端仅在 localhost/回环访问时读取服务器设置。通过 NAS IP 访问时会出现 `加载提供商目录失败: settings are unavailable in this browser`。本镜像已加入内网设置补丁，信任的 NAS 地址与 localhost 使用同一份持久化配置，Host/Origin 校验仍保留。

若遇到此错误，执行 `docker compose pull && docker compose up -d --force-recreate`，随后刷新网页（必要时强制刷新）。此操作保留命名卷里的配置和凭据。

### 工作区创建到了 dsh_home

原始 npm 版本的目录选择器默认打开用户主目录 `/home/node`，与 Docker `WORKDIR` 无关。本镜像用 `DSH_WORKSPACE_ROOT=/workspace` 设置目录选择器的初始位置和首次自动工作区的位置。这个变量是容器路径；NAS 上的实际目录仍通过 `.env` 的 `WORKSPACE_DIR` 配置。HOME 保留为 `/home/node`，凭据、会话和缓存继续存入 `dsh_home`。

已有工作区会保留登记的绝对路径，升级不会自动搬动文件或改写历史会话。对于之前误建在 `/home/node/项目名` 的工作区，可以：

1. 停止该工作区中运行的任务。
2. 在 NAS 的 Compose 应用目录，用 `docker compose cp dsh:/home/node/项目名 ./workspace/` 复制项目文件。只复制具体项目目录，不要复制整个 `/home/node` 或 `.dsh`。
3. 给复制后的项目目录配置 UID/GID 1000 的写入权限。
4. 在 Web 页面添加 `/workspace/项目名` 作为工作区，核对文件后使用新位置。已有会话仍关联旧路径；重新添加目录不会自动迁移会话。

保留旧目录作为备份，确认后自行整理。工作区登记信息和会话记录保存在 `dsh_home` 属于正常现象，项目实际文件才应在 `WORKSPACE_DIR`。

### 手机界面

浏览器宽度不超过 768px 时，设置页使用全屏单列，分类在顶部横向切换；标签、输入框和主题选项适配窄屏。主侧栏默认隐藏，顶部菜单按钮打开覆盖式抽屉；点击遮罩、按 Escape、新建会话或选择会话后关闭。抽屉打开时背景不参与键盘导航，关闭后恢复菜单焦点。桌面布局继续使用上游样式。

界面改动通过构建时的 `patch-mobile-ui.cjs` 和 `mobile-ui.css` 注入实际 npm 前端包；CSS 模块类名从该版本的编译包中解析。包版本或预期代码不匹配时中止构建。自定义手机样式可编辑 `mobile-ui.css` 后重建镜像。

更新后执行 `docker compose pull && docker compose up -d --force-recreate`，并强制刷新手机网页。Actions 会验证 320、393、430、768px 的布局、抽屉交互以及 1280px 的桌面设置布局，并在 `mobile-ui-previews` 产物中保存截图。

## 数据、更新与排错

- 命名卷 `dsh_home` 挂载到 `/home/node`，包含 `.dsh` 配置、凭据、会话、插件及缓存；工作文件保存在 `WORKSPACE_DIR`。
- 备份时先执行 `docker compose stop`，同时备份命名卷和工作目录。`docker compose down -v` 会删除命名卷，包含配置和凭据。
- 重建 GHCR 镜像后，NAS 执行 `docker compose pull && docker compose up -d` 更新。日常重启不重新从 npm 下载主程序。
- 当前补丁只支持 `0.2.0-rc.2`。升级 npm 包前需检查并适配 `patch-browser-auth.cjs`，再修改 Dockerfile 的 `ARG DSH_VERSION` 或 Actions 的版本输入；版本不匹配时构建会中止。升级前备份数据。
- API 请求出现 403：确认浏览器访问的 IP/域名包含在 `DSH_TRUSTED_HOSTS` 中。Compose 自动信任 `NAS_IP`；额外域名可写入 `.env` 的 `DSH_EXTRA_TRUSTED_HOSTS`，逗号分隔，可带端口，不带协议和路径。修改后运行 `docker compose up -d`。
- EACCES / 工作目录不可写：检查挂载目录是否允许 UID/GID `1000:1000` 写入。
- GHCR 拉取 unauthorized：检查 Package 是否公开，或先登录私有仓库。
- 镜像包含 bash、git、curl、Python 3、ripgrep、bubblewrap 和 pnpm。Office/PDF 转换、浏览器自动化、PowerShell 等扩展可能需要另外安装依赖。Linux 命令沙箱可用性取决于 NAS 内核与 Docker 限制。

此处依据实际发布的 npm 包配置：`0.2.0-rc.2` 的 CLI 不接受 `--host 0.0.0.0`，Web 服务插件的原始 schema 也只允许回环或通配地址。本镜像在构建时适配 schema，并在运行时校验具体 IPv4，入口脚本自动绑定容器 IP。该版本尚不支持最新源码文档中的 `--public-url` 和 `--tls-cert` 参数。反向代理应保留原始 Host，并转发 WebSocket；本配置按根路径部署。

## 验证范围

已核对实际 npm 包的版本和参数，并在 Node 24 下验证免登录访问首页和 API、恢复令牌登录、HTML 以及 Host/Origin 校验。

GitHub Linux runner 上的[构建与验证](https://github.com/SenLief/dsh-nas/actions/runs/38119221415)已成功，包含实际 Docker 构建、免登录及令牌登录两种模式的容器启动检查、健康检查、native 终端/bash、工作区路径及真实 Chromium 非 localhost 模型设置验证。镜像已推送到 GHCR，并验证匿名拉取可用。NAS 实机运行需在设备上部署后确认。

本次内网设置修复已在本地运行实际 npm 前端模块：确认原始非 localhost 分支跳过设置，而补丁后成功读取真实服务器的持久化设置和提供商目录。另已验证 Web 页面保存测试密钥。真实 Chromium 的非 localhost 模型设置读写与刷新测试已在上述 Actions 构建中通过；包含本次修复的镜像已发布到 GHCR。本地已在免登录、令牌登录两种模式下通过真实 RPC 验证指定工作区根目录：目录选择器初始位置、首次默认目录、新建子目录及工作区登记位置均正确。Actions 将以容器的 `/workspace` 重跑这些检查。

后续构建继续执行这些检查，全部通过后才推送镜像。

参考：[官方项目](https://github.com/deepseek-ai/deepseek-harness)、[官方 npm 包](https://www.npmjs.com/package/@deepseek-ai/dsh)、[GHCR 发布文档](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)。
