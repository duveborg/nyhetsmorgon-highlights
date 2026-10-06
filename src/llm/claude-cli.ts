import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { config } from '../config.ts';
import type { LlmBackend } from './types.ts';

// Uses the locally logged-in Claude Code (`claude -p`) instead of an API key.
// Tools, MCP servers and session persistence are off: this is a plain
// prompt -> structured JSON call.
export const claudeCli: LlmBackend = {
  name: 'claude-cli',
  async generate({ system, prompt, schema }) {
    // The CLI's validator doesn't know draft 2020-12's meta-schema URI.
    const { $schema: _, ...jsonSchema } = schema as Record<string, unknown>;
    const args = [
      '-p',
      '--model', config.llmModel,
      '--tools', '',
      '--strict-mcp-config',
      '--no-session-persistence',
      '--output-format', 'json',
      '--json-schema', JSON.stringify(jsonSchema),
      '--system-prompt', system,
    ];
    const stdout = await run(config.claudeCli, args, prompt);
    const res = JSON.parse(stdout) as { is_error: boolean; result?: string; structured_output?: unknown };
    if (res.is_error || res.structured_output === undefined) {
      throw new Error(`claude -p failed: ${res.result ?? stdout.slice(0, 500)}`);
    }
    return res.structured_output;
  },
};

function run(cmd: string, args: string[], input: string) {
  return new Promise<string>((resolve, reject) => {
    // Run outside the repo so project CLAUDE.md/settings don't leak into the prompt.
    const child = spawn(cmd, args, { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited with ${code}: ${out.slice(0, 500)}`)),
    );
    child.stdin.end(input);
  });
}
