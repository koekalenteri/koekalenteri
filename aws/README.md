## Manual data migration example

### get

aws dynamodb scan --table-name event-table-v2-koekalenteri-dev --output json | jq "{ \"event-table-v3-koekalenteri-dev\": [ .Items[] | { PutRequest: { Item: . } } ] }" > kokeet.json

### split to 25 record chunks (max for batch-write-item, duh!)

node split.js kokeet.json

### put

aws dynamodb batch-write-item --request-items file://kokeet0.json
...
