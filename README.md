# Git Branch Manager

Git Branch Manager 是一个强大的 VS Code 扩展，提供了直观的 Git 分支管理功能，支持批量操作、按类型筛选等特性。

## 功能特点

### 1. 分支可视化

- 清晰展示所有 Git 分支
- 标记当前分支和受保护分支（master/main）
- 实时监听分支变化，自动更新视图

### 2. 批量选择

- ✨ 支持单个分支选择/取消选择
- 🔍 按分支类型筛选（develop/feature/hotfix/release）
- ✅ 一键全选功能
- 🎯 支持 Ctrl/Cmd 多选

### 3. 分支操作

- 🗑️ 批量删除选中分支
- ✏️ 重命名分支（支持重命名当前分支）
- 📋 快速复制分支名
- 🛡️ 内置分支保护（master/main）

## 使用方法

1. **打开扩展**

   - 点击 VS Code 侧边栏的分支图标打开扩展

2. **分支选择**

   - 单击分支前的复选框选择单个分支
   - 使用工具栏的类型按钮筛选特定类型的分支
   - 点击全选按钮选择所有可选分支

3. **批量删除**

   - 选择要删除的分支
   - 点击工具栏的删除按钮
   - 确认删除操作

4. **分支重命名**

   - 点击分支旁的编辑图标
   - 输入新的分支名
   - 对于当前分支，会自动处理切换过程

5. **复制分支名**
   - 点击分支旁的复制图标即可复制分支名到剪贴板

## 工具栏按钮说明

| 图标         | 功能    | 说明                  |
| ------------ | ------- | --------------------- |
| $(check-all) | 全选    | 选择所有非保护分支    |
| $(versions)  | develop | 选择所有 develop 分支 |
| $(package)   | feature | 选择所有 feature 分支 |
| $(tools)     | hotfix  | 选择所有 hotfix 分支  |
| $(tag)       | release | 选择所有 release 分支 |
| $(trash)     | 删除    | 删除选中的分支        |

## 注意事项

- master 和 main 分支受保护，不能被选择或删除
- 当前检出的分支不能被删除，但可以重命名
- 重命名当前分支时会临时切换到其他分支
- 删除操作不可撤销，请谨慎操作

## 问题反馈

如果您在使用过程中遇到任何问题，或有功能建议，欢迎在 GitHub 仓库提交 Issue。

## License

MIT License - 详见 LICENSE 文件

---

**享受更轻松的分支管理体验！** 🚀
