# 🐧 Windows 迁移至 Linux 恢复指南 (`LINUX_MIGRATION.md`)

本文档记录了「喵的粮仓 (`personal-asset-pwa`)」从 Windows 迁移至 Linux 开发环境的完整检查结果、环境信息、快速恢复启动步骤与浏览器记账数据迁移流程。

---

## 一、原 Windows 环境版本信息与本地文件核查

| 项目 | 详情 |
| :--- | :--- |
| **Node.js 版本 (`node -v`)** | `v22.23.2`（建议 Linux 下使用 Node `>= 18.x`，推荐 `v20` / `v22` LTS） |
| **npm 版本 (`npm -v`)** | `12.0.2` |
| **远程仓库地址** | `https://github.com/MountainXia/miaowu.git` |
| **分支同步状态** | `main` 与 `dev` 分支均已完整提交并推送到远端，`git stash` 为空 |
| **未纳入 Git 的本地私有/敏感文件** | **无（0 个）**。经核查，项目为纯前端零外部构建依赖架构（Vue 3 已内置于 `vendor/vue.global.prod.js`，服务端 `server.js` 仅使用 Node 原生模块），无 `.env*`、无私有证书或未跟踪静态资源，无需额外拷贝私有压缩包 |
| **Linux 路径与大小写排雷** | 已扫描 `index.html`、`sw.js`、`manifest.json`、`db.js`、`server.js`、`components/CatButler.js` 中全部 86 项文件与图标引用路径，**0 处大小写不一致、0 处反斜杠 `\`** |
| **跨平台换行符规范** | 已配置 `.gitattributes` 强制 `* text=auto eol=lf`，避免 Linux 下 `git status` 因 `CRLF` 整片飘红 |

---

## 二、迁移前：在旧电脑浏览器中导出记账数据备份

由于真实的个人资产账目存储在浏览器本地（`IndexedDB` + `LocalStorage`），不会随 Git 代码仓库同步，请在切换系统前先导出备份：

1. 在原 Windows 浏览器打开应用，点击右上角 **「⚙️ 粮仓设置」 -> 「🧹 重置设置」**；
2. 在 **「📦 全量数据备份与跨端恢复」** 卡片中，点击 **「⬇️ 导出全量 JSON 备份」**；
3. 浏览器会自动下载形如 `miaowu-backup-YYYY-MM-DD.json` 的文件，该文件已 100% 包含：
   - `accounts`：全部账户（含余额、信用卡额度、图标、配色、备注）；
   - `transactions`：全部收支与转账流水（含 Base64 压缩票据凭证图片 `receiptImage`）；
   - `trendSnapshots`：全部历史资产净值趋势快照；
   - `marketSymbols` / `showMarketBoard`：自选行情代码列表与看板开关；
   - `catButlerFavAccounts` / `catButlerFabPos`：「喵咪管家」常用账户勾选配置与悬浮球贴边位置；
   - `accountOrder` / `catTheme` / 隐私暗号锁等全部 `LocalStorage` 个性化配置。

---

## 三、Linux 新环境拉取、启动与测试命令

在 Linux 终端（Bash / Zsh）中依次执行以下命令即可一键恢复开发环境：

```bash
# 1. 克隆仓库并进入项目目录
git clone https://github.com/MountainXia/miaowu.git
cd miaowu

# 2. （可选）切换至日常开发分支 dev
git checkout dev

# 3. 无需 npm install（本项目零第三方 npm 依赖，开箱即用）
# 直接启动本地开发服务（默认监听 http://localhost:8080）
npm run dev
# 或直接运行：
# node server.js

# 4. 在新终端运行全量自动化测试套件（共 10 项测试）
npm test
```

> **提示**：若 Linux 下 `8080` 端口被占用，可通过环境变量指定端口启动：
> ```bash
> PORT=3000 npm start
> ```

---

## 四、Linux 浏览器恢复全量记账数据

1. 在 Linux 浏览器访问 `http://localhost:8080`（或线上 GitHub Pages 地址）；
2. 点击右上角 **「⚙️ 粮仓设置」 -> 「🧹 重置设置」**；
3. 点击 **「⬆️ 导入 JSON 恢复数据」**，选择之前导出的 `miaowu-backup-YYYY-MM-DD.json` 文件并确认；
4. 页面将自动还原所有账户、流水、凭证图片、趋势折线、自选行情及「喵咪管家」常用账户设置。
