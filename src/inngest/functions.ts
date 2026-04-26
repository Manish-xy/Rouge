import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import prisma from "@/lib/db";
import { topologicalSort } from "./utils";
import { ExecutionStatus, NodeType } from "@/generated/prisma";
import { getExecutor } from "@/features/executions/lib/executor-registry";
import { httpRequestChannel } from "./channels/http-request";
import { manualTriggerChannel } from "./channels/manual-trigger";
import { googleFormTriggerChannel } from "./channels/google-form-trigger";
import { stripeTriggerChannel } from "./channels/stripe-trigger";
import { scheduleTriggerChannel } from "./channels/schedule-trigger";
import { geminiChannel } from "./channels/gemini";
import { openAiChannel } from "./channels/openai";
import { anthropicChannel } from "./channels/anthropic";
import { discordChannel } from "./channels/discord";
import { slackChannel } from "./channels/slack";
import { emailChannel } from "./channels/email";
import { createId } from "@paralleldrive/cuid2";

const cronToPartIndex = {
  minute: 0,
  hour: 1,
  dayOfMonth: 2,
  month: 3,
  dayOfWeek: 4,
} as const;

const getDatePartsUtc = (date: Date) => {
  return {
    minute: date.getUTCMinutes(),
    hour: date.getUTCHours(),
    dayOfMonth: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    dayOfWeek: date.getUTCDay(),
  };
};

const fieldMatches = (rawField: string, value: number) => {
  const field = rawField.trim();
  if (field === "*") {
    return true;
  }

  const list = field.split(",");
  return list.some((segment) => {
    const [rangeOrStar, stepRaw] = segment.split("/");
    const step = stepRaw ? Number.parseInt(stepRaw, 10) : null;

    let inRange = false;
    if (rangeOrStar === "*") {
      inRange = true;
    } else if (rangeOrStar.includes("-")) {
      const [startRaw, endRaw] = rangeOrStar.split("-");
      const start = Number.parseInt(startRaw, 10);
      const end = Number.parseInt(endRaw, 10);
      inRange = Number.isFinite(start) && Number.isFinite(end) && value >= start && value <= end;
    } else {
      const exact = Number.parseInt(rangeOrStar, 10);
      inRange = Number.isFinite(exact) && value === exact;
    }

    if (!inRange) {
      return false;
    }

    if (!step) {
      return true;
    }

    if (rangeOrStar === "*") {
      return value % step === 0;
    }

    if (rangeOrStar.includes("-")) {
      const [startRaw] = rangeOrStar.split("-");
      const start = Number.parseInt(startRaw, 10);
      return Number.isFinite(start) && (value - start) % step === 0;
    }

    return value % step === 0;
  });
};

const isCronMatch = (cronExpression: string, date: Date) => {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }

  const values = getDatePartsUtc(date);
  return Object.entries(cronToPartIndex).every(([key, index]) => {
    const value = values[key as keyof typeof values];
    const field = parts[index];

    return fieldMatches(field, value);
  });
};

export const executeWorkflow = inngest.createFunction(
  { 
    id: "execute-workflow",
    retries: process.env.NODE_ENV === "production" ? 3 : 0,
    onFailure: async ({ event, step }) => {
      return prisma.execution.update({
        where: { inngestEventId: event.data.event.id },
        data: {
          status: ExecutionStatus.FAILED,
          error: event.data.error.message,
          errorStack: event.data.error.stack,
        },
      });
    },
  },
  { 
    event: "workflows/execute.workflow",
    channels: [
      httpRequestChannel(),
      manualTriggerChannel(),
      googleFormTriggerChannel(),
      stripeTriggerChannel(),
      scheduleTriggerChannel(),
      geminiChannel(),
      openAiChannel(),
      anthropicChannel(),
      discordChannel(),
      slackChannel(),
      emailChannel(),
    ],
  },
  async ({ event, step, publish }) => {
    const inngestEventId = event.id;
    const workflowId = event.data.workflowId;

    if (!inngestEventId || !workflowId) {
      throw new NonRetriableError("Event ID or workflow ID is missing");
    }

    await step.run("create-execution", async () => {
      return prisma.execution.create({
        data: {
          workflowId,
          inngestEventId,
        },
      });
    });

    const sortedNodes = await step.run("prepare-workflow", async () => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: workflowId },
        include: {
          nodes: true,
          connections: true,
        },
      });

      return topologicalSort(workflow.nodes, workflow.connections);
    });

    const userId = await step.run("find-user-id", async () => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: workflowId },
        select: {
          userId: true,
        },
      });

      return workflow.userId;
    });

    // Initialize context with any initial data from the trigger
    let context = event.data.initialData || {};

    // Execute each node
    for (const node of sortedNodes) {
      const executor = getExecutor(node.type as NodeType);
      context = await executor({
        data: node.data as Record<string, unknown>,
        nodeId: node.id,
        userId,
        context,
        step,
        publish,
      });
    }

    await step.run("update-execution", async () => {
      return prisma.execution.update({
        where: { inngestEventId, workflowId },
        data: {
          status: ExecutionStatus.SUCCESS,
          completedAt: new Date(),
          output: context,
        },
      })
    });

    return {
      workflowId,
      result: context,
    };
  },
);

export const runScheduledWorkflows = inngest.createFunction(
  {
    id: "run-scheduled-workflows",
    retries: 0,
  },
  {
    cron: "*/1 * * * *",
  },
  async ({ step }) => {
    const now = new Date();

    const scheduledNodes = await step.run("load-scheduled-nodes", async () => {
      return prisma.node.findMany({
        where: {
          type: NodeType.SCHEDULE_TRIGGER,
        },
        select: {
          id: true,
          workflowId: true,
          data: true,
        },
      });
    });

    let triggeredCount = 0;

    for (const node of scheduledNodes) {
      const data = (node.data ?? {}) as Record<string, unknown>;
      const cronExpression = typeof data.cronExpression === "string"
        ? data.cronExpression
        : "0 * * * *";

      if (!isCronMatch(cronExpression, now)) {
        continue;
      }

      await step.sendEvent(`schedule-workflow-${node.id}`, {
        id: createId(),
        name: "workflows/execute.workflow",
        data: {
          workflowId: node.workflowId,
          initialData: {
            schedule: {
              triggeredAt: now.toISOString(),
              cronExpression,
              nodeId: node.id,
            },
          },
        },
      });

      triggeredCount += 1;
    }

    return {
      checkedAt: now.toISOString(),
      checkedWorkflows: scheduledNodes.length,
      triggeredCount,
    };
  },
);
