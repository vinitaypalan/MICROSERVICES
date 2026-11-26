# AWS Deployment Guide

This guide explains how to deploy the templates in this repository. It is not
a claim that the AWS resources have already been created.

## Before you begin

You need:

- An AWS account and AWS CLI credentials with permission to deploy CloudFormation,
  ECS, ECR, CodePipeline, CodeBuild, CodeDeploy, Lambda, WAF, Cognito, S3 and
  CloudFront resources.
- Docker Desktop and Node.js 22 or later.
- An existing VPC with at least two public and two private subnets, in different
  Availability Zones.
- Network routes or VPC endpoints so private ECS tasks can reach ECR,
  CloudWatch Logs and Secrets Manager.
- An existing private RDS for MySQL database and its security group.
- A Secrets Manager secret containing JSON keys named `username` and `password`.
- An existing DynamoDB table with a string `orderId` partition key.
- A valid ACM certificate for the API hostname in the same AWS region as the ALB.
- An authorized GitHub CodeConnections connection.
- A bucket to hold the packaged Orders Lambda.
- A domain and DNS records if you want friendly API or website names. DNS
  records are not created by these templates.

CloudFront custom-domain certificates must be in `us-east-1`. You can use the
default CloudFront domain instead of a custom website domain.

## 1. Check the templates

Run these commands from the project folder:

```powershell
$AWS_REGION = "us-east-1"

aws cloudformation validate-template --template-body file://cloudformation/ecr-repository.yaml --region $AWS_REGION
aws cloudformation validate-template --template-body file://cloudformation/frontend-cloudfront.yaml --region $AWS_REGION
aws cloudformation validate-template --template-body file://cloudformation/cognito-user-pool.yaml --region $AWS_REGION
aws cloudformation validate-template --template-body file://cloudformation/ecs-service.yaml --region $AWS_REGION
aws cloudformation validate-template --template-body file://cloudformation/waf-alb.yaml --region $AWS_REGION
```

Template validation checks the template format. It does not create resources
or test the running application.

## 2. Create ECR and upload the first API image

The ECS stack needs an image that already exists in ECR. The repository uses
immutable image tags, so choose a tag you have not used before.

```powershell
$ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text)
$ECR_REGISTRY = "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
$ECR_URI = "$ECR_REGISTRY/product-service"
$INITIAL_TAG = "initial-2026-11"

aws cloudformation deploy `
  --template-file .\cloudformation\ecr-repository.yaml `
  --stack-name product-service-ecr `
  --region $AWS_REGION

aws ecr get-login-password --region $AWS_REGION |
  docker login --username AWS --password-stdin $ECR_REGISTRY

docker build -t "product-service:$INITIAL_TAG" .
docker tag "product-service:$INITIAL_TAG" "${ECR_URI}:$INITIAL_TAG"
docker push "${ECR_URI}:$INITIAL_TAG"
```

## 3. Package the Orders Lambda

The ECS template deploys the separate Lambda function. Upload its package to an
existing bucket first:

```powershell
Push-Location .\lambda\orders
npm ci --omit=dev
Compress-Archive -Path .\index.js, .\package.json, .\node_modules `
  -DestinationPath ..\..\orders-lambda.zip -Force
Pop-Location

$LAMBDA_CODE_BUCKET = "your-lambda-package-bucket"
aws s3 cp .\orders-lambda.zip `
  "s3://$LAMBDA_CODE_BUCKET/product-service/orders-lambda.zip" `
  --region $AWS_REGION
```

The Lambda has no event source in this project. It is not connected to the
customer-facing API.

## 4. Create the private frontend and CloudFront distribution

The frontend template creates a private S3 bucket and a CloudFront distribution.
For a custom website domain, provide an ACM certificate in `us-east-1`.
Otherwise, omit those optional parameters.

