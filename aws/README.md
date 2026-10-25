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
OIDC federation instead of an access key kept in the repository secrets (KOE-1349). Its `RoleArn`
output is the repository secret `AWS_DEPLOY_ROLE_ARN`. Only the jobs that run under the `dev`,
`test` or `prod` deployment environment may assume it.

What the role may do is written out in the template (KOE-1572): CloudFormation on the stacks
`koekalenteri-dev`, `koekalenteri-test` and `koekalenteri-prod`, and the resources those stacks
create, by name where the name is the stack's and by account and region where AWS generates the id
(API Gateway, Cognito, Amplify). `src/lambda/deployRole.test.ts` checks every resource of the built
app template against the policies, so a new resource type or name fails in the pull request.

Every role the app stacks create carries the permissions boundary `koekalenteri-app-boundary`,
which this stack owns. The deploy role may create a role, or give one a policy, only when the role
has that boundary, so it cannot make a role that does more than the app's services. It may not take
a boundary off a role or swap it for another policy either, since a role given a wide policy under
the boundary would hold all of it once the boundary is gone. It is denied every change to itself,
the boundary and its own policies, so this stack is always deployed by hand with administrator
credentials:

```sh
aws cloudformation deploy --region eu-north-1 --stack-name koekalenteri-github-deploy \
  --template-file aws/github-deploy-role.yaml --capabilities CAPABILITY_NAMED_IAM
```

The stack owns the account's GitHub OIDC provider, so `ProviderExists` stays `false`, its default;
with `true` CloudFormation would delete the provider, and no job could assume the role.

A missing permission shows as `AccessDenied` in the failed deploy's stack events and in CloudTrail
(the event names the action). The escape hatch is to attach `AdministratorAccess` by hand, fix the
template, deploy this stack again and detach it. The same goes for a rollback that would take a
role's boundary off, which the role may not do: without `AdministratorAccess` the stack stops in
`UPDATE_ROLLBACK_FAILED`, and after attaching it the rollback is continued
(`aws cloudformation continue-update-rollback`). Only a rollback of the first boundary rollout
removes a boundary, and the move below keeps `AdministratorAccess` attached through it.

The role may cancel a stuck update and continue a rollback that failed, but it may not delete a
stack, so no job can remove prod. A stack whose first create failed ends in `ROLLBACK_COMPLETE` and
must be deleted before the next try: do that with administrator credentials, or with
`AdministratorAccess` attached for the moment.

All three environments share this one role, and its trust allows `environment:dev`,
`environment:test` and `environment:prod` alike. Who may deploy to each environment is therefore
decided by the GitHub environment protection rules of the repository, and they are part of this
boundary: a job that may run under `dev` gets the same permissions on prod. The `test` environment
is currently unrestricted (a test release may start from any branch) and shares this role with
prod, so restrict who can run workflows there.

What the boundary leaves on any resource: `cloudwatch:PutMetricData` (it names none), SES (the app
sends as the account's identities with its templates), Amplify (the Amplify service role's own
calls) and the listing of log groups and streams. Everything else is held to the stacks' tables,
buckets, log groups and the API Gateway ones, functions, RUM monitors, the WebSocket APIs of the
account, and the SSM parameters `src/lambda/lib/secrets.ts` reads (`KL_API_*` and
`koekalenteri-<env>-*`). `kms:Decrypt` is allowed only through SSM in this account, because
`secrets.ts` reads the parameters with decryption and a SecureString one is decrypted with the
role's own credentials; the key policy does not lift the boundary. One boundary serves the three
stacks, so it does not keep a dev role off a prod table; what does is the role's own policy.

### Moving from AdministratorAccess to the scoped policies

The role had only `AdministratorAccess`, attached through the `ManagedPolicyArns` parameter. The
first deploy of the scoped template goes in this order:

1. Update this stack by hand with the command above. It creates the boundary and the scoped
   policies, and CloudFormation detaches `AdministratorAccess`, since the template no longer
   names it.
2. Attach `AdministratorAccess` again by hand, at once, as a temporary attachment outside the
   stack:
   `aws iam attach-role-policy --role-name koekalenteri-github-deploy --policy-arn arn:aws:iam::aws:policy/AdministratorAccess`.
   The deploys that add the boundary to the existing roles then do not depend on the order in which
   CloudFormation sets a role's boundary and its policies, and if one of them fails, its rollback
   can take the boundary off again, which the scoped role may not do.
3. Merge the pull request. The dev deploy adds the boundary to every role of `koekalenteri-dev`.
4. Detach `AdministratorAccess`
   (`aws iam detach-role-policy --role-name koekalenteri-github-deploy --policy-arn arn:aws:iam::aws:policy/AdministratorAccess`)
   and run the dev deploy again (re-run the release workflow's dev deploy). It proves the scoped
   permissions on a stack that already has the boundary.
5. Release to test, then to prod. Attach `AdministratorAccess` for each of the two first releases
   and detach it only after that release has passed: each one adds the boundary to that stack's
   roles, and a failed one rolls back by removing it.

After step 1, a commit older than this change cannot be deployed with the scoped permissions: its
template sets no boundary, and the role may not create a role without one. Reattaching
`AdministratorAccess` is the way to deploy it.

The release workflow still falls back to the old `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
secrets when `AWS_DEPLOY_ROLE_ARN` is unset, and that key belongs to an administrator user. None of
the scoping above applies to it until the key is deleted (KOE-1578).
