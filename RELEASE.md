# Deployment Process

This document outlines the process for deploying the application to both test and production environments. The process is managed via a GitHub Actions workflow defined in `.github/workflows/release.yml`.

## Release Branch Strategy

The application uses the following branch strategy for deployments:

- **Production**: Always deployed from the `release/prod` branch
- **Test**: Always deployed from the `release/test` branch
- **Development**: Always deployed from the `main` branch

## Release Types

There are two primary ways to deploy the application:

1.  **Tag-Based Releases**: For deploying to production or for formal pre-releases to the test environment.
2.  **Manual Branch Deployments**: For deploying a feature branch to the test environment for ad-hoc testing.

---

### 1. Tag-Based Releases (Production and Pre-release)

This is the standard process for all production and pre-release deployments. The deployment is triggered automatically when a new **Release** is published in GitHub. It is defined in the `.github/workflows/release.yml` file.

#### Steps:

0.  **Update the guides**: The user guides under `docs/` are published with the application, so
    they are brought up to date before the tag, with the developer present:

    ```bash
    npm run docs-update -- --since v1.2.2 --run
    ```

    The command gathers what changed since the previous release and which guide pages that
    concerns, and starts an agent session that rewrites those pages (see `docs/AGENTS.md`).
    Review the result in the session, commit it to `main`, and let CI take it to dev so the
    `/docs` pages can be looked at in the running application before anything is tagged.

0.  **Write the release notes**: Every version ships with `docs/fi/whats-new/<version>.md` and its
    English translation, shown at `/whats-new` and offered from the update notice. Draft them from the
    commits and write them over in the reader's words:

    ```bash
    npm run release-notes -- v1.2.3
    ```

    `npm run check-docs` refuses a `package.json` version that has no notes, so the version bump
    commit cannot be made without them. The same Finnish text becomes the GitHub Release's
    description when the release is published (below); nothing needs to be typed into the form.

1.  **Create a Git Tag**: Create and push a new tag for your release. Use semantic versioning (e.g., `v1.2.3` for a release, `v1.2.3-beta.1` for a pre-release).

    ```bash
    git tag v1.2.3
    git push origin v1.2.3
    ```

2.  **Publish a Release on GitHub**:
    - Go to the "Releases" page in your GitHub repository.
    - Click "Draft a new release".
    - Choose the tag you just created.
    - **For a Pre-release (to test environment)**: Check the "This is a pre-release" box.
    - **For a Production Release**: Leave the "This is a pre-release" box unchecked.
    - Fill in the release title; the description is replaced with the version's release notes on publish.
    - Click "Publish release".

#### Automation:

- Publishing the release triggers the `Release` workflow.
- The workflow sets the release's description from `docs/fi/whats-new/<version>.md`.
- The workflow determines the environment (`prod` or `test`) based on whether it's a pre-release.
- For production releases, the tag is force-pushed to the `release/prod` branch.
- For pre-releases, the tag is force-pushed to the `release/test` branch.
- The appropriate release branch is then deployed to the corresponding environment using AWS Amplify.

#### Publishing a Pre-release as a Full Release

If you have published a pre-release and now want to promote it to a full production release:

