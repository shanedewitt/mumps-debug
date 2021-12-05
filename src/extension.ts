'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, ProviderResult, DebugConfiguration, CancellationToken } from 'vscode';
import { MumpsDebugSession } from './mumpsDebug';
import { MumpsEvalutableExpressionProvider } from './mumps-evalutable-expression-provider';
import { MumpsHoverProvider } from './mumpsHoverProvider';
import { MumpsDefinitionProvider } from './mumps-definition-provider';
import { MumpsFormattingHelpProvider } from './mumps-formatting-help-provider';
import { MumpsReferenceProvider } from './mumpsReferenceProvider';
import { MumpsSignatureHelpProvider } from './mumpsSignatureHelpProvider';
import { DocumentFunction } from './mumps-documenter';
import { MumpsDocumentSymbolProvider } from './mumps-document';
import { CompletionItemProvider } from './mumps-completion-item-provider';
import * as AutospaceFunction from './mumps-autospace';
import { MumpsHighlighter, SemanticTokens } from './mumps-highlighter';
import expandCompress from './mumpsCompExp';
import updateDiagnostics from './mumpsUpdateDiagnostics';
const fs = require('fs');
let timeout: ReturnType<typeof setTimeout> | undefined;
let entryRef: string | undefined = "";
export async function activate(context: vscode.ExtensionContext) {
	const MUMPS_MODE: vscode.DocumentFilter = { language: 'mumps', scheme: 'file' };
	// register a configuration provider for 'mumps' debug type
	const mumpsDiagnostics = vscode.languages.createDiagnosticCollection("mumps");
	let storage = "";
	if (context.storageUri !== undefined) {
		storage = context.storageUri.fsPath;
		if (!fs.existsSync(storage)) {
			fs.mkdirSync(storage);
		}
		const dbFile = storage + "/labeldb.json";
		context.subscriptions.push(vscode.languages.registerCompletionItemProvider(MUMPS_MODE, new CompletionItemProvider(dbFile)));
	}
	const wsState = context.workspaceState;
	context.subscriptions.push(
		vscode.commands.registerCommand("mumps.documentFunction", () => { DocumentFunction(); }),
		vscode.commands.registerCommand("mumps.autoSpaceEnter", () => { AutospaceFunction.autoSpaceEnter(); }),
		vscode.commands.registerCommand("mumps.autoSpaceTab", () => { AutospaceFunction.autoSpaceTab(); }),
		vscode.commands.registerCommand("mumps.toggleExpandedCommands", () => { expandCompress(wsState) }),
		vscode.commands.registerCommand('mumps.getEntryRef', () => { return getEntryRef() }),
		vscode.languages.registerHoverProvider(MUMPS_MODE, new MumpsHoverProvider()),
		vscode.languages.registerDefinitionProvider(MUMPS_MODE, new MumpsDefinitionProvider()),
		vscode.languages.registerEvaluatableExpressionProvider(MUMPS_MODE, new MumpsEvalutableExpressionProvider()),
		vscode.languages.registerSignatureHelpProvider(MUMPS_MODE, new MumpsSignatureHelpProvider(), '(', ','),
		vscode.languages.registerDocumentSymbolProvider(MUMPS_MODE, new MumpsDocumentSymbolProvider()),
		vscode.languages.registerDocumentSemanticTokensProvider(MUMPS_MODE, MumpsHighlighter, SemanticTokens),
		vscode.languages.registerDocumentFormattingEditProvider(MUMPS_MODE, new MumpsFormattingHelpProvider()),
		vscode.languages.registerDocumentRangeFormattingEditProvider(MUMPS_MODE, new MumpsFormattingHelpProvider()),
		vscode.languages.registerReferenceProvider(MUMPS_MODE, new MumpsReferenceProvider()),
		vscode.debug.registerDebugConfigurationProvider('mumps', new MumpsConfigurationProvider()),
		vscode.debug.registerDebugAdapterDescriptorFactory('mumps', new InlineDebugAdapterFactory()),
		vscode.window.onDidChangeActiveTextEditor(editor => { if (editor) { triggerUpdateDiagnostics(editor.document, mumpsDiagnostics) } }),
		vscode.workspace.onDidChangeTextDocument(editor => { if (editor) { triggerUpdateDiagnostics(editor.document, mumpsDiagnostics) } })
	);
}

export function deactivate() {
	// nothing to do
}

class MumpsConfigurationProvider implements vscode.DebugConfigurationProvider {

	/**
	 * Message a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	*/
	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

		// if launch.json is missing or empty
		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === 'mumps') {
				config.type = 'mumps';
				config.name = 'Launch';
				config.request = 'launch';
				config.program = '${file}';
				config.stopOnEntry = true;
				config.hostname = '192.168.0.1';
				config.localRoutinesPath = 'y:\\';
				config.port = 9000;
			}
		}

		if (!config.program) {
			return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => {
				return undefined;	// abort launch
			});
		}

		return config;
	}
}
class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

	createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
		return new vscode.DebugAdapterInlineImplementation(new MumpsDebugSession());
	}
}
function triggerUpdateDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
	if (timeout) {
		clearTimeout(timeout);
		timeout = undefined;
	}
	timeout = setTimeout(() => updateDiagnostics(document, collection), 500);
}

function getEntryRef() {
	return vscode.window.showInputBox({
		placeHolder: "Please enter the Entry-Reference to start Debugging",
		value: entryRef
	})
}

