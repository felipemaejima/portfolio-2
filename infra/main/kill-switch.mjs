// Cost circuit breaker. SNS invokes it when the API's compute runs away (CloudWatch alarm, minutes) or the monthly
// budget is exceeded (billing data, hours late). Budgets and alarms only alert; this acts.
// Reserved concurrency 0 stops every invocation of the API — requests get 503 at CloudFront — while the static site
// keeps working. After investigating, turn the API back on with `make api-enable`.
import { LambdaClient, PutFunctionConcurrencyCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});

export const handler = async () => {
  const functionName = process.env.TARGET_FUNCTION;
  await lambda.send(new PutFunctionConcurrencyCommand({ FunctionName: functionName, ReservedConcurrentExecutions: 0 }));
  console.log(JSON.stringify({ message: 'Budget exceeded: API disabled', functionName }));
};
