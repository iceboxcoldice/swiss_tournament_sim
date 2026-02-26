# Local Development Guide

You can now test the Tournament Manager locally without needing a Google Cloud Storage bucket.

## Prerequisites
- Python 3.10+ (recommended)
- Flask and other dependencies installed: `pip install flask flask-cors google-cloud-storage`

## Running Locally

1.  **Start the Backend**:
    Run the following command in your terminal:
    ```bash
    python3 main.py
    ```
    The server will start on **http://localhost:8081**. It will automatically detect that `GCS_BUCKET_NAME` is not set and use the `./local_storage` directory instead.

2.  **Open the Frontend**:
    Open the following file in your browser:
    `/Users/hbl/python/swiss_tournment_sim/docs/manager/index.html`

3.  **Connect to Local Backend**:
    - Click the **☁ Cloud** button in the header.
    - Enter `http://localhost:8081` as the Backend URL.
    - Click **Connect**.

## Features Testable Locally
- Creating new tournaments with unique IDs.
- Switching between tournaments using the dropdown.
- Adding judges and reporting results (Optimistic UI style).
- Background syncing to local files in `./local_storage`.
- Resetting specific tournaments.

---

### Why test locally?
Local testing ensures that all logic, routing, and UI changes work as expected before you commit and push to Google App Engine, making your deployment process much safer.
