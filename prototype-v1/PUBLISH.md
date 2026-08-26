# 发布 PandaClaw 到 GitHub 手动指南

## 步骤 1: 在 GitHub 网站创建仓库

1. 打开浏览器，访问 https://github.com/new
2. 填写信息：
   - Repository name: `pandaclaw`
   - Description: `民主协商决策系统 - 多智能体协作决策框架`
   - 选择 Public（公开）或 Private（私有）
   - **不要勾选** "Add a README file"（已有）
   - **不要勾选** "Add .gitignore"（已有）
   - License: 选择 MIT（已有，可不选）
3. 点击 **Create repository**

## 步骤 2: 推送本地代码

创建仓库后，GitHub 会显示推送命令。在终端执行：

```powershell
cd C:\Users\35258\.openclaw\workspace\pandaclaw

# 添加远程仓库（替换 YOUR_USERNAME 为你的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/pandaclaw.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

## 步骤 3: 更新 package.json

编辑 `package.json`，更新 repository.url：
```json
"repository": {
  "type": "git",
  "url": "https://github.com/YOUR_USERNAME/pandaclaw.git"
}
```

然后提交更新：
```powershell
git add package.json
git commit -m "📝 更新仓库地址"
git push
```

## 可选：使用 GitHub Token 推送

如果需要 Token 认证：

1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. 勾选 `repo` 权限
4. 生成 Token 并复制

推送时使用：
```powershell
git remote set-url origin https://YOUR_TOKEN@github.com/YOUR_USERNAME/pandaclaw.git
git push -u origin main
```

---

## 项目信息

| 项目 | 值 |
|------|-----|
| 名称 | PandaClaw |
| 描述 | 民主协商决策系统 |
| 许可证 | MIT |
| 文件数 | 24 |
| 代码行数 | 5,954 |

---

🐼 PandaClaw - 民主协商，科学决策