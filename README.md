# Product Service

## Introduction

Product Service is a cloud-native microservices project: a Node.js REST API
that reads product data from Amazon RDS for MySQL, with a companion Lambda
function that saves orders to DynamoDB. Its infrastructure templates describe
container delivery to ECS on Fargate, an internal Application Load Balancer,
monitoring, and a GitHub-triggered CI/CD pipeline.

### What is this project?

It is a reference implementation for building, packaging, and deploying a
small product API on AWS. It combines a production-oriented Docker image with
CloudFormation-defined ECR, ECS, CodePipeline, CodeBuild, CodeDeploy
blue/green deployment, and CloudWatch resources.

### Why was it built?

The project demonstrates how to connect an application and managed AWS
services through repeatable infrastructure-as-code and automated delivery.
It brings together private service networking, managed database credentials,
Fargate and Fargate Spot capacity, deployment health checks, and a
least-privilege order-writing Lambda with X-Ray tracing. The goal is to
provide a practical starting point for learning and adapting a cloud
microservice architecture; the AWS infrastructure still requires deployment
and runtime validation in the target account.

## Project structure

```text
product-service/
├── src/
│   ├── app.js
│   ├── db.js
│   └── server.js
├── lambda/
│   └── orders/
│       ├── index.js
│       ├── package.json
│       └── package-lock.json
├── cloudformation/
│   ├── ecr-repository.yaml
│   └── ecs-service.yaml
├── appspec.yaml
├── buildspec.yml
├── taskdef-template.json
├── Dockerfile
├── .dockerignore
├── .env.example
├── package.json
└── package-lock.json
```

## Architecture Overview

![Product Service AWS architecture diagram with official AWS service icons](docs/aws-architecture.svg)

