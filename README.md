# Koekalenteri

[![Quality gate](https://sonarcloud.io/api/project_badges/quality_gate?project=koekalenteri_koekalenteri)](https://sonarcloud.io/dashboard?id=koekalenteri_koekalenteri)

An open-source project to implement the functionality of <http://koekalenteri.snj.fi> on a modern architecture and futher enhance it with new functionality. Koekalenteri is used to create a calendar of the different types of retriever hunt tests (NOME-A, NOME-B, NOME-WT and NOU) in Finland as well as a tool for entrants to enter their dogs and organizers to manage entries etc.

## Development

The following tools must be installed:

* [AWS CLI](https://aws.amazon.com/cli/)
* [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
* Docker
* Node.js 12+

All scripts assume that you have a well configured CLI with the necessary AWS profile set, see [AWS profile creation](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html). It is recommended to name this profile as *koekalenteri* – at least all scripts and examples here assume this setup.

### Building and deploying

All of the following commands assume that you have set the following environment variables:

    export AWS_DEFAULT_REGION=eu-north-1
    export STACK_NAME=amplify-koekalenteri

The supplied ```deploy.sh``` is used to create the initial deployment to AWS and the base settings. You should not need to run it as the base set of resources should be already provisioned into Amplify.

Next copy run

    cp samconfig.default.toml samconfig.toml

In the new file change all instances of the OauthToken from ```foobar``` to your [personal token](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token)

You can use the different build env parameters in manual deployments by adding the parameter ```--config-env [env name]``` to all of the sam commands listed below.

To manually build and deploy the backend functionality you will need the following commands. Check the values for the environment variables from the samconfig.toml file.

    sam build --use-container
    sam package \
        --output-template-file packaged.yml \
        --s3-bucket $DEPLOYMENT_BUCKET \
        --s3-prefix $BUCKET_PREFIX
    sam deploy \
        --template-file packaged.yml \
        --stack-name $STACK_NAME \
        --capabilities CAPABILITY_IAM

See ```samconfig.toml``` to find the value of the relevant DEPLOYMENT_BUCKET for the environment in which you wan to deploy.

To run locally, use the following commands:

    docker run -p 8000:8000 amazon/dynamodb-local
    sh koekalenteri-backend/test/environment/local/create_tables.sh
    sam local start-api --env-vars todo-src/test/environment/local/mac.json

**Please note that the environment file has only been created for mac so far. It will need to be created for other OSs as needed.**

The frontend configuration file ```koekalenteri-frontend/src/config.default.js``` must be copied to ```koekalenteri-frontend/src/config.js``` and the values there replaced by the output of

    aws cloudformation describe-stacks --stack-name $STACK_NAME \
        --query "Stacks[0].Outputs[]"

For local testing set the ```redirect_url``` to ```https://localhost:8080``` then run

    cd koekalenteri-frontend/src
    npm start

To use the local backend set ```api_base_url``` to ```http://127.0.0.1:8080```

**Please note that AWS Cognito cannot be run locally so for user authentication a working network connection to the AWS setup is required.**
