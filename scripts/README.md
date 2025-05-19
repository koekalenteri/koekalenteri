# Scripts

This directory contains various scripts for the project.

## Local Development Setup

### Python Dependencies

For local development on macOS, the recommended way to install the required Python packages is using a virtual environment:

```bash
# Create a virtual environment
python3 -m venv venv
source venv/bin/activate

# Install packages in the virtual environment
pip install cfn-flip boto3
```

### Running the Scripts

To create DynamoDB tables locally:

```bash
# Activate the virtual environment
source venv/bin/activate

# Run the script
python scripts/create-local-tables.py
```

Alternatively, you can use pipx to install and run the script:

```bash
# Install pipx if you don't have it
brew install pipx
pipx ensurepath

# Install the required packages in an isolated environment
pipx install cfn-flip
pipx inject cfn-flip boto3

# Run the script
python scripts/create-local-tables.py
```

## CI/CD

The GitHub Actions workflow will automatically install the required dependencies and run the scripts in the CI/CD environment.
