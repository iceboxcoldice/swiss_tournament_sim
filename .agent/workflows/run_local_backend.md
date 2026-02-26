---
description: Run the backend locally with Flask and GCS
---
To run the backend locally and connect it to the frontend:

1. **Authenticate with Google Cloud** (Required for GCS access):
   ```bash
   gcloud auth application-default login
   ```
   Follow the instructions in the browser to log in.

2. **Install Dependencies** (If not already installed):
   ```bash
   pip3 install -r requirements.txt
   ```

3. **Run the Flask Backend**:
   ```bash
   python3 main.py
   ```
   The server will start on `http://0.0.0.0:8080`.

4. **Connect Frontend**:
   - Open your frontend at `http://localhost:8000` (or wherever it's running).
   - Click the **☁ Cloud** button.
   - Enter the local URL: `http://127.0.0.1:8080`
   - Click **Connect**.

You can now test changes to `main.py` locally before deploying!