```powershell
$FRONTEND_DOMAIN_NAME = ""
$FRONTEND_CERTIFICATE_ARN = ""

aws cloudformation deploy `
  --template-file .\cloudformation\frontend-cloudfront.yaml `
  --stack-name product-service-frontend `
  --region $AWS_REGION `
  --parameter-overrides `
    DomainName=$FRONTEND_DOMAIN_NAME `
    AcmCertificateArn=$FRONTEND_CERTIFICATE_ARN

$FRONTEND_DOMAIN = aws cloudformation describe-stacks `
  --stack-name product-service-frontend `
  --region $AWS_REGION `
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue | [0]" `
  --output text
```

For a custom website domain, set `$FRONTEND_DOMAIN` to that domain after
deployment and point its DNS record to the CloudFront distribution. The
CloudFormation template does not create the DNS record.

## 5. Create the Cognito User Pool

Use the CloudFront domain as both callback and logout URL. Add any local
development URL only if you intend to use Cognito locally.

```powershell
$COGNITO_DOMAIN_PREFIX = "choose-a-unique-login-name"
$FRONTEND_URL = "https://$FRONTEND_DOMAIN"

aws cloudformation deploy `
  --template-file .\cloudformation\cognito-user-pool.yaml `
  --stack-name product-service-cognito `
  --region $AWS_REGION `
  --parameter-overrides `
    EnvironmentName=production `
    CallbackUrls=$FRONTEND_URL `
    LogoutUrls=$FRONTEND_URL `
    CognitoDomainPrefix=$COGNITO_DOMAIN_PREFIX
```

Save these outputs for the next steps: `UserPoolId`, `AppClientId`, and
`HostedUiDomain`.

## 6. Deploy the API, ALB and delivery pipeline

The ALB certificate must match the API DNS name you plan to use. Create a DNS
record for that hostname after the stack deploys. The templates do not create
Route 53 records.

Set the resource values below to real values in your account. `CorsAllowedOrigins`
must be the exact website origin, including `https://` and without a trailing
slash. `ApiBaseUrl` for the frontend later should be the HTTPS API hostname
that matches the certificate.

```powershell
$VPC_ID = "vpc-xxxxxxxx"
$PUBLIC_SUBNET_IDS = "subnet-public-a,subnet-public-b"
$PRIVATE_SUBNET_IDS = "subnet-private-a,subnet-private-b"
$RDS_SECURITY_GROUP_ID = "sg-xxxxxxxx"
$DB_HOST = "your-rds-endpoint"
$DB_NAME = "products"
$DB_SECRET_ARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:product-db-xxxxx"
$ORDERS_TABLE_NAME = "your-existing-orders-table"
$SOURCE_CONNECTION_ARN = "arn:aws:codeconnections:us-east-1:123456789012:connection/xxxxxxxx"
$SOURCE_REPOSITORY = "your-github-owner/your-repository"
$ACM_CERTIFICATE_ARN = "arn:aws:acm:us-east-1:123456789012:certificate/xxxxxxxx"
$COGNITO_USER_POOL_ID = "us-east-1_xxxxxxxxx"
$COGNITO_APP_CLIENT_ID = "xxxxxxxxxxxxxxxxxxxxxxxxxx"
$CORS_ALLOWED_ORIGINS = "https://$FRONTEND_DOMAIN"
$IMAGE_URI = "${ECR_URI}:$INITIAL_TAG"

aws cloudformation deploy `
  --template-file .\cloudformation\ecs-service.yaml `
  --stack-name product-service-ecs `
  --region $AWS_REGION `
  --capabilities CAPABILITY_IAM `
  --parameter-overrides `
    VpcId=$VPC_ID `
    "PublicSubnetIds=$PUBLIC_SUBNET_IDS" `
    "PrivateSubnetIds=$PRIVATE_SUBNET_IDS" `
    AcmCertificateArn=$ACM_CERTIFICATE_ARN `
    CorsAllowedOrigins=$CORS_ALLOWED_ORIGINS `
    CognitoRegion=$AWS_REGION `
    CognitoUserPoolId=$COGNITO_USER_POOL_ID `
    CognitoAppClientId=$COGNITO_APP_CLIENT_ID `
    DatabaseSecurityGroupId=$RDS_SECURITY_GROUP_ID `
    DbHost=$DB_HOST `
    DbName=$DB_NAME `
    DbCredentialsSecretArn=$DB_SECRET_ARN `
    ImageUri=$IMAGE_URI `
    OrdersTableName=$ORDERS_TABLE_NAME `
    LambdaCodeS3Bucket=$LAMBDA_CODE_BUCKET `
    LambdaCodeS3Key=product-service/orders-lambda.zip `
    SourceConnectionArn=$SOURCE_CONNECTION_ARN `
    SourceRepository=$SOURCE_REPOSITORY `
    SourceBranch=main `
    EcrRepositoryName=product-service
