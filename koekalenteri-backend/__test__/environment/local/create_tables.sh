#!/bin/zsh

aws dynamodb create-table \
        --table-name event-table \
        --attribute-definitions AttributeName=id,AttributeType=S \
        --key-schema AttributeName=id,KeyType=HASH \
        --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb put-item --endpoint-url http://127.0.0.1:8000 --table-name event-table --item < event-dynamodb.json

aws dynamodb create-table \
  --table-name judge-table \
  --attribute-definitions AttributeName=id,AttributeType=N \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb put-item --endpoint-url http://127.0.0.1:8000 --table-name judge-table --item < judge1.json
aws dynamodb put-item --endpoint-url http://127.0.0.1:8000 --table-name judge-table --item < judge2.json
aws dynamodb put-item --endpoint-url http://127.0.0.1:8000 --table-name judge-table --item < judge3.json

aws dynamodb create-table \
  --table-name organizer-table \
  --attribute-definitions AttributeName=id,AttributeType=N \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb put-item --endpoint-url http://127.0.0.1:8000 --table-name organizer-table --item < organizer1.json
