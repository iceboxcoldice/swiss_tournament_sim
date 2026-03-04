# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container at /app
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the current directory contents into the container at /app
# This includes main.py, tournament_manager.py, swiss_sim.py, and the docs/ directory
COPY . .

# Make port 8081 available to the world outside this container
EXPOSE 8081

# Define environment variable
ENV PORT=8081
ENV PYTHONUNBUFFERED=1

# Run main.py when the container launches
CMD ["python", "main.py"]