```

The ECS template keeps tasks in private subnets, disables task public IPs, and
adds database ingress from the ECS task security group. The ALB listens on
HTTPS port 443 and redirects HTTP port 80 to HTTPS. The CodeDeploy test listener
uses port 3001; production uses port 443. The ALB security group currently
allows inbound ports 80 and 443 only, so the test listener is not reachable
from outside the ALB security group. Do not treat it as a public test URL.

The ECS template still exports an output named `InternalApiUrl` using HTTP on
port 3000. That output does not match the public HTTPS listener. Use your own
API DNS name with the supplied certificate instead; this template does not
create the DNS record.

## 7. Attach WAF to the ALB

Get the ALB ARN and deploy the WAF template:

```powershell
$ALB_ARN = aws elbv2 describe-load-balancers `
  --names product-service `
  --region $AWS_REGION `
  --query "LoadBalancers[0].LoadBalancerArn" `
  --output text

aws cloudformation deploy `
  --template-file .\cloudformation\waf-alb.yaml `
  --stack-name product-service-waf `
  --region $AWS_REGION `
  --parameter-overrides LoadBalancerArn=$ALB_ARN
```

## 8. Build and publish the frontend

The API URL and Cognito settings are included in the frontend bundle at build
time. These are public identifiers and URLs, not passwords or secrets.

```powershell
$API_BASE_URL = "https://api.your-domain.example"
$DISTRIBUTION_ID = aws cloudformation describe-stacks `
  --stack-name product-service-frontend `
  --region $AWS_REGION `
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue | [0]" `
  --output text
$FRONTEND_BUCKET = aws cloudformation describe-stacks `
  --stack-name product-service-frontend `
  --region $AWS_REGION `
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue | [0]" `
  --output text
$COGNITO_HOSTED_UI = "https://$COGNITO_DOMAIN_PREFIX.auth.$AWS_REGION.amazoncognito.com"

.\scripts\deploy-frontend.ps1 `
  -BucketName $FRONTEND_BUCKET `
  -DistributionId $DISTRIBUTION_ID `
  -ApiBaseUrl $API_BASE_URL `
  -CognitoClientId $COGNITO_APP_CLIENT_ID `
  -CognitoDomain $COGNITO_HOSTED_UI
```

The deploy script builds the frontend Docker image, copies its static files,
syncs them to S3, and asks CloudFront to refresh its cache.

## 9. Check deployment status

```powershell
aws cloudformation describe-stacks `
  --stack-name product-service-ecs `
  --region $AWS_REGION `
  --query "Stacks[0].{Status:StackStatus,Outputs:Outputs}"

aws codepipeline get-pipeline-state `
  --name product-service `
  --region $AWS_REGION
```

After DNS points to the ALB and the ACM certificate is valid, check the API
using the configured HTTPS API hostname:

```powershell
Invoke-RestMethod "https://api.your-domain.example/health"
Invoke-RestMethod "https://api.your-domain.example/products?page=1&limit=4"
```

CloudFormation validation or a successful build does not prove that the full
AWS system is working. Verify Cognito sign-in, API calls, database access,
WAF behavior, and a CodeDeploy release in the target account before describing
the service as operational.
