import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWorkflowTool, workflowTools } from './workflow-tools.js';

test('tool list exposes workflow tools only', () => {
  const names = workflowTools.map(tool => tool.name).sort();
  assert.deepEqual(names, [
    'workflow_advance',
    'workflow_bind',
    'workflow_create_template',
    'workflow_current',
    'workflow_get_template',
    'workflow_list_instances',
    'workflow_list_templates',
    'workflow_override_prompt',
    'workflow_start',
    'workflow_status',
  ]);
  assert.equal(names.some(name => name.startsWith('flow_memory_') || name.startsWith('flow_inbox_') || name === 'flow_init'), false);
});

test('tool errors use JSON envelope', async () => {
  const response = await handleWorkflowTool('workflow_get_template', { name: '../../evil' });
  assert.ok(response);
  const body = JSON.parse(response.content[0].text);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'INVALID_TEMPLATE_NAME');
});
