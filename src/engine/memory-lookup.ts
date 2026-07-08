// Memory lookup — 从 CodeBuddy 记忆目录搜索与步骤相关的记忆
// 用于 workflow_current 自动注入相关记忆摘要到 prompt 中
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CODEBUDDY_PROJECTS_DIR = process.env.CODEBUDDY_PROJECTS_DIR ??
  join(homedir(), '.codebuddy', 'projects');

export interface MemorySummary {
  name: string;
  type: string;
  summary: string;
}

/** 简化的 frontmatter 解析 */
function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: content };
  const frontmatterBlock = match[1];
  const body = match[2];
  const data: Record<string, string> = {};
  for (const line of frontmatterBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      data[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
    }
  }
  return { data, body };
}

/**
 * 从项目记忆中查找与指定步骤相关的记忆摘要
 * 使用步骤名称关键词匹配 — 返回轻量摘要（不加载全文）
 */
export function findRelevantMemories(stepName: string): MemorySummary[] {
  try {
    const keywords = extractKeywordsFromStep(stepName);
    if (keywords.length === 0) return [];

    const relevant: (MemorySummary & { score: number })[] = [];

    if (!existsSync(CODEBUDDY_PROJECTS_DIR)) return [];

    const projectDirs = readdirSync(CODEBUDDY_PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const projDir of projectDirs) {
      const memDir = join(CODEBUDDY_PROJECTS_DIR, projDir.name, 'memory');
      if (!existsSync(memDir)) continue;

      const files = readdirSync(memDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
      for (const file of files) {
        try {
          const content = readFileSync(join(memDir, file), 'utf-8');
          const { data, body } = parseFrontmatter(content);
          const searchTarget = [
            data.name || '',
            data.description || '',
            data.summary || '',
            body.slice(0, 200),
          ].join(' ').toLowerCase();

          let score = 0;
          for (const kw of keywords) {
            if (searchTarget.includes(kw.toLowerCase())) score += 1;
          }

          if (score > 0) {
            relevant.push({
              name: data.name || file.replace(/\.md$/, ''),
              type: data.type || 'user',
              summary: data.summary || data.description || '',
              score,
            });
          }
        } catch {
          // Skip corrupted files
        }
      }
    }

    return relevant
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ name, type, summary }) => ({ name, type, summary }));
  } catch {
    return [];
  }
}

/** 从步骤名提取搜索关键词 */
function extractKeywordsFromStep(stepName: string): string[] {
  const stepKeywordMap: Record<string, string[]> = {
    '需求分析': ['需求', 'analysis', 'story', 'tapd', 'requirement'],
    '设计': ['设计', 'design', 'spec', '架构', 'architecture'],
    'OpenSpec': ['openspec', 'spec', 'design', 'proposal'],
    '创建分支': ['分支', 'branch', 'git', 'checkout', 'create'],
    '代码开发': ['开发', 'development', 'code', '编码', '实现', 'implement'],
    '开发': ['开发', 'development', 'code', '编码', '实现'],
    '提测': ['部署', 'deploy', 'test', '测试', 'environment', '环境'],
    '测试': ['测试', 'test', 'testing', '验证', 'verify'],
    '自测': ['自测', 'self', 'test', '验证', '检查'],
    '修复': ['修复', 'fix', 'bug', 'debug', 'debugging'],
    'Bug': ['bug', '修复', 'fix', 'debug'],
    '合并': ['合并', 'merge', 'pr', 'mr', 'release', '发布', 'publish'],
    '发布': ['发布', 'release', 'publish', 'deploy', 'production'],
    '交付': ['交付', 'delivery', 'handoff', '交接'],
    '归档': ['归档', 'archive', '总结', 'summary'],
    'verify': ['验证', 'test', 'verify', 'check'],
    'analyze': ['分析', 'analysis', 'analyze'],
    'design': ['设计', 'design', 'spec'],
  };

  const keywords: string[] = [];
  for (const [pattern, kws] of Object.entries(stepKeywordMap)) {
    if (stepName.includes(pattern)) keywords.push(...kws);
  }

  if (keywords.length === 0 && stepName) keywords.push(stepName);
  return [...new Set(keywords)];
}

/**
 * 构建记忆注入文本 — 用于 workflow_current prompt 顶部
 * 如果无相关记忆返回空字符串
 */
export function buildMemoryInjection(stepName: string): string {
  const mems = findRelevantMemories(stepName);
  if (mems.length === 0) return '';

  return [
    '',
    '> **相关记忆**（基于项目知识库，仅供参考）:',
    ...mems.map(m => `> - [${m.type}] **${m.name}** — ${m.summary}`),
    '',
  ].join('\n');
}
