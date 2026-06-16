import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const FALLBACK_OPENAI_MODELS = ["gpt-5-mini", "gpt-4o-mini", "gpt-4o"];

const assertApiKey = () => {
  if (!ENV.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};

async function bufferFromUrl(url: string): Promise<Buffer> {
  if (url.startsWith("/manus-storage/")) {
    const { storageDownload } = await import("../storage");
    return storageDownload(url.replace(/^\/manus-storage\//, ""));
  }
  const fetchUrl = url.startsWith("/") && ENV.publicAppUrl
    ? new URL(url, ENV.publicAppUrl).toString()
    : url;
  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch LLM input file (${response.status}): ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

const toOpenAiContentPart = async (
  part: MessageContent
): Promise<
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail?: "auto" | "low" | "high" }
  | { type: "input_file"; filename: string; file_data: string }
> => {
  if (typeof part === "string") {
    return { type: "input_text", text: part };
  }

  if (part.type === "text") {
    return { type: "input_text", text: part.text };
  }

  if (part.type === "image_url") {
    if (part.image_url.url.startsWith("/")) {
      const buffer = await bufferFromUrl(part.image_url.url);
      return {
        type: "input_image",
        image_url: `data:image/png;base64,${buffer.toString("base64")}`,
        ...(part.image_url.detail ? { detail: part.image_url.detail } : {}),
      };
    }
    return {
      type: "input_image",
      image_url: part.image_url.url,
      ...(part.image_url.detail ? { detail: part.image_url.detail } : {}),
    };
  }

  if (part.type === "file_url") {
    const buffer = await bufferFromUrl(part.file_url.url);
    const mimeType = part.file_url.mime_type || "application/pdf";
    return {
      type: "input_file",
      filename: `input.${mimeType.includes("pdf") ? "pdf" : "bin"}`,
      file_data: `data:${mimeType};base64,${buffer.toString("base64")}`,
    };
  }

  throw new Error("Unsupported message content part");
};

const toOpenAiInputMessage = async (message: Message) => {
  const role = message.role === "function" || message.role === "tool"
    ? "user"
    : message.role;
  const contentParts = await Promise.all(ensureArray(message.content).map(toOpenAiContentPart));
  return {
    role,
    content: contentParts,
  };
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: ENV.openAiModel || DEFAULT_OPENAI_MODEL,
    input: await Promise.all(messages.map(toOpenAiInputMessage)),
  };

  payload.max_output_tokens = params.maxTokens ?? params.max_tokens ?? 4096;

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    if (normalizedResponseFormat.type === "json_schema") {
      payload.text = {
        format: {
          type: "json_schema",
          name: normalizedResponseFormat.json_schema.name,
          schema: normalizedResponseFormat.json_schema.schema,
          strict: normalizedResponseFormat.json_schema.strict ?? true,
        },
      };
    } else if (normalizedResponseFormat.type === "json_object") {
      payload.text = { format: { type: "json_object" } };
    }
  }

  let response: Response | undefined;
  let lastErrorText = "";
  const requestedModel = String(payload.model || DEFAULT_OPENAI_MODEL);
  const modelCandidates = Array.from(new Set([
    requestedModel,
    ...FALLBACK_OPENAI_MODELS,
  ].filter(Boolean)));

  for (const model of modelCandidates) {
    payload.model = model;
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.openAiApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) break;

    lastErrorText = await response.text();
    const canRetryWithFallback = response.status === 403 || response.status === 404 || lastErrorText.includes("model_not_found");
    const hasMoreModels = model !== modelCandidates[modelCandidates.length - 1];
    if (!canRetryWithFallback || !hasMoreModels) {
      throw new Error(
        `LLM invoke failed: ${response.status} ${response.statusText} – ${lastErrorText}`
      );
    }
    console.warn(`[OpenAI] Model ${model} unavailable; retrying with fallback model`);
  }

  if (!response?.ok) {
    throw new Error(`LLM invoke failed: ${lastErrorText || "OpenAI request failed"}`);
  }

  const data = await response.json() as any;
  const content = typeof data.output_text === "string"
    ? data.output_text
    : (data.output || [])
      .flatMap((item: any) => item.content || [])
      .map((part: any) => part.text || "")
      .join("\n")
      .trim();

  return {
    id: data.id || "",
    created: data.created_at || Math.floor(Date.now() / 1000),
    model: data.model || String(payload.model),
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: content || "",
        },
        finish_reason: data.status === "completed" ? "stop" : data.status || null,
      },
    ],
    usage: data.usage
      ? {
        prompt_tokens: data.usage.input_tokens || 0,
        completion_tokens: data.usage.output_tokens || 0,
        total_tokens: data.usage.total_tokens || ((data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)),
      }
      : undefined,
  };
}
