// index.js

// 1) Import the Bedrock Agent Runtime client
const {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand
} = require("@aws-sdk/client-bedrock-agent-runtime");

// 2) Helper to read a Node.js ReadableStream fully
const streamToString = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
};

// 3) CORS headers — adjust origin as needed
const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "https://main.d21wh3yl4q77z.amplifyapp.com",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,POST"
};

/**
 * retrieveAndGenerate(prompt)
 *   Calls Bedrock’s retrieveAndGenerate (KB) API.
 *   Expects these ENV vars on the Lambda:
 *     - AWS_REGION
 *     - KNOWLEDGE_BASE_ID   (e.g. "GI0RV3OU0T")
 *     - MODEL_ARN           (e.g. "arn:aws:bedrock:eu-west-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0")
 *     - PROMPT_TEMPLATE     (optional override of the default prompt template)
 */
async function retrieveAndGenerate(prompt) {
  const client = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION });

  // Build the retrieveAndGenerate payload
  const payload = {
    input: { text: prompt },
    retrieveAndGenerateConfiguration: {
      type: "KNOWLEDGE_BASE",
      knowledgeBaseConfiguration: {
        knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID,
        modelArn:        process.env.MODEL_ARN,
        generationConfiguration: {
          promptTemplate: {
            textPromptTemplate: process.env.PROMPT_TEMPLATE ||
              "You are a helpful assistant. Use the following retrieved content to answer the user's question.\n\n" +
              "$search_results$\n\n" +
              "User Question: $user_input$\n" +
              "Answer:"
          }
        }
      }
    }
  };

  const cmd = new RetrieveAndGenerateCommand(payload);
  const resp = await client.send(cmd);

  // The 'output.text' stream contains the generated answer
  const answer = await streamToString(resp.output.text);

  // resp.citations is an array of { retrievedReference: { documentId, title, chunkText, content } }
  const citations = (resp.citations || []).map((c, i) => {
    const ref = c.retrievedReference || {};
    return {
      index:      i + 1,
      documentId: ref.documentId,
      title:      ref.title || null,
      snippet:    (ref.chunkText || ref.content || "").slice(0, 200)
    };
  });

  return { answer, citations };
}

/**
 * Lambda handler
 */
exports.handler = async (event) => {
  // 1) Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS };
  }

  // 2) Parse & validate JSON body
  let prompt;
  try {
    const body = typeof event.body === "string"
      ? JSON.parse(event.body)
      : event.body;
    prompt = (body.prompt || "").trim();
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Invalid JSON" })
    };
  }
  if (!prompt) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Missing 'prompt'" })
    };
  }

  // 3) Call retrieveAndGenerate
  try {
    const { answer, citations } = await retrieveAndGenerate(prompt);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      },
      body: JSON.stringify({ answer, citations })
    };
  } catch (err) {
    console.error("retrieveAndGenerate error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Failed to retrieve and generate" })
    };
  }
};
