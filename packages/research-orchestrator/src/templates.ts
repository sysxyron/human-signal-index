// =============================================================================
// @hsi/research-orchestrator — WORKFLOW TEMPLATES.
//
// Reusable ResearchWorkflowTemplates that define a workflow's stages, required
// agents, required evidence, and whether human governance is mandatory. The
// orchestrator drives a run through a template's stages. Templates are static,
// deterministic, and offline.
// =============================================================================

import type { ResearchWorkflowTemplate } from './types';

const FULL_PIPELINE: ResearchWorkflowTemplate['stages'] = [
  'QUEUED',
  'DISCOVERING',
  'COLLECTING',
  'ANALYZING',
  'REASONING',
  'EVIDENCING',
  'TEMPORAL',
  'CAUSAL',
  'COUNTERFACTUAL',
  'DECISION',
  'OUTCOME',
  'CALIBRATION',
  'TRUST',
  'GOVERNANCE',
  'COMPLETE',
];

/** The seven built-in workflow templates (Phase 18 spec). */
export const WORKFLOW_TEMPLATES: ResearchWorkflowTemplate[] = [
  {
    id: 'historical-investigation',
    name: 'Historical Investigation',
    description:
      'Reconstruct how a situation evolved over time, with temporal + causal analysis and a calibrated, trust-aware conclusion.',
    stages: FULL_PIPELINE,
    requiredAgents: ['research', 'evidence', 'temporal', 'causal', 'trust'],
    requiredEvidence: 5,
    governanceRequired: true,
  },
  {
    id: 'narrative-validation',
    name: 'Narrative Validation',
    description:
      'Validate a tracked narrative against evidence + outcomes and attach a trust score before publication.',
    stages: ['QUEUED', 'DISCOVERING', 'COLLECTING', 'ANALYZING', 'EVIDENCING', 'OUTCOME', 'TRUST', 'GOVERNANCE', 'COMPLETE'],
    requiredAgents: ['research', 'evidence', 'outcome', 'trust'],
    requiredEvidence: 4,
    governanceRequired: true,
  },
  {
    id: 'evidence-verification',
    name: 'Evidence Verification',
    description:
      'Independently verify a body of evidence and grade its reliability.',
    stages: ['QUEUED', 'COLLECTING', 'EVIDENCING', 'TRUST', 'GOVERNANCE', 'COMPLETE'],
    requiredAgents: ['research', 'evidence', 'trust'],
    requiredEvidence: 3,
    governanceRequired: true,
  },
  {
    id: 'signal-analysis',
    name: 'Signal Analysis',
    description:
      'Triage and analyse a fresh signal, classifying it and proposing follow-up.',
    stages: ['QUEUED', 'DISCOVERING', 'COLLECTING', 'ANALYZING', 'REASONING', 'COMPLETE'],
    requiredAgents: ['research'],
    requiredEvidence: 1,
    governanceRequired: false,
  },
  {
    id: 'trust-recovery',
    name: 'Trust Recovery',
    description:
      'Investigate a trust collapse/drift, recommend recalibration, and route it through governance.',
    stages: ['QUEUED', 'DISCOVERING', 'EVIDENCING', 'OUTCOME', 'CALIBRATION', 'TRUST', 'GOVERNANCE', 'COMPLETE'],
    requiredAgents: ['research', 'evidence', 'outcome', 'trust'],
    requiredEvidence: 3,
    governanceRequired: true,
  },
  {
    id: 'calibration-review',
    name: 'Calibration Review',
    description:
      'Review confidence calibration across recent outcomes and recommend adjustments.',
    stages: ['QUEUED', 'COLLECTING', 'OUTCOME', 'CALIBRATION', 'TRUST', 'GOVERNANCE', 'COMPLETE'],
    requiredAgents: ['outcome', 'trust'],
    requiredEvidence: 2,
    governanceRequired: true,
  },
  {
    id: 'counterfactual-analysis',
    name: 'Counterfactual Analysis',
    description:
      'Explore alternative histories/decisions and their implied outcomes.',
    stages: ['QUEUED', 'COLLECTING', 'ANALYZING', 'CAUSAL', 'COUNTERFACTUAL', 'DECISION', 'COMPLETE'],
    requiredAgents: ['research', 'causal', 'counterfactual', 'decision'],
    requiredEvidence: 2,
    governanceRequired: false,
  },
];

const BY_ID = new Map(WORKFLOW_TEMPLATES.map((t) => [t.id, t]));

/** Look up a workflow template by id. */
export function getWorkflowTemplate(id: string): ResearchWorkflowTemplate | undefined {
  return BY_ID.get(id);
}

/** List all template ids. */
export function workflowTemplateIds(): string[] {
  return WORKFLOW_TEMPLATES.map((t) => t.id);
}
