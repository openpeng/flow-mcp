import { join } from 'path';
import type { OflowConfig } from './types.js';

export interface ConfigOverrides {
  homeDir?: string;
  flowsDir?: string;
  dataDir?: string;
}

export function getConfig(overrides: ConfigOverrides = {}): OflowConfig {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '.';
  const homeDir = overrides.homeDir ?? process.env.OFLOW_MCP_HOME ?? join(home, '.oflow-mcp');
  const flowsDir = overrides.flowsDir ?? process.env.OFLOW_MCP_FLOWS_DIR ?? join(homeDir, 'flows');
  const dataDir = overrides.dataDir ?? process.env.OFLOW_MCP_DATA_DIR ?? join(homeDir, 'instances');

  return { homeDir, flowsDir, dataDir };
}
