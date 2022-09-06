#!/bin/zsh
export JSON_PATH='__test__/environment/local/'
cd ${JSON_PATH}

aws dynamodb create-table \
        --table-name event-table \
        --attribute-definitions AttributeName=eventType,AttributeType=S AttributeName=id,AttributeType=S \
        --key-schema AttributeName=eventType,KeyType=HASH AttributeName=id,KeyType=RANGE \
        --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb batch-write-item --endpoint-url http://127.0.0.1:8000 --request-items file://events.json

aws dynamodb create-table \
  --table-name judge-table \
  --attribute-definitions AttributeName=id,AttributeType=N \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb batch-write-item --endpoint-url http://127.0.0.1:8000 --request-items file://judges.json

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
  --attribute-definitions AttributeName=regNo,AttributeType=S AttributeName=id,AttributeType=N \
  --key-schema AttributeName=regNo,KeyType=HASH AttributeName=id,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb batch-write-item --endpoint-url http://127.0.0.1:8000 --request-items file://dogs.json

aws dynamodb create-table \
  --table-name event-registration-table \
  --attribute-definitions AttributeName=eventId,AttributeType=S AttributeName=id,AttributeType=S \
  --key-schema AttributeName=eventId,KeyType=HASH AttributeName=id,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb batch-write-item --endpoint-url http://127.0.0.1:8000 --request-items file://registrations.json

aws dynamodb create-table \
  --table-name event-type-table \
  --attribute-definitions AttributeName=eventType,AttributeType=S \
  --key-schema AttributeName=eventType,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000
