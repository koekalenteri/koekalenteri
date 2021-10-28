# Koekalenteri

[![Quality gate](https://sonarcloud.io/api/project_badges/quality_gate?project=koekalenteri_koekalenteri)](https://sonarcloud.io/dashboard?id=koekalenteri_koekalenteri)

An open-source project to implement the functionality of <http://koekalenteri.snj.fi> on a modern architecture and futher enhance it with new functionality. Koekalenteri is used to create a calendar of the different types of retriever hunt tests (NOME-A, NOME-B, NOME-WT and NOU) in Finland as well as a tool for entrants to enter their dogs and organizers to manage entries etc.

## Development

The following tools must be installed:

* [AWS CLI](https://aws.amazon.com/cli/)
* [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
* [Docker](https://www.docker.com/get-started)
* [Node.js 12+](https://nodejs.org/)

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

Following commands install dependencies to all of the projects and initialize a docker network and dynamodb instance

```bash
npm ci
npm run docker-init
```

### Local development

#### Start the dynamodb instance (once, it is persistent)

```bash
npm run dynamodb
```

#### Start backend & frontend

```bash
npm start
```

This command will start both backend and frontend.
Changes are detected automatically. Only if you change the template.yaml, you need to stop (ctrl-c) and restart.

Note: SAM local is very slow, because it rebuilds lambda on every access. If you are changing only the frontend, please see README.md in koekalenteri-frontend folder.

**Please note that AWS Cognito cannot be run locally so for user authentication a working network connection to the AWS setup is required.**

### Deploying

Deployment automated with GitHub actions and AWS Amplify.
