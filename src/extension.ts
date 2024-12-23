// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { BranchProvider, BranchItem } from './branchProvider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "git-branch-manager" is now active!');

	// 创建分支树视图提供者
	const branchProvider = new BranchProvider();
	
	// 注册树视图
	const treeView = vscode.window.createTreeView('gitBranchManager', {
		treeDataProvider: branchProvider,
		canSelectMany: true
	});

	// 监听选择变化
	let lastSelection = new Set<string>();
	treeView.onDidChangeSelection(async e => {
		const currentSelection = new Set(e.selection.map(item => item.label));
		
		// 处理单个分支的选择变化
		if (e.selection.length === 1) {
			const item = e.selection[0];
			if (!item.isCurrent && !branchProvider.isProtectedBranch(item.label)) {
				const wasSelected = branchProvider.isChecked(item.label);
				await branchProvider.handleCheckboxChange(item, !wasSelected);
			}
		} 
		// 处理多选
		else if (e.selection.length > 1) {
			// 清除之前的选择
			branchProvider.clearChecked();
			// 添加新的选择
			for (const item of e.selection) {
				if (!item.isCurrent && !branchProvider.isProtectedBranch(item.label)) {
						await branchProvider.handleCheckboxChange(item, true);
				}
			}
		}
		
		lastSelection = currentSelection;
	});

	// 注册删除命令
	let deleteCommand = vscode.commands.registerCommand('gitBranchManager.deleteBranches', async () => {
		const selectedBranches = branchProvider.getCheckedBranches();
		if (selectedBranches.length === 0) {
			vscode.window.showInformationMessage('请选择要删除的分支');
			return;
		}

		const confirm = await vscode.window.showWarningMessage(
			`确定要删除选中的 ${selectedBranches.length} 个分支吗？`,
			{ modal: true },
			'确定'
		);

		if (confirm === '确定') {
			try {
				await branchProvider.deleteBranches(selectedBranches);
				vscode.window.showInformationMessage('分支删除成功！');
				// 删除成功后清空选择状态
				lastSelection.clear();
			} catch (error: unknown) {
				if (error instanceof Error) {
					vscode.window.showErrorMessage(`删除分支失败: ${error.message}`);
				} else {
					vscode.window.showErrorMessage('删除分支失败');
				}
			}
		}
		
		// 刷新视图以更新状态
		branchProvider.refresh();
	});

	// 注重命名命令
	let renameCommand = vscode.commands.registerCommand('gitBranchManager.renameBranch', async (item: BranchItem) => {
		const newName = await vscode.window.showInputBox({
			prompt: '请输入新的分支名',
			placeHolder: '新分支名',
			value: item.label
		});

		if (!newName) {
			return;
		}

		if (newName === item.label) {
			return;
		}

		try {
			if (item.isCurrent) {
				const confirm = await vscode.window.showWarningMessage(
					'重命名当前分支需要临时切换到其他分支，是否继续？',
					{ modal: true },
					'确定'
				);
				if (confirm !== '确定') {
					return;
				}
			}
			
			await branchProvider.renameBranch(item.label, newName, item.isCurrent);
			vscode.window.showInformationMessage(`分支已重命名为: ${newName}`);
		} catch (error: unknown) {
			if (error instanceof Error) {
				vscode.window.showErrorMessage(error.message);
			}
		}
	});

	// 注册全选命令
	let selectAllCommand = vscode.commands.registerCommand('gitBranchManager.selectAll', async () => {
		try {
			await branchProvider.selectAllBranches();
			// 更新命令标题
			await vscode.commands.executeCommand(
				'setContext',
				'gitBranchManager.isAllSelected',
				branchProvider.isAllSelected
			);
		} catch (error: unknown) {
			if (error instanceof Error) {
				vscode.window.showErrorMessage(`全选操作失败: ${error.message}`);
			}
		}
	});

	// 注册筛选命令
	const patterns = [
		{ name: 'develop', icon: '$(versions)' },
		{ name: 'feature', icon: '$(package)' },
		{ name: 'hotfix', icon: '$(tools)' },
		{ name: 'release', icon: '$(tag)' }
	];
	
	patterns.forEach(({ name, icon }) => {
		let command = vscode.commands.registerCommand(
				`gitBranchManager.select${name.charAt(0).toUpperCase() + name.slice(1)}`,
				async () => {
					try {
						const isSelected = await branchProvider.selectBranchesByPattern(name);
						// 更新命令标题以反映状态
						await vscode.commands.executeCommand(
							'setContext',
							`gitBranchManager.${name}Selected`,
							isSelected
						);
					} catch (error: unknown) {
						if (error instanceof Error) {
							vscode.window.showErrorMessage(`选择${name}分支失败: ${error.message}`);
						}
					}
				}
			);
		context.subscriptions.push(command);
	});

	// 注册复制分支名命令
	let copyCommand = vscode.commands.registerCommand('gitBranchManager.copyBranchName', async (item: BranchItem) => {
		try {
			await vscode.env.clipboard.writeText(item.label);
			vscode.window.showInformationMessage(`已复制分支名: ${item.label}`);
		} catch (error) {
			vscode.window.showErrorMessage('复制分支名失败');
		}
	});

	context.subscriptions.push(treeView, deleteCommand, renameCommand, selectAllCommand, copyCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
