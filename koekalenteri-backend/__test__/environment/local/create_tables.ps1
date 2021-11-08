aws dynamodb delete-table --table-name event-table --endpoint-url http://127.0.0.1:8000

aws dynamodb create-table `
  --table-name event-table `
  --attribute-definitions AttributeName=eventType,AttributeType=S AttributeName=id,AttributeType=S `
  --key-schema AttributeName=eventType,KeyType=HASH AttributeName=id,KeyType=RANGE `
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb put-item --table-name event-table --item file://event-dynamodb.json --endpoint-url http://127.0.0.1:8000

aws dynamodb create-table `
  --table-name judge-table `
  --attribute-definitions AttributeName=id,AttributeType=N `
  --key-schema AttributeName=id,KeyType=HASH `
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb put-item --table-name judge-table --item file://judge1.json --endpoint-url http://127.0.0.1:8000
aws dynamodb put-item --table-name judge-table --item file://judge2.json --endpoint-url http://127.0.0.1:8000
aws dynamodb put-item --table-name judge-table --item file://judge3.json --endpoint-url http://127.0.0.1:8000

aws dynamodb create-table `
  --table-name organizer-table `
  --attribute-definitions AttributeName=id,AttributeType=N `
  --key-schema AttributeName=id,KeyType=HASH `
  --billing-mode PAY_PER_REQUEST --endpoint-url http://127.0.0.1:8000

aws dynamodb put-item --table-name organizer-table --item file://organizer1.json --endpoint-url http://127.0.0.1:8000
