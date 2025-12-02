---
description: Deploy to Google App Engine
---

# Deploy to Google App Engine

This workflow guides you through deploying the application to Google App Engine.

## Prerequisites

1.  **Google Cloud SDK**: You need the `gcloud` CLI tool installed.
    *   **Mac (via Homebrew)**: `brew install --cask google-cloud-sdk`
    *   **Manual**: Download from [cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install)

2.  **Google Cloud Project**: You need a project created in the Google Cloud Console.

## Deployment Steps

1.  **Login to Google Cloud**:
    ```bash
    gcloud auth login
    ```

2.  **Set your Project**:
    Replace `[YOUR_PROJECT_ID]` with your actual project ID.
    ```bash
    gcloud config set project [YOUR_PROJECT_ID]
    ```

3.  **Initialize App Engine** (if not done):
    ```bash
    gcloud app create
    ```

4.  **Deploy**:
    ```bash
    gcloud app deploy
    ```

5.  **Open the App**:
    ```bash
    gcloud app browse
    ```

## Troubleshooting

-   **`gcloud: command not found`**: Ensure the SDK is installed and in your PATH. If you installed via Homebrew, you might need to restart your terminal.
-   **Permissions**: Ensure your user has the `App Engine Deployer` role.
