import type { NodeExecutor } from "@/features/executions/types";
import { scheduleTriggerChannel } from "@/inngest/channels/schedule-trigger";

type ScheduleTriggerData = {
  variableName?: string;
  cronExpression?: string;
};

export const scheduleTriggerExecutor: NodeExecutor<ScheduleTriggerData> = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(
    scheduleTriggerChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  const result = await step.run("schedule-trigger", async () => {
    const schedulePayload = (context.schedule as Record<string, unknown> | undefined) ?? {
      triggeredAt: new Date().toISOString(),
      cronExpression: data.cronExpression ?? "0 * * * *",
    };

    if (!data.variableName) {
      return {
        ...context,
        schedule: schedulePayload,
      };
    }

    return {
      ...context,
      [data.variableName]: schedulePayload,
    };
  });

  await publish(
    scheduleTriggerChannel().status({
      nodeId,
      status: "success",
    }),
  );

  return result;
};
