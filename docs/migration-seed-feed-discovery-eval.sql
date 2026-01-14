-- Migration: Seed Feed Discovery Evaluation
-- This creates an evaluation definition for the feed discovery workflow
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- First, get the workflow ID (you'll need to replace this with the actual workflow ID)
-- Or use a subquery to find it by slug
DO $$
DECLARE
  workflow_uuid UUID;
  eval_cases JSONB;
BEGIN
  -- Find the feed-discovery workflow
  SELECT id INTO workflow_uuid
  FROM workflows
  WHERE slug = 'feed-discovery'
  AND env = (SELECT CASE WHEN current_setting('app.env', true) = 'dev' THEN 'dev' ELSE 'prod' END)
  LIMIT 1;

  IF workflow_uuid IS NULL THEN
    RAISE EXCEPTION 'Workflow "feed-discovery" not found. Please seed the workflow first.';
  END IF;

  -- Define eval cases
  eval_cases := '[
    {
      "id": "case-1",
      "name": "AI and Machine Learning Feeds",
      "input": {
        "interests": "AI, machine learning, deep learning",
        "criteria": "thought leadership, technical depth, original research",
        "searchLimit": 10
      },
      "constraints": {
        "minFeeds": 5,
        "maxFeeds": 15,
        "freshnessDays": 30
      }
    },
    {
      "id": "case-2",
      "name": "Startup and Entrepreneurship",
      "input": {
        "interests": "startups, entrepreneurship, venture capital",
        "criteria": "practical advice, contrarian views, founder stories",
        "searchLimit": 10
      },
      "constraints": {
        "minFeeds": 5,
        "maxFeeds": 15,
        "freshnessDays": 30
      }
    },
    {
      "id": "case-3",
      "name": "Technology and Innovation",
      "input": {
        "interests": "technology, innovation, software development",
        "criteria": "high signal, original content, technical expertise",
        "searchLimit": 10
      },
      "constraints": {
        "minFeeds": 5,
        "maxFeeds": 15,
        "freshnessDays": 30
      }
    },
    {
      "id": "case-4",
      "name": "Economics and Finance",
      "input": {
        "interests": "economics, finance, markets",
        "criteria": "data-driven analysis, contrarian perspectives, market insights",
        "searchLimit": 10
      },
      "constraints": {
        "minFeeds": 5,
        "maxFeeds": 15,
        "freshnessDays": 30
      }
    },
    {
      "id": "case-5",
      "name": "Product and Design",
      "input": {
        "interests": "product management, design, user experience",
        "criteria": "practical insights, case studies, design thinking",
        "searchLimit": 10
      },
      "constraints": {
        "minFeeds": 5,
        "maxFeeds": 15,
        "freshnessDays": 30
      }
    },
    {
      "id": "case-6",
      "name": "Specific Domain Test",
      "input": {
        "interests": "RSS feeds similar to Paul Graham''s writing style",
        "criteria": "essay format, contrarian views, startup advice",
        "searchLimit": 10
      },
      "constraints": {
        "minFeeds": 3,
        "maxFeeds": 10,
        "freshnessDays": 60,
        "mustIncludeDomains": ["paulgraham.com"]
      }
    },
    {
      "id": "case-7",
      "name": "Minimal Input Test",
      "input": {
        "interests": "tech",
        "criteria": "",
        "searchLimit": 5
      },
      "constraints": {
        "minFeeds": 3,
        "maxFeeds": 20,
        "freshnessDays": 90
      }
    },
    {
      "id": "case-8",
      "name": "High Quality Signal Test",
      "input": {
        "interests": "high signal content, long-form essays, newsletters",
        "criteria": "thought leadership, original research, deep analysis",
        "searchLimit": 15
      },
      "constraints": {
        "minFeeds": 8,
        "maxFeeds": 20,
        "freshnessDays": 30,
        "minScore": 70
      }
    }
  ]'::jsonb;

  -- Insert eval (using ON CONFLICT to avoid duplicates)
  INSERT INTO workflow_evals (workflow_id, name, cases_json, env)
  VALUES (
    workflow_uuid,
    'Feed Discovery Evaluation',
    eval_cases,
    (SELECT CASE WHEN current_setting('app.env', true) = 'dev' THEN 'dev' ELSE 'prod' END)
  )
  ON CONFLICT (workflow_id, name, env) DO UPDATE
  SET cases_json = EXCLUDED.cases_json,
      updated_at = now();

  RAISE NOTICE 'Eval seeded successfully for workflow: %', workflow_uuid;
END $$;
