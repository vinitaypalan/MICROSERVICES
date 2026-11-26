# Product Service

Product Service is a small online shop built to show how common AWS services
can work together. Customers can browse products, and signed-in customers can
view their profile. Product information is stored in MySQL. A separate example
stores orders in DynamoDB.

> **Deployment status:** The code and CloudFormation templates are in this
> repository. This does not mean the AWS system has been deployed. No live
> service URL is claimed.

## What does it do?

- Shows products from a MySQL database.
- Lets visitors browse without signing in.
- Uses Amazon Cognito for customer registration and sign-in.
- Checks a Cognito token before showing the private `/me` profile.
- Includes a separate Lambda example for saving orders to DynamoDB.

## How is it put together?

![Diagram of the Product Service AWS architecture](docs/aws-architecture.svg)

The website files are stored in a private S3 bucket and delivered by
CloudFront. The website calls the Product API through a public HTTPS load
balancer. AWS WAF protects that API entrance. The API runs on private ECS
Fargate tasks and reads products from private RDS MySQL.

The API and website are separate: CloudFront serves the website, while the
browser calls the API address configured for the frontend.

## AWS services in simple terms

| Service | What it does here |
| --- | --- |
| CloudFront and S3 | Deliver the website while keeping its storage private |
| Cognito | Registers and signs in customers |
| WAF | Checks public API requests for common bad traffic |
| Application Load Balancer | Sends secure API requests to the app |
| ECS Fargate | Runs the Product API without managing servers |
| RDS MySQL | Stores product information |
| Secrets Manager | Keeps the database username and password |
| ECR | Stores the API's Docker images |
| CodePipeline and CodeBuild | Build and test changes from GitHub |
| CodeDeploy | Moves API traffic to a new version and can roll back a failed release |
| Lambda and DynamoDB | Provide a separate example for storing orders |
| CloudWatch | Collects application logs and service measurements |
| CloudFormation | Describes AWS resources as reusable templates |

## Product API

| Method | Path | Who can use it? | What it does |
| --- | --- | --- | --- |
| `GET` | `/health` | Anyone | Checks the database connection |
| `GET` | `/products?page=1&limit=20` | Anyone | Lists products a page at a time |
| `GET` | `/products/:id` | Anyone | Shows one product |
| `GET` | `/me` | Signed-in customer | Shows verified Cognito profile details |

The API reads products from MySQL. It checks page numbers and product IDs and
returns helpful error responses. The `/me` route checks the Cognito token's
signature, issuer, expiry, token type and app-client identity.

Example:

```powershell
Invoke-RestMethod "http://localhost:3000/products?page=1&limit=4"
Invoke-RestMethod "http://localhost:3000/products/1"
```

## Run it on your computer

You need Docker Desktop. From the project folder, run:

```powershell
docker compose up --build
```

Then open `http://localhost:5173`. The API is at `http://localhost:3000`.
MySQL starts with sample products the first time.

Without Cognito settings, product browsing still works, but customer sign-in
does not. To use real Cognito sign-in, configure the Cognito settings described
in the [deployment guide](docs/deployment.md).

## Orders are separate

The Orders Lambda writes an order to DynamoDB. The current project does not
connect this Lambda to the Product API or create an automatic event trigger.
It must be invoked separately.

## Deploy to AWS

AWS setup takes several steps and needs existing AWS resources. Follow the
[AWS deployment guide](docs/deployment.md) for prerequisites, commands, and
the order to deploy the templates.

## Checks

The repository includes API tests and a frontend build. These checks do not
prove that AWS has been deployed or that AWS services work together.

## More information

- [Architecture diagram](docs/aws-architecture.svg)
- [AWS deployment guide](docs/deployment.md)
- [Screenshot capture checklist](docs/screenshots/README.md)
