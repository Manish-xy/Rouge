import Handlebars from "handlebars";
import { decode } from "html-entities";
import { NonRetriableError } from "inngest";
import ky from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { emailChannel } from "@/inngest/channels/email";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);

  return safeString;
});

type EmailData = {
  variableName?: string;
  apiKey?: string;
  from?: string;
  to?: string;
  subject?: string;
  content?: string;
};

export const emailExecutor: NodeExecutor<EmailData> = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(
    emailChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  if (!data.variableName) {
    await publish(
      emailChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw new NonRetriableError("Email node: Variable name is required");
  }

  if (!data.apiKey) {
    await publish(
      emailChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw new NonRetriableError("Email node: Resend API key is required");
  }

  if (!data.from || !data.to || !data.subject || !data.content) {
    await publish(
      emailChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw new NonRetriableError("Email node: From, to, subject, and content are required");
  }

  const subject = decode(Handlebars.compile(data.subject)(context));
  const content = decode(Handlebars.compile(data.content)(context));
  const to = decode(Handlebars.compile(data.to)(context));
  const from = decode(Handlebars.compile(data.from)(context));

  const recipients = to
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    await publish(
      emailChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw new NonRetriableError("Email node: At least one recipient is required");
  }

  try {
    const result = await step.run("email-send", async () => {
      const response = await ky.post("https://api.resend.com/emails", {
        headers: {
          Authorization: `Bearer ${data.apiKey}`,
          "Content-Type": "application/json",
        },
        json: {
          from,
          to: recipients,
          subject,
          text: content,
        },
      }).json<{ id: string }>();

      return {
        ...context,
        [data.variableName!]: {
          id: response.id,
          to: recipients,
          subject,
        },
      };
    });

    await publish(
      emailChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return result;
  } catch (error) {
    await publish(
      emailChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
