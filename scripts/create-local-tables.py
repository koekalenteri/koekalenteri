#!/usr/bin/env python3
import json
import os
import sys
import boto3
from cfn_flip import flip, to_json

# Get environment variables
endpoint_url = os.environ.get('DYNAMODB_ENDPOINT', 'http://dynamodb:8000')
region = os.environ.get('AWS_REGION', 'eu-north-1')
stack_name = os.environ.get('STACK_NAME', 'local')

# Initialize DynamoDB client
dynamodb = boto3.client('dynamodb',
    region_name=region,
    endpoint_url=endpoint_url,
    aws_access_key_id='fake',
    aws_secret_access_key='fake'
)

print(endpoint_url)

# Read and parse the CloudFormation template
with open('template.yaml', 'r') as f:
    template_yaml = f.read()

# Convert YAML to JSON (cfn-flip handles CloudFormation intrinsic functions)
template_json = to_json(template_yaml)
template = json.loads(template_json)

# Extract DynamoDB table resources
resources = template.get('Resources', {})
for resource_name, resource in resources.items():
    if resource.get('Type') == 'AWS::DynamoDB::Table':
        properties = resource.get('Properties', {})

        # Extract table name
        table_name = properties.get('TableName', {})

        # Handle !Join function in TableName
        if isinstance(table_name, dict) and 'Fn::Join' in table_name:
            delimiter, parts = table_name['Fn::Join']
            # Extract the base name (first part) and append stack name
            base_name = parts[0]
            if isinstance(base_name, str):
                final_table_name = f"{base_name}-{stack_name}"
            else:
                # Fallback if we can't extract the name
                final_table_name = f"{resource_name.lower()}-{stack_name}"
        else:
            # Fallback if TableName is not using !Join
            final_table_name = f"{resource_name.lower()}-{stack_name}"

        # Extract key schema
        key_schema = properties.get('KeySchema', [])

        # Extract attribute definitions
        attribute_definitions = properties.get('AttributeDefinitions', [])

        # Extract billing mode
        billing_mode = properties.get('BillingMode', 'PAY_PER_REQUEST')

        # Extract global secondary indexes if present
        global_secondary_indexes = properties.get('GlobalSecondaryIndexes', [])

        # Prepare create table parameters
        create_params = {
            'TableName': final_table_name,
            'KeySchema': key_schema,
            'AttributeDefinitions': attribute_definitions,
            'BillingMode': billing_mode
        }

        if global_secondary_indexes:
            create_params['GlobalSecondaryIndexes'] = global_secondary_indexes

        try:
            # Create the table
            dynamodb.create_table(**create_params)
            print(f" \033[92m✔\033[0m {final_table_name} created")
        except dynamodb.exceptions.ResourceInUseException:
            print(f" \033[90m•\033[0m {final_table_name} already exists")
        except Exception as e:
            print(f" \033[91m✖\033[0m {final_table_name} failed: {str(e)}")

print(" ✔ All tables processed")
