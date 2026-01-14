/**
 * Workflow Seeding Script
 * 
 * Seeds the feed discovery workflow into the database.
 * Can be run manually or via API endpoint.
 */

import { createWorkflow, getWorkflowBySlug, updateWorkflow } from '../db/workflowRepository.js';
import { createWorkflowEval } from '../db/evalRepository.js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Seed the feed discovery workflow
 * @returns {Promise<Object>} Created or existing workflow
 */
export async function seedFeedDiscoveryWorkflow() {
  // Load workflow definition from file
  const definitionPath = join(__dirname, 'definitions', 'feedDiscovery.json');
  const definitionJson = JSON.parse(await readFile(definitionPath, 'utf-8'));

  // Check if workflow already exists
  const existing = await getWorkflowBySlug('feed-discovery');
  if (existing) {
    console.log('[Seed] Feed discovery workflow already exists, updating definition');
    // Update the workflow with the latest definition from the file
    const updated = await updateWorkflow(existing.id, { definitionJson });
    console.log('[Seed] Updated feed discovery workflow:', updated.id);
    return updated;
  }

  try {
    // Create workflow
    const workflow = await createWorkflow({
      name: 'Feed Discovery',
      slug: 'feed-discovery',
      definitionJson,
      version: 1,
    });

    console.log('[Seed] Created feed discovery workflow:', workflow.id);
    return workflow;
  } catch (error) {
    // If duplicate key error, try to fetch and update the existing workflow
    if (error.message?.includes('duplicate key') || error.code === '23505') {
      console.log('[Seed] Workflow already exists (duplicate key), fetching and updating');
      const existing = await getWorkflowBySlug('feed-discovery');
      if (existing) {
        const updated = await updateWorkflow(existing.id, { definitionJson });
        return updated;
      }
      // If still not found, it might be in a different environment
      // Try to find it without env filter (this shouldn't happen but handle it)
      throw new Error('Workflow exists but could not be retrieved');
    }
    throw error;
  }
}

/**
 * Seed feed discovery eval
 * @returns {Promise<Object>} Created eval
 */
export async function seedFeedDiscoveryEval() {
  // Get the feed discovery workflow
  const workflow = await getWorkflowBySlug('feed-discovery');
  if (!workflow) {
    throw new Error('Feed discovery workflow not found. Seed workflow first.');
  }

  // Check if eval already exists
  const { getWorkflowEvals } = await import('../db/evalRepository.js');
  const existingEvals = await getWorkflowEvals(workflow.id);
  const existing = existingEvals.find((e) => e.name === 'Feed Discovery Evaluation');
  
  if (existing) {
    console.log('[Seed] Feed discovery eval already exists, skipping seed');
    return existing;
  }

  // Load eval cases
  const casesPath = join(__dirname, '..', 'evals', 'cases', 'feedDiscovery.json');
  const casesJson = JSON.parse(await readFile(casesPath, 'utf-8'));

  // Create eval
  const workflowEval = await createWorkflowEval({
    workflowId: workflow.id,
    name: 'Feed Discovery Evaluation',
    casesJson,
  });

  console.log('[Seed] Created feed discovery eval:', workflowEval.id);
  return workflowEval;
}

/**
 * Seed all workflows
 * @returns {Promise<Array>} Array of created workflows
 */
export async function seedAllWorkflows() {
  const workflows = [];
  
  try {
    const feedDiscovery = await seedFeedDiscoveryWorkflow();
    workflows.push(feedDiscovery);
    
    // Seed eval after workflow is created
    try {
      await seedFeedDiscoveryEval();
    } catch (error) {
      console.warn('[Seed] Failed to seed eval (workflow may not exist yet):', error.message);
    }
  } catch (error) {
    console.error('[Seed] Error seeding workflows:', error);
    throw error;
  }

  return workflows;
}
