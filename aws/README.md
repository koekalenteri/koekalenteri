## Manual data migration example

### get

aws dynamodb scan --table-name event-table-v2-koekalenteri-dev --output json | jq "{ \"event-table-v3-koekalenteri-dev\": [ .Items[] | { PutRequest: { Item: . } } ] }" > kokeet.json

aws dynamodb query --table-name event-table-v3-koekalenteri-prod --key-condition-expression "id = :id" --expression-attribute-values '{":id":{"S":"zGBgx67eq7"}}'  --output json | jq "{ \"event-table-v3-koekalenteri-dev\": [ .Items[] | { PutRequest: { Item: . } } ] }" > sm24.json

aws dynamodb query --table-name event-registration-table-koekalenteri-prod --key-condition-expression "eventId = :id" --expression-attribute-values '{":id":{"S":"qM0H5WG_5C"}}' --output json | jq "{ \"event-registration-table-koekalenteri-dev\": [ .Items[] | { PutRequest: { Item: . } } ] }" > ilmot.json

## change emails

jq 'walk(if type == "object" and has("email") then .email.S="user@exmaple.com" else . end)' ilmot.json > ilmot-fix.json

### split to 25 record chunks (max for batch-write-item, duh!)

node split.js kokeet.json

### put

aws dynamodb batch-write-item --request-items file://kokeet0.json
...

## GitHub deploy role (OIDC)

`github-deploy-role.yaml` is the role the release workflow deploys with, assumed through GitHub's
OIDC federation by the jobs that run under the `dev`, `test` or `prod` deployment environment
(KOE-1349). Its `RoleArn` output is the repository secret `AWS_DEPLOY_ROLE_ARN`. Its permissions are
written out in the template (KOE-1572) and keep the deploy to the `koekalenteri-dev`, `-test` and
`-prod` stacks and their resources; the role can create IAM roles, so they are a guard against
mistakes, not a security boundary. A change to them is deployed by hand with administrator
credentials and no parameter overrides, because this stack owns the account's OIDC provider and
`ProviderExists` must stay `false`:

```sh
aws cloudformation deploy --region eu-north-1 --stack-name koekalenteri-github-deploy \
  --template-file aws/github-deploy-role.yaml --capabilities CAPABILITY_NAMED_IAM
```
