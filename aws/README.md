## Manual data migration example

### get

aws dynamodb scan --table-name event-table-v2-koekalenteri-dev --output json | jq "{ \"event-table-v3-koekalenteri-dev\": [ .Items[] | { PutRequest: { Item: . } } ] }" > kokeet.json

aws dynamodb query --table-name event-table-v3-koekalenteri-prod --key-condition-expression "id = :id" --expression-attribute-values '{":id":{"S":"zGBgx67eq7"}}'  --output json | jq "{ \"event-table-v3-koekalenteri-dev\": [ .Items[] | { PutRequest: { Item: . } } ] }" > sm24.json

aws dynamodb query --table-name event-registration-table-koekalenteri-prod --key-condition-expression "eventId = :id" --expression-attribute-values '{":id":{"S":"qM0H5WG_5C"}}' --output json | jq "{ \"event-registration-table-koekalenteri-dev\": [ .Items[] | { PutRequest: { Item: . } } ] }" > ilmot.json

## change emails

jq 'walk(if type == "object" and has("email") then .email.S="user@exmaple.com" else . end)' ilmot.json > ilmot-fix.json

### split to 25 record chunks (max for batch-write-item, duh!)

node split.js kokeet.json

### put

aws dynamodb batch-write-item --request-items file://kokeet0.json
...
