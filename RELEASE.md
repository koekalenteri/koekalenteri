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

1.  **Create a Git Tag**: Create and push a new tag for your release. Use semantic versioning (e.g., `v1.2.3` for a release, `v1.2.3-beta.1` for a pre-release).
    ```bash
    git tag v1.2.3
    git push origin v1.2.3
    ```

2.  **Publish a Release on GitHub**:
    *   Go to the "Releases" page in your GitHub repository.
    *   Click "Draft a new release".
    *   Choose the tag you just created.
    *   **For a Pre-release (to test environment)**: Check the "This is a pre-release" box.
    *   **For a Production Release**: Leave the "This is a pre-release" box unchecked.
    *   Fill in the release title and description.
    *   Click "Publish release".

#### Automation:

-   Publishing the release triggers the `Release` workflow.
-   The workflow determines the environment (`prod` or `test`) based on whether it's a pre-release.
-   For production releases, the tag is force-pushed to the `release/prod` branch.
-   For pre-releases, the tag is force-pushed to the `release/test` branch.
-   The appropriate release branch is then deployed to the corresponding environment using AWS Amplify.

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

-   This triggers a `workflow_dispatch` event.
-   The workflow force-pushes the selected branch to the `release/test` branch.
-   The `release/test` branch is then deployed to the test environment using AWS Amplify.

---

### 3. Continuous Deployment to Dev

The `dev` environment is automatically updated whenever changes are pushed to the `main` branch. This process is handled by the `CI` workflow defined in `.github/workflows/ci.yml`. Unlike the test and production environments, which use dedicated release branches, the dev environment is always deployed directly from the `main` branch.

#### Automation:

-   On a push to `main`, the workflow checks for changes in the `frontend` and `backend` directories.
-   **Backend**: If backend files have changed, the `deploy-backend` job deploys the latest commit from `main` to the `dev` environment's backend infrastructure.
-   **Frontend**: If frontend files have changed, the `deploy-frontend` job triggers a webhook (`DEPLOY_TRIGGER_HOOK`) that builds and deploys the latest commit from the `main` branch to the `dev` environment's frontend.

---

### Required Configuration

The release workflow requires the following secrets to be configured in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

-   `AWS_ACCESS_KEY_ID`: Your AWS access key.
-   `AWS_SECRET_ACCESS_KEY`: Your AWS secret key.
-   `AWS_REGION`: The AWS region for your resources (e.g., `eu-west-1`).
-   `AMPLIFY_APP_ID`: The App ID of your AWS Amplify application. This is retrieved from the CloudFormation stack outputs of the `prod` and `test` environments.
-   `DEPLOY_TRIGGER_HOOK`: A webhook URL that triggers a build of the `main` branch in the `dev` environment's Amplify app.
-   `GITHUB_TOKEN`: A GitHub token with permissions to create and push branches. The default `GITHUB_TOKEN` provided by Actions should suffice.
