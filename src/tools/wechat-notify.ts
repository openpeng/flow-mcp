const DEFAULT_MCP_URL = 'http://dy.gaodunwangxiao.com/mcp/server/JSioZA6Wtm91riA0/mcp';

function getMcpUrl(): string {
  return process.env.WECHAT_NOTIFY_MCP_URL ?? DEFAULT_MCP_URL;
}

let requestId = 0;

async function callMcp(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const url = getMcpUrl();
  const id = ++requestId;

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    throw new Error(`WeChat MCP HTTP ${response.status}: ${await response.text()}`);
  }

  const result = (await response.json()) as { jsonrpc: string; id: number; result?: unknown; error?: { code: number; message: string } };

  if (result.error) {
    throw new Error(`WeChat MCP error ${result.error.code}: ${result.error.message}`);
  }

  return result.result;
}

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  await callMcp('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'oflow-mcp', version: '0.2.0' },
  });
  initialized = true;
}

export async function sendWechatMessage(name: string, msg: string, nonum?: string): Promise<{ success: boolean; message: string }> {
  try {
    await ensureInitialized();

    const args: Record<string, string> = { name, msg };
    if (nonum) args.nonum = nonum;

    const result = await callMcp('tools/call', {
      name: '企微工号发消息',
      arguments: args,
    }) as { content?: Array<{ type: string; text?: string }> };

    const text = result.content?.[0]?.text ?? '发送成功';
    return { success: true, message: text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, message };
  }
}

export function wechatNotifyAvailable(): boolean {
  return getMcpUrl().length > 0;
}
