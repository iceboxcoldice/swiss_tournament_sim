# Use official lightweight Python image
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Create storage and user directories for persistent volume mounting
RUN mkdir -p local_storage users

EXPOSE 8081

ENV PORT=8081
ENV PYTHONUNBUFFERED=1

# Use gunicorn with 1 worker and multi-threading for state consistency
CMD ["gunicorn", "-b", "0.0.0.0:8081", "--workers", "1", "--threads", "4", "--timeout", "120", "main:app"]