1. Create a new tag for the production release (e.g., `v1.2.3` from `v1.2.3-beta.1`):

   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```

2. Publish a new release on GitHub:
   - Go to the "Releases" page in your GitHub repository.
   - Click "Draft a new release".
   - Choose the new production tag.
   - Leave the "This is a pre-release" box unchecked.
   - Fill in the release title and description.
   - Click "Publish release".

This will trigger the deployment to production.

---

### 2. Manual Branch Deployments (Test Environment)

This process allows you to deploy any branch to the `test` environment for development or QA testing. It is defined in the `.github/workflows/release.yml` file.

#### Steps:

1.  Go to the "Actions" tab in your GitHub repository.
2.  Select the "Release" workflow from the list on the left.
3.  Click the "Run workflow" dropdown button.
4.  Select the branch you want to deploy.
5.  Click the "Run workflow" button.

#### Automation:

- This triggers a `workflow_dispatch` event.
- The workflow force-pushes the selected branch to the `release/test` branch.
- The `release/test` branch is then deployed to the test environment using AWS Amplify.

---

### 3. Continuous Deployment to Dev

The `dev` environment is automatically updated whenever changes are pushed to the `main` branch. This process is handled by the `CI` workflow defined in `.github/workflows/ci.yml`. Unlike the test and production environments, which use dedicated release branches, the dev environment is always deployed directly from the `main` branch.

#### Automation:

- On a push to `main`, the workflow checks for changes in the `frontend` and `backend` directories.
- **Backend**: If backend files have changed, the `deploy-backend` job deploys the latest commit from `main` to the `dev` environment's backend infrastructure.
- **Frontend**: If frontend files have changed, the `deploy-frontend` job triggers a webhook (`DEPLOY_TRIGGER_HOOK`) that builds and deploys the latest commit from the `main` branch to the `dev` environment's frontend.

---

### Required Configuration

The release workflow requires the following secrets to be configured in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

- `AWS_DEPLOY_ROLE_ARN`: The `RoleArn` output of the `koekalenteri-github-deploy` stack (`aws/github-deploy-role.yaml`). The deploy jobs assume this role through GitHub's OIDC federation, and use the access key below only when it is unset.
- `AWS_ACCESS_KEY_ID`: Your AWS access key.
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret key.
- `AWS_REGION`: The AWS region for your resources (e.g., `eu-west-1`).
- `AMPLIFY_APP_ID`: The App ID of your AWS Amplify application. This is retrieved from the CloudFormation stack outputs of the `prod` and `test` environments.
- `DEPLOY_TRIGGER_HOOK`: A webhook URL that triggers a build of the `main` branch in the `dev` environment's Amplify app.
- `GITHUB_TOKEN`: A GitHub token with permissions to create and push branches. The default `GITHUB_TOKEN` provided by Actions should suffice.

### Registration edit-token secret recovery

Every participant registration link, class secretary's start number link and station link is signed with one secret per stack: the SSM parameter `<stack>-REGISTRATION_EDIT_TOKEN_SECRET` (`koekalenteri-dev`, `-test`, `-prod`), a `String` in the Standard tier (KOE-1604). The stack does not own it. The functions that sign or check a link read it as `REGISTRATION_EDIT_TOKEN_SECRET`, which CloudFormation resolves from `{{resolve:ssm:${AWS::StackName}-REGISTRATION_EDIT_TOKEN_SECRET}}` at deploy time with the deployer's credentials, so the GitHub deploy role grants `ssm:GetParameters` on the three names (`aws/github-deploy-role.yaml`).

A deploy reads whatever the parameter holds, so a recreated stack keeps every link as long as the parameter is there. A stack whose parameter is missing fails to deploy. Only a stack that never had one gets a fresh random value:

```sh
aws ssm put-parameter --name <stack>-REGISTRATION_EDIT_TOKEN_SECRET --type String \
  --value "$(openssl rand -hex 32)"
```

A parameter missing from an existing stack is restored with the old value, never a new one: a new value revokes every link already sent. Every deployed function that signs links still holds the old value in its environment:

```sh
aws lambda get-function-configuration --function-name <a function of that stack> \
  --query 'Environment.Variables.REGISTRATION_EDIT_TOKEN_SECRET' --output text
```

Until they are deleted by hand, the retained Secrets Manager secrets from before KOE-1604 hold it too.

Without `--overwrite`, `put-parameter` refuses a name that exists; never pass it for this parameter. Changing the value invalidates every link issued with the previous one, and CloudFormation does not re-resolve a reference on its own: each function keeps the value it was deployed with until a deploy updates that function. Per-registration revocation increments `editTokenVersion` instead; a start number or station link is revoked by its own version.

If the signing secret is compromised, changing it is an intentional global revocation. Coordinate that operation with issuing replacement links to all affected participants, and make sure every function that reads the secret is updated by the deploy that follows.

### Service worker rollback

Set `REACT_APP_DISABLE_SERVICE_WORKER=true` in the Amplify environment and deploy a new frontend build to disable the service worker. This build emits a self-destructing `service-worker.js` at the normal URL. On the browser's next service-worker update check, it activates immediately, unregisters every registration for the origin, deletes CacheStorage entries, and reloads open windows. This recovery path does not depend on the cached application bundle starting or on a user accepting an update notification.

Keep the environment variable enabled for at least as long as the previous frontend release may remain open in a browser. Remove it only when service-worker registration should be enabled again.
