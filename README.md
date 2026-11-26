# Product Service

## Introduction

Product Service is a small online shop example built with AWS. Its React
website shows products from a Node.js API. The API reads product details from
MySQL on Amazon RDS. Customers sign in with Amazon Cognito. A separate Lambda
function saves orders in DynamoDB. CloudFormation describes the AWS resources,
and a GitHub pipeline builds and releases the API to ECS Fargate.

### What is this project?

It is an example of how a website, API, database, and AWS services can work
together. It includes a React website, a Node.js product API, and CloudFormation
templates for AWS services such as ECR, ECS, Cognito, WAF, CloudFront, S3, and
the tools that build and release the API.

### Why was it built?

It was built to practice connecting application parts and releasing changes
reliably. The website and API are public entry points, while the app and
database run in private networks. The project also shows how to store database
passwords safely, check a new release before sending it customer traffic, and
save orders with a separate Lambda function. The templates are a starting
point for learning; they still need to be deployed and tested in an AWS account.

## Project structure

```text
product-service/
├── src/
│   ├── app.js
│   ├── db.js
│   └── server.js
├── frontend/
│   ├── src/
│   ├── Dockerfile
│   └── nginx.conf
├── database/
│   └── init.sql
├── lambda/
│   └── orders/
│       ├── index.js
│       ├── package.json
│       └── package-lock.json
├── cloudformation/
│   ├── ecr-repository.yaml
│   ├── ecs-service.yaml
│   ├── cognito-user-pool.yaml
│   ├── waf-alb.yaml
│   └── frontend-cloudfront.yaml
├── docs/
│   ├── aws-architecture.svg
│   └── deployment.md
├── scripts/
│   └── deploy-frontend.ps1
├── docker-compose.yml
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

![Product Service AWS architecture diagram with AWS service icons](docs/aws-architecture.svg)

The diagram uses AWS architecture service icons and separates customer request
traffic from the deployment pipeline.

## AWS Services Used

- **Amazon ECS with AWS Fargate and Fargate Spot** — Runs the API containers.
  AWS manages the servers; Spot can add lower-cost capacity when available.
- **Amazon CloudFront** — Sends the React website to customers over HTTPS from
  a private S3 bucket using Origin Access Control.
- **Amazon S3** — Stores the private website files, pipeline files, and the
  packaged Lambda function.
- **Amazon Cognito** — Creates customer accounts and signs customers in. The
  website uses Cognito's Hosted UI and secure sign-in flow.
- **AWS WAF** — Checks requests to the public ALB against AWS managed rules
  and a rate limit. It also provides logs and metrics.
- **Application Load Balancer (ALB)** — Provides the public HTTPS API address,
  redirects HTTP to HTTPS, checks API health, and supports blue/green releases.
- **Amazon RDS for MySQL** — Stores the products returned by the REST API.
- **Amazon ECR** — Stores versioned Product Service container images.
- **AWS CodePipeline** — Starts the build-and-release steps when the chosen
  GitHub branch changes.
- **AWS CodeBuild** — Runs API tests, builds the website and container, and
  uploads the container to ECR.
- **AWS CodeDeploy** — Starts a second ECS task set, checks it, then shifts
  customer traffic to it if it is healthy.
- **AWS Lambda** — Checks order data and writes it to the existing DynamoDB
  table. X-Ray tracing is enabled.
- **Amazon DynamoDB** — Stores orders for the Lambda example.
- **AWS Secrets Manager** — Supplies database credentials to ECS tasks without
  embedding them in the image.
- **Amazon CloudWatch** — Collects container/Lambda logs and displays ECS,
  ALB, and Lambda metrics on a dashboard.
- **AWS Identity and Access Management (IAM)** — Grants the build, pipeline,
  deployment, task, and Lambda roles only their required permissions.
- **Amazon VPC and security groups** — Put the ALB in public subnets and ECS
  tasks in private subnets. Security groups control traffic between the ALB,
  tasks, and RDS. The ECS template uses an existing VPC; it does not create one.
- **AWS CloudFormation** — Defines the ECR repository and application
  infrastructure as templates.

## Request Flow

1. A customer's browser loads the React storefront through CloudFront. The
   website files are held in a private S3 bucket.
2. The browser requests products from the public HTTPS ALB. AWS WAF protects
   this entry point.
3. The ALB sends the request to an ECS Fargate task in a private subnet.
4. The API reads product data from RDS MySQL using credentials from Secrets
   Manager, then returns JSON to the browser.
5. Registration and sign-in use Cognito Hosted UI. The `/me` endpoint checks
   the signed-in customer's Cognito token.
6. ALB and ECS health checks use `GET /health`. Logs and metrics go to
   CloudWatch.

The CloudFront distribution serves the frontend files; the browser calls the
API separately at the frontend's configured API URL.

## CI/CD Deployment Flow

1. A commit to the configured GitHub branch triggers CodePipeline.
2. CodeBuild runs API tests, builds the frontend, then builds the Docker image,
   tags it with the source commit, and pushes it to ECR.
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

## Results

- API tests and website builds can be run on a computer; CloudFormation
  templates can be checked with the AWS CLI.
- No AWS resources or customer-facing endpoint are claimed as deployed.
- A successful template check or local build does not prove that AWS services
  work together in a deployed environment.

### Deployment instructions

See the [AWS deployment guide](docs/deployment.md) for prerequisites and
step-by-step deployment commands.

## Application API and local run

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/products?page=1&limit=20` | Return a page of products from RDS |
| `GET` | `/products/:id` | Return one product |
| `GET` | `/health` | Check database connectivity; used by health checks |
| `GET` | `/me` | Return customer profile; requires a valid Cognito JWT |

