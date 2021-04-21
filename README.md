# Koekalenteri

[![Coverage Status](https://coveralls.io/repos/github/koekalenteri/koekalenteri/badge.svg)](https://coveralls.io/github/koekalenteri/koekalenteri)

An open-source project to implement the functionality of <http://koekalenteri.snj.fi> on a modern architecture and futher enhance it with new functionality. Koekalenteri is used to create a calendar of the different types of retriever hunt tests (NOME-A, NOME-B, NOME-WT and NOU) in Finland as well as a tool for entrants to enter their dogs and organizers to manage entries etc.

## Development

The following tools must be installed:

* [AWS CLI](https://aws.amazon.com/cli/)
* [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
* Docker
* Node.js 12+

### Building and deploying

To deploy to AWS Amplify run

    ./deploy.sh

This builds and deploys the code to Amplify. To run locally, use the following commands:

    TODO

**Please note that AWS Cognito cannot be run locally so for user authentication a working network connection to the AWS setup is required.**