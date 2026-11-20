const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand
} = require("@aws-sdk/lib-dynamodb");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true }
});

const tableName = process.env.ORDERS_TABLE_NAME;

exports.handler = async (event) => {
  if (!tableName) {
    throw new Error("ORDERS_TABLE_NAME environment variable is not configured");
  }

  let order = event;
  if (typeof event?.body === "string") {
    try {
      order = JSON.parse(event.body);
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
    }
  }

  if (!order || typeof order !== "object" || Array.isArray(order)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Order must be a JSON object" }) };
  }

  if (typeof order.orderId !== "string" || order.orderId.trim() === "") {
    return { statusCode: 400, body: JSON.stringify({ error: "orderId is required" }) };
  }

  const item = {
    ...order,
    orderId: order.orderId.trim(),
    createdAt: order.createdAt || new Date().toISOString()
  };

  await client.send(new PutCommand({
    TableName: tableName,
    Item: item,
    ConditionExpression: "attribute_not_exists(orderId)"
  }));

  return {
    statusCode: 201,
    body: JSON.stringify({ message: "Order saved", orderId: item.orderId })
  };
};