*Service icons are from the
[official AWS Architecture Icons package](https://aws.amazon.com/architecture/icons/)
(July 2026 release).*

## AWS Services Used

- **Amazon ECS with AWS Fargate and Fargate Spot** — Runs the container without
  managing EC2 hosts; the capacity-provider strategy reserves a regular
  Fargate baseline and uses Spot for additional capacity.
- **Elastic Load Balancing (Application Load Balancer)** — Provides an
  internal API endpoint, health checks, and production/test listener routes
  for blue/green releases.
- **Amazon RDS for MySQL** — Stores the products returned by the REST API.
- **Amazon ECR** — Stores versioned Product Service container images.
- **AWS CodePipeline** — Starts the build-and-deploy workflow from changes to
  the configured GitHub branch.
- **AWS CodeBuild** — Builds the Docker image and pushes it to ECR.
- **AWS CodeDeploy** — Coordinates ECS blue/green deployments and traffic
  shifting through the ALB.
- **Amazon S3** — Stores pipeline artifacts and the packaged Lambda deployment
  ZIP.
- **AWS Lambda** — Validates and writes order items to the existing DynamoDB
  table; active X-Ray tracing is enabled.
- **Amazon DynamoDB** — Stores orders for the Lambda example.
- **AWS Secrets Manager** — Supplies database credentials to ECS tasks without
  embedding them in the image.
- **Amazon CloudWatch** — Collects container/Lambda logs and displays ECS,
  ALB, and Lambda metrics on a dashboard.
- **AWS Identity and Access Management (IAM)** — Grants the build, pipeline,
  deployment, task, and Lambda roles only their required permissions.
- **Amazon VPC and security groups** — Keep tasks and the ALB private and
  control access to the API and RDS. The ECS template uses an existing VPC;
  it does not create one.
- **AWS CloudFormation** — Defines the ECR repository and application
  infrastructure as templates.

## Request Flow

1. A client connected to the VPC calls `GET /products` on the internal ALB.
2. The ALB forwards the request to a healthy Product Service ECS task on
   Fargate.
3. The service reads the `products` table in RDS using credentials from
   Secrets Manager.
4. The service returns the database rows to the client as a JSON response
   through the ALB.
5. The ALB and ECS health checks use `GET /health`; logs and metrics are
   available in CloudWatch.

## CI/CD Deployment Flow

1. A commit to the configured GitHub branch triggers CodePipeline.
2. CodeBuild builds the Docker image, tags it with the source commit, and
   pushes it to ECR.
3. CodePipeline passes the new image and task-definition artifact to
   CodeDeploy.
4. CodeDeploy starts the green ECS task set and checks it through the ALB test
   listener.
5. If healthy, CodeDeploy shifts production traffic to the new task set; a
   failed deployment is rolled back.

## Order Processing Flow

1. An order payload with a non-empty `orderId` is sent to the Lambda function.
2. Lambda writes the order to the existing DynamoDB table. Duplicate order IDs
   are rejected instead of overwriting an item.
3. Lambda traces and logs are available through X-Ray and CloudWatch.

   No event source is created by the current template; the Lambda must be
   invoked manually or connected to an order event source separately.

## Results & Live Demo

### Results

- The Docker image built successfully with production dependencies.
- Node.js syntax checks passed for the service and Lambda handler.
- The CloudFormation templates passed AWS
  `cloudformation validate-template`.
- The ECS, ECR, RDS, DynamoDB, source connection, and pipeline resources have
  **not** been deployed or tested end to end. These are validation results,
  not production availability or performance claims.

### Deployment instructions

Deployment requires an AWS account and region with a VPC and subnets, RDS,
Secrets Manager credentials, an existing DynamoDB table, an ECR repository and
initial image, an authorized GitHub connection, and an uploaded Lambda ZIP.
Then deploy the ECS stack using the configured resource IDs and parameters.

See [detailed deployment steps](#deployment-steps-full) below for the complete
prerequisites, PowerShell commands, and deployment-status checks.

### Live demo

**No live demo link is available yet.** The current AWS account was checked,
but it does not have the VPC, RDS database, ECR image repository, or other
required deployment resources in `us-east-1`. After deployment, add the
internal ALB URL here if it is accessible to your intended audience. The
endpoint is private and is not publicly accessible.

## Application API and local run

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/products` | Return products from the configured RDS table |
| `GET` | `/health` | Check database connectivity; used by health checks |

The database must contain a `products` table with `id`, `name`, `description`,
and `price` columns.

1. Install the dependencies:

```powershell
npm ci
```

2. Set the RDS values in the PowerShell terminal. Replace the sample values
with your own; `.env.example` is a reference and is not automatically loaded
by Node.js:

```powershell
$env:DB_HOST = "your-rds-endpoint"
$env:DB_PORT = "3306"
$env:DB_NAME = "products"
$env:DB_USER = "app_user"
$env:DB_PASSWORD = "your-password"
```

3. Start the service:

```powershell
npm start
```

4. In another terminal, check the API:

```powershell
Invoke-RestMethod "http://localhost:3000/health"
Invoke-RestMethod "http://localhost:3000/products"
```

The service needs a reachable RDS database and valid credentials to start.
Keep database secrets out of source control.

## Deployment steps (full)

### Prerequisites

- AWS CLI configured with a deployment IAM role or user in the target account
  and region.
- Docker installed and running.
- A VPC with at least two subnets in different Availability Zones.
- An RDS for MySQL instance and its security group in that VPC.
- A Secrets Manager secret with JSON keys `username` and `password`.
- An existing DynamoDB table whose partition key is the string `orderId`.
- A GitHub CodeStar/CodeConnections connection, authorized for the repository.
- An S3 bucket in the deployment region for the Lambda package.

The ECS tasks use no public IP. Subnets must provide access to ECR,
CloudWatch Logs, Secrets Manager, and RDS, using NAT or suitable VPC endpoints.

### 1. Create the ECR repository and push an initial image

From the project root in PowerShell:

```powershell
$AWS_REGION = "us-east-1"
$ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text)
$ECR_REGISTRY = "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
$ECR_URI = "$ECR_REGISTRY/product-service"

aws cloudformation deploy `
  --template-file .\cloudformation\ecr-repository.yaml `
  --stack-name product-service-ecr `
  --region $AWS_REGION

aws ecr get-login-password --region $AWS_REGION |
  docker login --username AWS --password-stdin $ECR_REGISTRY

docker build -t product-service:latest .
docker tag product-service:latest "${ECR_URI}:latest"
docker push "${ECR_URI}:latest"
```

### 2. Package and upload the Orders Lambda

```powershell
Push-Location .\lambda\orders
npm ci --omit=dev
Compress-Archive -Path .\index.js, .\package.json, .\node_modules `
  -DestinationPath ..\..\orders-lambda.zip -Force
Pop-Location

$LAMBDA_CODE_BUCKET = "your-deployment-artifact-bucket"
aws s3 cp .\orders-lambda.zip `
  "s3://$LAMBDA_CODE_BUCKET/product-service/orders-lambda.zip" `
  --region $AWS_REGION
```

### 3. Deploy ECS, monitoring, and the pipeline

Set the following values to real resources in the same AWS region. Replace
example IDs, database information, repository, and connection ARN. The initial
ECR image and Lambda ZIP must be uploaded before this deployment.

```powershell
$VPC_ID = "vpc-xxxxxxxx"
$VPC_CIDR = "10.0.0.0/16"
$SUBNET_IDS = "subnet-aaaaaaaa,subnet-bbbbbbbb"
$RDS_SECURITY_GROUP_ID = "sg-xxxxxxxx"
$DB_HOST = "your-rds-endpoint"
$DB_NAME = "products"
$DB_SECRET_ARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:product-db-xxxxx"
$ORDERS_TABLE_NAME = "your-existing-orders-table"
$SOURCE_CONNECTION_ARN = "arn:aws:codeconnections:us-east-1:123456789012:connection/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
$SOURCE_REPOSITORY = "your-github-owner/your-repository"
$IMAGE_URI = "${ECR_URI}:latest"

aws cloudformation deploy `
  --template-file .\cloudformation\ecs-service.yaml `
  --stack-name product-service-ecs `
  --region $AWS_REGION `
  --capabilities CAPABILITY_IAM `
  --parameter-overrides `
    VpcId=$VPC_ID `
    VpcCidr=$VPC_CIDR `
    SubnetIds=$SUBNET_IDS `
    DatabaseSecurityGroupId=$RDS_SECURITY_GROUP_ID `
    DbHost=$DB_HOST `
    DbName=$DB_NAME `
    DbCredentialsSecretArn=$DB_SECRET_ARN `
    ImageUri=$IMAGE_URI `
    MinTaskCount=1 `
    MaxTaskCount=4 `
    CpuTargetUtilization=60 `
    OrdersTableName=$ORDERS_TABLE_NAME `
    LambdaCodeS3Bucket=$LAMBDA_CODE_BUCKET `
    LambdaCodeS3Key=product-service/orders-lambda.zip `
    SourceConnectionArn=$SOURCE_CONNECTION_ARN `
    SourceRepository=$SOURCE_REPOSITORY `
    SourceBranch=main `
    EcrRepositoryName=product-service
```

The ECS cluster uses Fargate and Fargate Spot. Its capacity-provider strategy
reserves one regular Fargate task and uses a 1:2 Fargate-to-Spot weight for
additional tasks. Spot capacity can be interrupted. The template creates an
internal ALB on ports 3000 (production) and 3001 (deployment test), CPU-based
service auto scaling, a CloudWatch dashboard, and a CodePipeline that builds
images and deploys through CodeDeploy blue/green. CodeDeploy rolls back failed
deployments.

The Orders Lambda has active X-Ray tracing and `dynamodb:PutItem` permission
scoped to the configured table. The function accepts an order object with a
non-empty `orderId`, or an API-style event with a JSON string `body`. No event
source is created by this template; invoke it manually or connect a trigger
separately. The existing DynamoDB table must use a string `orderId` partition
key.

### 4. Check deployment status

```powershell
aws cloudformation describe-stacks `
  --stack-name product-service-ecs `
  --region $AWS_REGION `
  --query "Stacks[0].{Status:StackStatus,Outputs:Outputs}"

aws codepipeline get-pipeline-state `
  --name product-service `
  --region $AWS_REGION
```

After deployment, the stack output includes the internal ALB URL. It is
reachable only from the VPC or connected network.

## Impact & Value

### Technical Impact

- Infrastructure as code makes the ECR, ECS, pipeline, monitoring, and
  serverless resources repeatable to provision.
- Private Fargate networking, IAM roles, Secrets Manager, and table-scoped
  DynamoDB permissions help reduce unnecessary exposure.
- CodePipeline, CodeBuild, and CodeDeploy automate image publishing and
  blue/green ECS releases with rollback configuration.
- Fargate Spot capacity and ECS auto scaling provide options to balance
  compute cost with service capacity.

### Business Value

- Automating the build-to-deploy path can reduce manual release effort.
- Health checks and blue/green deployment practices can help limit release
  disruption.
- Fargate Spot can lower costs for eligible interruptible capacity while
  retaining a regular Fargate baseline.
- Managed RDS and Secrets Manager support data persistence and credential
  handling without baking database secrets into the image.

### Key learnings

- Fargate tasks require `awsvpc` networking and explicit CPU and memory
  settings; capacity-provider strategies replace `LaunchType`.
- ECS blue/green deployments need paired target groups and production/test
  ALB listener routes.
- Private subnets still need deliberate routes or endpoints for AWS APIs and
  the database.
- CloudFormation validation checks the template, but only deployment and
  runtime integration tests verify behavior in the target account.