The database must contain a `products` table with `id`, `name`, `description`,
`price`, and `image_url` columns. Product browsing is public. The `/me`
endpoint verifies the Cognito JWT signature, issuer, expiration, token type,
and app-client identity.

To run the frontend, API, and local MySQL database together, use Docker Compose:

```powershell
docker compose up --build
```

Open the frontend at `http://localhost:5173`. The API is at
`http://localhost:3000`. The local database is seeded with sample products.
Local Cognito sign-in requires a real Cognito User Pool configuration; it is
not simulated.

To run only the API against an existing reachable database, install
dependencies and set its database environment variables:

```powershell
npm ci
$env:DB_HOST = "your-rds-endpoint"
$env:DB_PORT = "3306"
$env:DB_NAME = "products"
$env:DB_USER = "app_user"
$env:DB_PASSWORD = "your-password"
npm start
```

Check the local API:

```powershell
Invoke-RestMethod "http://localhost:3000/health"
Invoke-RestMethod "http://localhost:3000/products?page=1&limit=4"
Invoke-RestMethod "http://localhost:3000/products/1"
```

Never commit database passwords or other secrets.

## Impact & Value

### Technical Impact

- CloudFormation templates help create the same ECR, ECS, pipeline, monitoring,
  and Lambda resources again.
- Private networks, limited IAM permissions, Secrets Manager, and table-level
  DynamoDB access help protect the app and its data.
- CodePipeline, CodeBuild, and CodeDeploy build and release the API. Blue/green
  releases let the team check a new version before sending it customer traffic.
- Fargate Spot and ECS auto scaling offer ways to balance cost and capacity.

### Business Value

- Automatic builds and releases mean fewer manual steps.
- Health checks and blue/green releases help reduce problems during an update.
- Fargate Spot can lower costs for extra capacity, while regular Fargate
  capacity remains available.
- RDS stores the product data. Secrets Manager keeps database passwords out of
  the container image.

### Key learnings

- Fargate tasks require `awsvpc` networking and explicit CPU and memory
  settings; capacity-provider strategies replace `LaunchType`.
- ECS blue/green deployments need paired target groups and production/test
  ALB listener routes.
- Private subnets still need deliberate routes or endpoints for AWS APIs and
  the database.
- CloudFormation validation checks the template, but only deployment and
  runtime integration tests verify behavior in the target account.
