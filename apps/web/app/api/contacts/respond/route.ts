import { createPrismaMvpRepository } from "../../../../src/repositories/prismaMvpRepository";
import { getRuntimeConfig } from "../../../../src/runtime/config";
import {
  respondToContactInvite,
  type ContactInviteAction,
} from "../../../../src/services/contactService";

type RespondContactRequestFields = {
  token?: unknown;
  action?: unknown;
  respondWithHtml?: boolean;
};

const contactInviteActions = new Set<ContactInviteAction>([
  "agree",
  "decline",
  "report",
  "opt_out",
]);

export async function POST(request: Request): Promise<Response> {
  const fields = await readRequestFields(request);
  if (typeof fields.token !== "string" || fields.token.length === 0) {
    return Response.json({ error: "token is required" }, { status: 400 });
  }
  if (typeof fields.action !== "string" || !contactInviteActions.has(fields.action as ContactInviteAction)) {
    return Response.json({ error: "valid action is required" }, { status: 400 });
  }

  try {
    const repository = createPrismaMvpRepository();
    const contact = await respondToContactInvite(
      {
        token: fields.token,
        action: fields.action as ContactInviteAction,
        now: new Date(),
        tokenSecret: getRuntimeConfig(request).tokenSecret,
      },
      {
        repository,
        messageReviewRepository: repository,
      },
    );

    if (fields.respondWithHtml) {
      return new Response(renderContactResponseHtml(contact.status), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return Response.json({ contact });
  } catch (error) {
    return handleResponseError(error, Boolean(fields.respondWithHtml));
  }
}

async function readRequestFields(request: Request): Promise<RespondContactRequestFields> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await request.json().catch(() => ({}))) as RespondContactRequestFields;
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return {};
  }

  return {
    token: formData.get("token") ?? undefined,
    action: formData.get("action") ?? undefined,
    respondWithHtml: true,
  };
}

function handleResponseError(error: unknown, respondWithHtml: boolean): Response {
  const message = error instanceof Error ? error.message : "Failed to respond to contact invite";
  const status =
    message === "Token signature is invalid" ||
    message === "Token purpose is invalid" ||
    message === "Token has expired" ||
    message === "Contact not found" ||
    message === "Contact invite is no longer pending"
      ? 400
      : message === "Token secret is not configured"
        ? 503
        : 500;

  if (respondWithHtml) {
    return new Response(renderContactResponseHtml(null), {
      status,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return Response.json({ error: status === 500 ? "Failed to respond to contact invite" : message }, { status });
}

function renderContactResponseHtml(status: string | null): string {
  const text =
    status === "confirmed"
      ? "已确认。之后如触发安全消息，你会收到固定模板和签名链接。"
      : status === "declined"
        ? "已拒绝。你不会收到这次邀请的触发消息。"
        : status === "reported"
          ? "已举报。我们会停止把该联系人用于后续触发。"
          : status === "blocked"
            ? "已不再接收。"
            : "链接无效、已过期，或邀请已被处理。";

  return `<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>别让我消失</title><body style="margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f8fa;color:#171717;display:grid;min-height:100vh;place-items:center"><main style="box-sizing:border-box;width:min(100%,420px);padding:28px"><h1 style="font-size:22px;line-height:1.35;margin:0 0 14px">别让我消失</h1><p style="font-size:16px;line-height:1.7;margin:0">${text}</p></main></body></html>`;
}
