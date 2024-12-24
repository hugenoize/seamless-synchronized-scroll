/// <reference types="node" />

import * as vscode from 'vscode';

// 添加一个延迟函数
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 激活插件时调用的函数
 * @param context 插件上下文
 */
export function activate(context: vscode.ExtensionContext) {
    // 创建输出面板并显示
    // const outputChannel = vscode.window.createOutputChannel('Seamless Scroll');
    // outputChannel.show(true);

    // 跟踪同步状态
    let isSyncEnabled = false;
    let visibleRangesListener: vscode.Disposable | undefined;

    // 创建一个防抖函数，避免频繁触发
    function debounce<T extends (...args: any[]) => any>(
        func: T,
        wait: number
    ): (...args: Parameters<T>) => void {
        let timeout: NodeJS.Timeout | null = null;
        return (...args: Parameters<T>) => {
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(() => {
                func(...args);
                timeout = null;
            }, wait);
        };
    }

    // 将 processLeftEditor 函数移到这里，让所有处理函数都能访问
    async function processLeftEditor(baseEditor: vscode.TextEditor) {
        const currentViewColumn = baseEditor.viewColumn;
        if (!currentViewColumn) {
            return;
        }

        // outputChannel.appendLine('--------------------------');

        // 获取基准编辑器的第一可见行
        const baseEditorVisibleRanges = baseEditor.visibleRanges;
        const baseEditorTopLineNumber = baseEditorVisibleRanges[0].start.line;

        // 获取所有可见的编辑器
        const visibleEditors = vscode.window.visibleTextEditors;

        // 检查左侧编辑器
        const leftEditor = visibleEditors.find((editor: vscode.TextEditor) => 
            editor.viewColumn === currentViewColumn - 1 && 
            editor.document.uri.toString() === baseEditor.document.uri.toString()
        );

        if (!leftEditor) {
            // outputChannel.appendLine(`列 ${currentViewColumn - 1} 不存在相同的文件，处理结束`);
            return;
        }

        // await delay(1000);
        // outputChannel.appendLine(`处理列 ${leftEditor.viewColumn} 的 editor`);
        // outputChannel.appendLine(`base editor 第一可见行: ${baseEditorTopLineNumber}`);

        // 获取左侧编辑器可见行数
        const leftEditorVisibleRanges = leftEditor.visibleRanges;
        const leftEditorVisibleLines = leftEditorVisibleRanges[0].end.line - leftEditorVisibleRanges[0].start.line;

        // await delay(1000);

        // 计算左侧编辑器应该滚动到的行号
        const targetLine = Math.max(0, baseEditorTopLineNumber - leftEditorVisibleLines - 2); // 这里的 -2 是冗余量，让两个editor之间，有一部分内容是重叠的，这样基本上就不会有大的问题
        // outputChannel.appendLine(`左侧编辑器可见行数: ${leftEditorVisibleLines}，计算出的目标行号: ${targetLine}`);
        
        // await delay(1000);
        // outputChannel.appendLine('执行滚动');

        // 将左侧编辑器滚动到目标行
        await leftEditor.revealRange(
            new vscode.Range(targetLine, 0, targetLine, 0),
            vscode.TextEditorRevealType.AtTop
        );

        // 微调滚动位置。由于vs code的滚动机制是以"逻辑行数"为单位的，无法用精确的换行后的"实际行数"，或者页面高度百分比、绝对值为单位进行精确滚动，所以，当文档有换行时，滚动起来就非常的不精确，所以我考虑引入了滚动之后继续进行微调的处理。我曾一度觉得微调处理太麻烦了，不想用了，直接在上面的代码中设计了冗余量，让两个editor之间，有一部分内容是重叠的，这样基本上就不会有大的问题。但是实践中发现，有的文档里，有的"行"很长，一换行就一大段，这样就会造成非常大的误差，可能会造成两个编辑器之间衔接不上，所以微调还是得要
        let attempts = 0;
        const maxAttempts = 2; // 微调次数

        const adjustScroll = async (): Promise<void> => {
            if (attempts >= maxAttempts) {
                // outputChannel.appendLine('达到最大调整次数，停止调整');
                return;
            }

            await delay(100); // 这个延迟不得不加。因为滚动操作是异步的，它返回的 Promise 并不会等待滚动动画完成，如果不加延迟，可能会导致滚动操作还没有完成，就进行下面的操作，会导致读到错误的数据。
            const leftEditorNewVisibleRanges = leftEditor.visibleRanges;
            // 获取左侧编辑器的最后可见行
            const leftEditorBottomLineNumber = leftEditorNewVisibleRanges[0].end.line;
            
            // 计算需要调整的行数：基准编辑器顶部行 - 左侧编辑器底部行
            const gapBetween2Editors = baseEditorTopLineNumber - leftEditorBottomLineNumber;
            // outputChannel.appendLine(`开始第 ${attempts + 1} 次微调 - 左侧编辑器底部行号: ${leftEditorBottomLineNumber}。与 base editor 的 gap：${gapBetween2Editors}`);

            if (gapBetween2Editors > 0 || gapBetween2Editors <= -4) { // 如果两个编辑器之间有空缺，或者重叠部份太多，则需要进行微调，如果仅仅重叠三行则不调整
                // outputChannel.appendLine(`步骤 ${attempts + 1} : 执行滚动命令 - 滚动方向: ${gapBetween2Editors > 0 ? '向上' : '向下'}`);

                // 获取左侧编辑器当前的第一可见行
                const leftEditorNewTopLineNumber = leftEditorNewVisibleRanges[0].start.line;
                // 计算新的目标行号
                const newTargetLine = Math.max(0, leftEditorNewTopLineNumber + gapBetween2Editors + 2); // 这里加2，是设计的一个冗余量，是为了让两个editor之间，有一部分内容是重叠的，这样基本上就不会有大的问题
                
                // 使用 revealRange 来滚动左侧编辑器
                await leftEditor.revealRange(
                    new vscode.Range(newTargetLine, 0, newTargetLine, 0),
                    vscode.TextEditorRevealType.AtTop
                );
                
                attempts++;
                // outputChannel.appendLine(`- 执行完成`);
                
                // await delay(1000);
                return adjustScroll();
            } else {
                // outputChannel.appendLine('- 无需调整');
                return Promise.resolve();
            }
        };

        // 等待微调完全结束
        await adjustScroll();

        // 微调完成后，继续处理左边的编辑器，将当前的左侧编辑器作为新的基准编辑器
        await processLeftEditor(leftEditor);
    }

    // 处理右侧编辑器链
    async function processRightEditor(baseEditor: vscode.TextEditor) {
        const currentViewColumn = baseEditor.viewColumn;
        if (!currentViewColumn) {
            return;
        }

        // outputChannel.appendLine('--------------------------');

        // 获取基准编辑器的最后可见行
        const baseEditorVisibleRanges = baseEditor.visibleRanges;
        const baseEditorBottomLineNumber = baseEditorVisibleRanges[0].end.line;

        // 获取所有可见的编辑器
        const visibleEditors = vscode.window.visibleTextEditors;

        // 检查右侧编辑器
        const rightEditor = visibleEditors.find((editor: vscode.TextEditor) => 
            editor.viewColumn === currentViewColumn + 1 && 
            editor.document.uri.toString() === baseEditor.document.uri.toString()
        );

        if (!rightEditor) {
            // outputChannel.appendLine(`列 ${currentViewColumn + 1} 不存在相同的文件，处理结束`);
            return;
        }

        // 计算右侧编辑器应该滚动到的行号
        const targetLine = Math.max(0, baseEditorBottomLineNumber - 2); // -2 是重叠量
        
        // 将右侧编辑器滚动到目标行
        await rightEditor.revealRange(
            new vscode.Range(targetLine, 0, targetLine, 0),
            vscode.TextEditorRevealType.AtTop
        );

        // 微调滚动位置
        let attempts = 0;
        const maxAttempts = 2;

        const adjustScroll = async (): Promise<void> => {
            if (attempts >= maxAttempts) {
                // outputChannel.appendLine('达到最大调整次数，停止调整');
                return;
            }

            await delay(100);
            const rightEditorNewVisibleRanges = rightEditor.visibleRanges;
            // 获取右侧编辑器的第一可见行
            const rightEditorTopLineNumber = rightEditorNewVisibleRanges[0].start.line;
            
            // 计算差距：基准编辑器底部行 - 右侧编辑器顶部行
            const gapBetween2Editors = baseEditorBottomLineNumber - rightEditorTopLineNumber;
            // outputChannel.appendLine(`开始第 ${attempts + 1} 次微调 - 右侧编辑器顶部行号: ${rightEditorTopLineNumber}。与 base editor 的 gap：${gapBetween2Editors}`);

            if (gapBetween2Editors > 2 || gapBetween2Editors <= -1) { // 如果重叠太多（多于2行）或者有空隙（小于-1行），需要调整
                // outputChannel.appendLine(`步骤 ${attempts + 1} : 执行滚动命令 - 滚动方向: ${gapBetween2Editors > 0 ? '向上' : '向下'}`);

                const rightEditorNewTopLineNumber = rightEditorNewVisibleRanges[0].start.line;
                const newTargetLine = Math.max(0, rightEditorNewTopLineNumber + gapBetween2Editors - 2); // -2 确保重叠
                
                await rightEditor.revealRange(
                    new vscode.Range(newTargetLine, 0, newTargetLine, 0),
                    vscode.TextEditorRevealType.AtTop
                );
                
                attempts++;
                return adjustScroll();
            } else {
                // outputChannel.appendLine('- 无需调整');
                return Promise.resolve();
            }
        };

        await adjustScroll();

        // 继续处理右边的编辑器
        await processRightEditor(rightEditor);
    }

    // 在处理可见范围变化的函数中同时处理左右两边
    const handleVisibleRangesChange = async (editor: vscode.TextEditor) => {
        if (!editor.visibleRanges.length) return;

        // outputChannel.appendLine('=========================');
        // outputChannel.appendLine('编辑器可见范围发生变化');
        
        // 同时处理左右两边的编辑器链
        await Promise.all([
            processLeftEditor(editor),
            processRightEditor(editor)
        ]);
    };

    // 使用防抖包装处理函数
    const debouncedHandler = debounce(handleVisibleRangesChange, 100);

    // 启用同步功能
    function enableSync() {
        isSyncEnabled = true;
        // 更新按钮状态
        vscode.commands.executeCommand(
            'setContext',
            'seamless-synchronized-scroll.enabled',
            true
        );
        
        // 注册可见范围变化事件监听
        visibleRangesListener = vscode.window.onDidChangeTextEditorVisibleRanges((event: vscode.TextEditorVisibleRangesChangeEvent) => {
            const activeEditor = vscode.window.activeTextEditor;
            // 只处理当前激活的编辑器的可见范围变化
            if (activeEditor && event.textEditor === activeEditor) {
                debouncedHandler(event.textEditor);
            }
        });

        // 将监听器添加到订阅中
        if (visibleRangesListener) {
            context.subscriptions.push(visibleRangesListener);
        }

        // outputChannel.appendLine('同步功能已启用');
    }

    // 禁用同步功能
    function disableSync() {
        isSyncEnabled = false;
        // 更新按钮状态
        vscode.commands.executeCommand(
            'setContext',
            'seamless-synchronized-scroll.enabled',
            false
        );
        
        // 移除事件监听器
        if (visibleRangesListener) {
            visibleRangesListener.dispose();
            visibleRangesListener = undefined;
        }

        // outputChannel.appendLine('同步功能已禁用');
    }

    // 注册启用命令
    let enableCommand = vscode.commands.registerCommand('seamless-synchronized-scroll.toggleSync', async () => {
        // outputChannel.appendLine('=========================');
        
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            // outputChannel.appendLine('错误: 没有打开的编辑器');
            vscode.window.showInformationMessage('没有打开的编辑器');
            return;
        }

        // 启用同步
        enableSync();
        // 执行初始同步
        await Promise.all([
            processLeftEditor(activeEditor),
            processRightEditor(activeEditor)
        ]);
    });

    // 注册禁用命令
    let disableCommand = vscode.commands.registerCommand('seamless-synchronized-scroll.disableSync', () => {
        // 禁用同步
        disableSync();
    });

    // 将命令添加到订阅中
    context.subscriptions.push(enableCommand, disableCommand);
}

/**
 * 插件停用时调用的函数
 */
export function deactivate() {} 