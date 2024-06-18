'use strict';

import * as vscode from 'vscode';
import { window, ProgressLocation } from 'vscode';
import * as https from 'https';

async function runOpenAIQuery(prompt: string, code: string, apiKey: any) {

	let hostname = vscode.workspace.getConfiguration().get('gpttoolbox.hostname');
	let port = vscode.workspace.getConfiguration().get('gpttoolbox.port');
	let path = vscode.workspace.getConfiguration().get('gpttoolbox.path');

	hostname = hostname ? hostname: 'api.openai.com';
	port = port ? port : 443;
	path = path ? path :'/v1/chat/completions';

	const options = {
		hostname: hostname,
		port: port,
		path: path,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`
		}
	};
	let responseData = '';
	let statusCode = 0;

	const req = https.request(options as any, (res: any) => {
		statusCode = res.statusCode;

		res.on('data', (d: any) => {
			responseData += d;
		});
	});

	req.on('error', (error: any) => {
		console.error(error);
	});

	const messages = [{
		role: 'system',
		content: prompt
	}, {
		role: 'user',
		content: code
	}
	];

	req.write(JSON.stringify({
		model: 'gpt-4o',
		messages: messages,
		response_format: { "type": "json_object" }
	}));
	req.end();

	await new Promise(resolve => req.on('close', resolve));

	if (statusCode == 401) {
		throw new Error('The API key provided is not valid. Please check the key and try again.');
	}

	return JSON.parse(responseData);
}

export function activate(context: vscode.ExtensionContext) {
	const api_key = vscode.workspace.getConfiguration().get('gpttoolbox.apiKey');
	const disposable_add = vscode.commands.registerCommand('gptvscode.add', async function() {

		if (!api_key) {
			throw new Error('API key is required and cannot be empty');
		}

		// Get the active text editor
		const editor = vscode.window.activeTextEditor;

		if (editor) {
			window.withProgress({
				location: ProgressLocation.Notification,
				title: "Calling the LLM",
				cancellable: false
			}, (progress, token) => {

				token.onCancellationRequested(() => {
					console.log("User canceled the long running operation");
				});

				progress.report({ message: "Sending request! almost there...", increment: 10 });
				const document = editor.document;
				const selection = editor.selection;

				// Get the word within the selection
				const code = document.getText(selection);

				//It's in the context of a physics engine in babylon.js. 
				const p = new Promise<void>(resolve => {
					runOpenAIQuery(
						`You are going to review a segment of academic writing focusing on computer science and mathematics. The segment is written in LaTeX. The segment may be part of a longer passage where some notations or terms have been defined. You do not need to worry about background knowledge or definitions, as they are likely provided in context. Check for any grammatical, clarity, or structural issues that need improvement within the segment.

- If the work is well-written and contains no major issues, provide brief feedback indicating this in JSON format.

- If issues arise, suggest changes or enhancements to improve coherence and readability while keeping your revisions brief. Provide your feedback and the suggested changes in JSON format. Highlight the changes you made.

Output should be structured as follows:
{
    "well_written": boolean,
    "revision": string,
    "suggestions": [
        {
            "original_text": "string",
            "suggested_text": "string"
        }
    ]
}`
						, code
						, api_key).then((res: any)=> {
							if (res['error']) {
								vscode.window.showErrorMessage(res['error']['message']);
								resolve();
								return;
							}
							const comment = res['choices'][0]['message']['content'];
							editor.edit(editBuilder => {

								progress.report({ message: "Done!", increment: 90 });

								editBuilder.replace(selection, comment + "\n" + code);
								resolve();
							});
						});
					});
		
				return p;
			});
		}
	});

	context.subscriptions.push(disposable_add);
}