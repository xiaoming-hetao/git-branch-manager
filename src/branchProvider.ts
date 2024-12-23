import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class BranchItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly isCurrent: boolean = false,
        public readonly isProtected: boolean = false
    ) {
        super(label, collapsibleState);
        this.contextValue = isProtected ? 'protectedBranch' : (isCurrent ? 'currentBranch' : 'branch');
        this.description = isCurrent ? '(当前分支)' : (isProtected ? '(受保护分支)' : '');
        this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
    }
}

export class BranchProvider implements vscode.TreeDataProvider<BranchItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<BranchItem | undefined | null | void> = new vscode.EventEmitter<BranchItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<BranchItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private checkedBranches: Set<string> = new Set();
    private readonly PROTECTED_BRANCHES = ['master', 'main'];
    private readonly BRANCH_PATTERNS = ['develop', 'feature', 'hotfix', 'release'];
    public isAllSelected: boolean = false;
    private patternStates: Map<string, boolean> = new Map();
    private gitWatchers: vscode.FileSystemWatcher[] = [];

    constructor() {
        // 初始化每种模式的状态
        this.BRANCH_PATTERNS.forEach(pattern => {
            this.patternStates.set(pattern, false);
        });

        // 监听 Git 相关文件的变化
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            // 监听 HEAD 文件变化（分支切换）
            const headWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(workspaceFolder, '.git/HEAD')
            );

            // 监听 refs/heads 目录变化（分支创建、删除、重命名）
            const refsWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(workspaceFolder, '.git/refs/heads/**')
            );

            // 监听 packed-refs 文件变化（打包的引用变化）
            const packedRefsWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(workspaceFolder, '.git/packed-refs')
            );

            // 注册所有文件变化的监听器
            [headWatcher, refsWatcher, packedRefsWatcher].forEach(watcher => {
                watcher.onDidChange(() => this.refresh());
                watcher.onDidCreate(() => this.refresh());
                watcher.onDidDelete(() => this.refresh());
                this.gitWatchers.push(watcher);
            });
        }
    }

    dispose() {
        this.gitWatchers.forEach(watcher => watcher.dispose());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getCheckedBranches(): string[] {
        return Array.from(this.checkedBranches);
    }

    async getBranches(): Promise<{ current: string, all: string[] }> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('没有打开的工作区');
        }

        const { stdout } = await execAsync('git branch', { cwd: workspaceFolder.uri.fsPath });
        const branches = stdout.split('\n')
            .map(b => b.trim())
            .filter(b => b.length > 0);

        const current = branches.find(b => b.startsWith('* '))?.substring(2) || '';
        const all = branches.map(b => b.startsWith('* ') ? b.substring(2) : b);

        return { current, all };
    }

    async deleteBranches(branches: string[]): Promise<void> {
        console.log('正在删除分支:', branches);
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('没有打开的工作区');
        }

        const { current } = await this.getBranches();
        
        const branchesToDelete = branches.filter(branch => 
            !this.PROTECTED_BRANCHES.includes(branch) && 
            branch !== current
        );
        
        if (branchesToDelete.length !== branches.length) {
            const skippedBranches = branches.filter(b => 
                this.PROTECTED_BRANCHES.includes(b) || 
                b === current
            );
            vscode.window.showWarningMessage(
                `已跳过以下分支：${skippedBranches.join(', ')} ` + 
                `(${skippedBranches.includes(current) ? '包含当前分支' : '受保护分支'})`
            );
        }

        for (const branch of branchesToDelete) {
            try {
                await execAsync(`git branch -D "${branch}"`, { cwd: workspaceFolder.uri.fsPath });
            } catch (error) {
                // 如果删除失败，保持选择状态不变
                this.refresh();
                throw new Error(`删除分支 ${branch} 失败: ${error instanceof Error ? error.message : '未知错误'}`);
            }
        }

        // 只有在全部删除成功后才清空选择状态
        this.checkedBranches.clear();
        this.refresh();
    }

    getTreeItem(element: BranchItem): vscode.TreeItem {
        const treeItem = element;
        
        if (element.isCurrent || this.PROTECTED_BRANCHES.includes(element.label)) {
            treeItem.checkboxState = undefined;
            treeItem.tooltip = element.isCurrent ? '不能删除当前分支' : '不能删除受保护分支';
        } else {
            treeItem.checkboxState = this.checkedBranches.has(element.label) 
                ? vscode.TreeItemCheckboxState.Checked 
                : vscode.TreeItemCheckboxState.Unchecked;
        }
        
        return treeItem;
    }

    async getChildren(element?: BranchItem): Promise<BranchItem[]> {
        if (element) {
            return [];
        }

        try {
            const { current, all } = await this.getBranches();
            return all.map(branch => new BranchItem(
                branch,
                vscode.TreeItemCollapsibleState.None,
                branch === current,
                this.PROTECTED_BRANCHES.includes(branch)
            ));
        } catch (error: unknown) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`获取分支失败: ${error.message}`);
            } else {
                vscode.window.showErrorMessage('获取分支失败');
            }
            return [];
        }
    }

    async renameBranch(oldName: string, newName: string, isCurrent: boolean = false): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('没有打开的工作区');
        }

        try {
            if (isCurrent) {
                // 果是当前分支，先切换到其他分支（优先选择 master/main）
                const { all } = await this.getBranches();
                const tempBranch = this.PROTECTED_BRANCHES.find(b => all.includes(b)) || all.find(b => b !== oldName);
                
                if (!tempBranch) {
                    throw new Error('没有可用的分支来切换');
                }

                // 切换到临时分支
                await execAsync(`git checkout "${tempBranch}"`, { cwd: workspaceFolder.uri.fsPath });
                
                // 重命名分支
                await execAsync(`git branch -m "${oldName}" "${newName}"`, { cwd: workspaceFolder.uri.fsPath });
                
                // 切回重命名后的分支
                await execAsync(`git checkout "${newName}"`, { cwd: workspaceFolder.uri.fsPath });
            } else {
                // 非当前分支直接重命名
                await execAsync(`git branch -m "${oldName}" "${newName}"`, { cwd: workspaceFolder.uri.fsPath });
            }
            
            this.refresh();
        } catch (error: unknown) {
            if (error instanceof Error) {
                throw new Error(`重命名分支失败: ${error.message}`);
            }
            throw new Error('重命名分支失败');
        }
    }

    async handleCheckboxChange(item: BranchItem, checked: boolean) {
        if (this.PROTECTED_BRANCHES.includes(item.label)) {
            return;
        }

        if (checked) {
            this.checkedBranches.add(item.label);
        } else {
            this.checkedBranches.delete(item.label);
        }

        await this.recalculateSelectionStates();
        this.refresh();
    }

    private async recalculateSelectionStates() {
        const { current, all } = await this.getBranches();
        
        // 重置所有状态
        this.isAllSelected = false;
        this.BRANCH_PATTERNS.forEach(pattern => {
            this.patternStates.set(pattern, false);
        });

        // 获取所有可选分支
        const selectableBranches = all.filter(b => 
            !this.PROTECTED_BRANCHES.includes(b) && 
            b !== current
        );

        // 如果所有可选分支都被选中，设置全选状态
        if (selectableBranches.length > 0 && 
            selectableBranches.every(b => this.checkedBranches.has(b))) {
            this.isAllSelected = true;
        }

        // 检查每种类型的分支是否全部被选中
        for (const pattern of this.BRANCH_PATTERNS) {
            const patternBranches = selectableBranches.filter(b => b.startsWith(pattern));
            if (patternBranches.length > 0 && 
                patternBranches.every(b => this.checkedBranches.has(b))) {
                this.patternStates.set(pattern, true);
            }
        }
    }

    async selectBranchesByPattern(pattern: string): Promise<boolean> {
        const { current, all } = await this.getBranches();
        const isSelected = this.patternStates.get(pattern) || false;
        
        // 获取该类型的所有可选分支
        const patternBranches = all.filter(b => 
            b.startsWith(pattern) && 
            !this.PROTECTED_BRANCHES.includes(b) && 
            b !== current
        );

        if (!isSelected) {
            // 选中该类型的所有分支
            patternBranches.forEach(b => this.checkedBranches.add(b));
        } else {
            // 取消选中该类型的所有分支
            patternBranches.forEach(b => this.checkedBranches.delete(b));
        }

        await this.recalculateSelectionStates();
        this.refresh();
        return !isSelected;
    }

    async selectAllBranches(): Promise<void> {
        const { current, all } = await this.getBranches();
        
        // 清除现有选择
        this.checkedBranches.clear();
        
        if (!this.isAllSelected) {
            // 选中所有可选分支
            all.forEach(branch => {
                if (!this.PROTECTED_BRANCHES.includes(branch) && branch !== current) {
                    this.checkedBranches.add(branch);
                }
            });
        }

        await this.recalculateSelectionStates();
        this.refresh();
    }

    isProtectedBranch(branchName: string): boolean {
        return this.PROTECTED_BRANCHES.includes(branchName);
    }

    resetCheckedBranches(branches: string[]): void {
        this.checkedBranches.clear();
        branches.forEach(branch => {
            if (!this.PROTECTED_BRANCHES.includes(branch)) {
                this.checkedBranches.add(branch);
            }
        });
        this.refresh();
    }

    isChecked(branchName: string): boolean {
        return this.checkedBranches.has(branchName);
    }

    clearChecked(): void {
        this.checkedBranches.clear();
    }
} 