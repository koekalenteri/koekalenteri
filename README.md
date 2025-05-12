# Koekalenteri

[![Quality gate](https://sonarcloud.io/api/project_badges/quality_gate?project=koekalenteri_koekalenteri)](https://sonarcloud.io/dashboard?id=koekalenteri_koekalenteri)

An open-source project to implement the functionality of <http://koekalenteri.snj.fi> on a modern architecture and futher enhance it with new functionality. Koekalenteri is used to create a calendar of the different types of retriever hunt tests (NOME-A, NOME-B, NOME-WT and NOU) in Finland as well as a tool for entrants to enter their dogs and organizers to manage entries etc.

## Development

The following tools must be installed:

* [AWS CLI](https://aws.amazon.com/cli/)
* [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
* [Docker](https://www.docker.com/get-started)
* [Node.js 16+](https://nodejs.org/)

All scripts assume that you have a well configured CLI with the necessary AWS profile set, see [AWS profile creation](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html). It is recommended to name this profile as *koekalenteri* – at least all scripts and examples here assume this setup.

### Configuring AWS CLI

You need `AWS Access Key ID` and `AWS Secret Access Key`. These can be generated in the [IAM console](https://console.aws.amazon.com/iam/).

```bash
aws configure --profile koekalenteri
```

#### Environment variables

You will need to setup the following environment variables so AWS uses the configured profile

Linux or macOS

```bash
export AWS_PROFILE=koekalenteri
```

Windows

```ps1
setx AWS_PROFILE koekalenteri
```

### Setting up dependencies and services

Following commands install dependencies to the project and initialize a docker network and dynamodb instance

```bash
npm ci
npm run init
```

### Local development

#### Start backend and frontend

```bash
npm start
```

This command will start both backend and frontend.
Changes are detected automatically. Only if you change the template.yaml, you need to stop (ctrl-c) and restart.

Note: SAM local is very slow, because it rebuilds lambda on every access.

**Please note that AWS Cognito cannot be run locally so for user authentication a working network connection to the AWS setup is required.**

#### Start frontend only

```bash
npm start-frontned
```

This command starts only the frontend.

Note: You should configure .env (see .env_sample) to use backend in the cloud.

### Deploying

Deployment is automated with GitHub actions.

## Backend overview

Koekalenteri backend is a bunch of lambda functions running on AWS. The system also uses a Cloudflare Worker as a proxy between clients and Upstash Redis to provide real-time updates via Server-Sent Events (SSE).

## Frontend overview

Koekalenteri frontend is written in [TypeScript](https://www.typescriptlang.org/) and is based on the following major libraries:

* [React](https://reactjs.org/) - UI framework
* [Recoil](https://recoiljs.org/) - State management
  * State is documented in [src/pages/recoil](src/pages/recoil/README.md) and [src/pages/admin/recoil](src/pages/admin/recoil/README.md)

## Real-time Updates

Koekalenteri uses Server-Sent Events (SSE) to provide real-time updates to clients. The implementation consists of:

* **Cloudflare Worker**: Acts as a proxy between clients and Upstash Redis, located in `cf/sse-worker/`
* **Upstash Redis**: Stores and distributes real-time messages
* **SSE Protocol**: Allows the server to push updates to clients over a single HTTP connection

This architecture enables features like instant updates to registration statuses, event changes, and other time-sensitive information without requiring clients to refresh their browser.
