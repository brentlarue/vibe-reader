/**
 * Eval Runner
 * 
 * Executes evaluation cases against workflows and scores the results.
 */

import { runWorkflow } from '../workflows/runner.js';
import { getWorkflow as getWorkflowById } from '../db/workflowRepository.js';
import {
  getWorkflowEval,
  createWorkflowEvalRun,
} from '../db/evalRepository.js';

// Note: getWorkflow in workflowRepository.js takes a workflowId (UUID), not a slug


/**
 * Check if a feed URL matches a domain constraint
 * @param {string} feedUrl - Feed URL
 * @param {string[]} domains - Required domains
 * @returns {boolean}
 */
function matchesDomain(feedUrl, domains) {
  if (!domains || domains.length === 0) return true;
  
  try {
    const url = new URL(feedUrl);
    const hostname = url.hostname.toLowerCase();
    return domains.some(domain => hostname.includes(domain.toLowerCase()));
  } catch {
    return false;
  }
}

/**
 * Check if a feed is fresh (last published within X days)
 * @param {Object} feed - Feed object with validation data
 * @param {number} freshnessDays - Required freshness in days
 * @returns {boolean}
 */
function isFresh(feed, freshnessDays) {
  if (!freshnessDays) return true;
  if (!feed.validation?.lastPublishedAt) return false;
  
  const lastPublished = new Date(feed.validation.lastPublishedAt);
  const daysAgo = (Date.now() - lastPublished.getTime()) / (1000 * 60 * 60 * 24);
  return daysAgo <= freshnessDays;
}

/**
 * Validate a single eval case result
 * @param {Object} caseDef - Eval case definition
 * @param {Object} workflowOutput - Workflow output
 * @returns {Object} Validation result
 */
function validateCase(caseDef, workflowOutput) {
  const errors = [];
  const warnings = [];
  let score = 100;
  
  const constraints = caseDef.constraints || {};
  const feeds = workflowOutput?.feeds || [];
  
  // Check feed count constraints
  if (constraints.minFeeds !== undefined && feeds.length < constraints.minFeeds) {
    errors.push(`Expected at least ${constraints.minFeeds} feeds, got ${feeds.length}`);
    score -= 20;
  }
  
  if (constraints.maxFeeds !== undefined && feeds.length > constraints.maxFeeds) {
    warnings.push(`Expected at most ${constraints.maxFeeds} feeds, got ${feeds.length}`);
    score -= 10;
  }
  
  // Check domain constraints
  if (constraints.mustIncludeDomains && constraints.mustIncludeDomains.length > 0) {
    const foundDomains = [];
    for (const feed of feeds) {
      const rssUrl = feed.rssUrl || feed.url;
      if (rssUrl) {
        for (const domain of constraints.mustIncludeDomains) {
          if (matchesDomain(rssUrl, [domain])) {
            foundDomains.push(domain);
            break;
          }
        }
      }
    }
    
    const missingDomains = constraints.mustIncludeDomains.filter(
      d => !foundDomains.includes(d)
    );
    
    if (missingDomains.length > 0) {
      errors.push(`Missing required domains: ${missingDomains.join(', ')}`);
      score -= 15 * missingDomains.length;
    }
  }
  
  // Check freshness constraints
  if (constraints.freshnessDays) {
    const freshFeeds = feeds.filter(feed => isFresh(feed, constraints.freshnessDays));
    if (freshFeeds.length === 0) {
      errors.push(`No feeds are fresh (within ${constraints.freshnessDays} days)`);
      score -= 20;
    } else if (freshFeeds.length < feeds.length) {
      warnings.push(`${feeds.length - freshFeeds.length} feeds are not fresh`);
      score -= 5;
    }
  }
  
  // Validate feed URLs
  const invalidFeeds = feeds.filter(feed => {
    const url = feed.rssUrl || feed.url;
    if (!url) return true;
    try {
      new URL(url);
      return false;
    } catch {
      return true;
    }
  });
  
  if (invalidFeeds.length > 0) {
    errors.push(`${invalidFeeds.length} feeds have invalid URLs`);
    score -= 10 * invalidFeeds.length;
  }
  
  // Check minimum score constraint
  if (constraints.minScore !== undefined && score < constraints.minScore) {
    errors.push(`Score ${score} is below minimum ${constraints.minScore}`);
  }
  
  score = Math.max(0, score); // Don't go below 0
  
  return {
    passed: errors.length === 0 && score >= (constraints.minScore || 0),
    score,
    errors,
    warnings,
  };
}

/**
 * Run an evaluation
 * @param {string} evalId - Eval ID
 * @returns {Promise<Object>} Eval run result
 */
export async function runEval(evalId) {
  // Get eval definition
  const evalDef = await getWorkflowEval(evalId);
  if (!evalDef) {
    throw new Error(`Eval not found: ${evalId}`);
  }
  
  // Get workflow
  const workflow = await getWorkflowById(evalDef.workflowId);
  if (!workflow) {
    throw new Error(`Workflow not found: ${evalDef.workflowId}`);
  }
  
  const cases = evalDef.casesJson || [];
  const caseResults = [];
  const allErrors = [];
  
  console.log(`[Eval] Running ${cases.length} cases for eval: ${evalDef.name}`);
  
  // Run each case
  for (const caseDef of cases) {
    console.log(`[Eval] Running case: ${caseDef.name}`);
    
    try {
      // Run workflow with case input
      const run = await runWorkflow(workflow, caseDef.input);
      
      // Validate result
      const validation = validateCase(caseDef, run.outputJson);
      
      caseResults.push({
        caseId: caseDef.id,
        passed: validation.passed,
        score: validation.score,
        errors: validation.errors,
        warnings: validation.warnings,
        actualOutput: run.outputJson,
        runId: run.id,
      });
      
      if (validation.errors.length > 0) {
        allErrors.push(...validation.errors.map(e => `${caseDef.name}: ${e}`));
      }
    } catch (error) {
      console.error(`[Eval] Case ${caseDef.name} failed:`, error);
      caseResults.push({
        caseId: caseDef.id,
        passed: false,
        score: 0,
        errors: [error.message || 'Workflow execution failed'],
        warnings: [],
        actualOutput: null,
        runId: null,
      });
      allErrors.push(`${caseDef.name}: ${error.message || 'Workflow execution failed'}`);
    }
  }
  
  // Calculate overall score
  const totalScore = caseResults.reduce((sum, r) => sum + r.score, 0);
  const overallScore = caseResults.length > 0 ? totalScore / caseResults.length : 0;
  const passed = caseResults.every(r => r.passed);
  
  const results = {
    caseResults,
    overallScore: Math.round(overallScore * 100) / 100, // Round to 2 decimal places
    passed,
    errors: allErrors,
  };
  
  // Save eval run
  const evalRun = await createWorkflowEvalRun({
    evalId,
    resultsJson: results,
    score: overallScore,
    passed,
  });
  
  console.log(`[Eval] Completed: ${overallScore}% overall score, ${passed ? 'PASSED' : 'FAILED'}`);
  
  return {
    ...evalRun,
    results,
  };
}
