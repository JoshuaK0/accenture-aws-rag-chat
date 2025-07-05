const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

exports.handler = async (event) => {
  const { prompt } = JSON.parse(event.body);
  if (!prompt) return { statusCode: 400, body: "Missing prompt" };

  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
  const cmd = new InvokeModelCommand({
    modelId: "anthropic.claude-3-haiku-20240307-v1:0",      // your model
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      retrieval: { knowledgeBaseArn: "arn:aws:aoss:eu-west-1:900808296174:collection/05wamwwwnb61hfdo2icj" }
    })
  });

  try {
    const resp = await client.send(cmd);
    const data = await new Response(resp.body).json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: data.choices[0].message.content })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Bedrock invocation failed" };
  }
};
