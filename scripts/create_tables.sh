#!/bin/sh
cd '_test_data_'

aws dynamodb create-table \
  --table-name event-table \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb batch-write-item --endpoint-url http://127.0.0.1:8000 --request-items file://events.json --no-paginate --color on --output text

aws dynamodb create-table \
  --table-name judge-table \
  --attribute-definitions AttributeName=id,AttributeType=N \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb batch-write-item --endpoint-url http://127.0.0.1:8000 --request-items file://judges.json --no-paginate --color on --output text

aws dynamodb create-table \
  --table-name official-table \
  --attribute-definitions AttributeName=id,AttributeType=N \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb put-item --table-name official-table --item file://official1.json --endpoint-url http://127.0.0.1:8000
aws dynamodb put-item --table-name official-table --item file://official2.json --endpoint-url http://127.0.0.1:8000
aws dynamodb put-item --table-name official-table --item file://official3.json --endpoint-url http://127.0.0.1:8000

aws dynamodb create-table \
  --table-name organizer-table \
  --attribute-definitions AttributeName=id,AttributeType=N \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb put-item --endpoint-url http://127.0.0.1:8000 --table-name organizer-table --item file://organizer1.json

aws dynamodb create-table \
  --table-name dog-table \
  --attribute-definitions AttributeName=regNo,AttributeType=S \
  --key-schema AttributeName=regNo,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb batch-write-item --endpoint-url http://127.0.0.1:8000 --request-items file://dogs.json --no-paginate --color on --output text

aws dynamodb create-table \
  --table-name event-registration-table \
  --attribute-definitions AttributeName=eventId,AttributeType=S AttributeName=id,AttributeType=S \
  --key-schema AttributeName=eventId,KeyType=HASH AttributeName=id,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb batch-write-item --endpoint-url http://127.0.0.1:8000 --request-items file://registrations.json --no-paginate --color on --output text

aws dynamodb create-table \
  --table-name event-type-table \
  --attribute-definitions AttributeName=eventType,AttributeType=S \
  --key-schema AttributeName=eventType,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb batch-write-item --endpoint-url http://127.0.0.1:8000 --request-items file://eventTypes.json --no-paginate --color on --output text

aws dynamodb create-table \
  --table-name email-templates-table \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb batch-write-item --endpoint-url http://127.0.0.1:8000 --request-items file://emailTemplates.json --no-paginate --color on --output text

aws dynamodb create-table \
  --table-name user-table \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb create-table \
  --table-name user-link-table \
  --attribute-definitions AttributeName=cognitoUser,AttributeType=S AttributeName=userId,AttributeType=S \
  --key-schema AttributeName=cognitoUser,KeyType=HASH AttributeName=userId,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000
