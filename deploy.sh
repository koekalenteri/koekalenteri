set -x

[ -z "$STACK_NAME" ] && echo "Please specify STACK_NAME environment variable" && exit 1;
[ -z "$AWS_DEFAULT_REGION" ] && echo "Please specify AWS_DEFAULT_REGION environment variable" && exit 1;

export AWS_PROFILE=koekalenteri

sam build --use-container
sam deploy --guided --stack-name $STACK_NAME

export AWS_COGNITO_REGION=$AWS_DEFAULT_REGION
export AWS_USER_POOLS_WEB_CLIENT_ID=`aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='CognitoClientID'].OutputValue" --output text`
export API_BASE_URL=`aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='TodoFunctionApi'].OutputValue" --output text`
export STAGE_NAME_PARAM=`aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Parameters[?ParameterKey=='StageNameParam'].ParameterValue" --output text`
export COGNITO_HOSTED_DOMAIN=`aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='CognitoDomainName'].OutputValue" --output text`
export REDIRECT_URL=`aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='AmplifyURL'].OutputValue" --output text`

cp koekalenteri-frontend/src/config.default.js koekalenteri-frontend/src/config.js
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' -e 's/AWS_USER_POOLS_WEB_CLIENT_ID/'"$AWS_USER_POOLS_WEB_CLIENT_ID"'/g' koekalenteri-frontend/src/config.js
  sed -i '' -e 's/API_BASE_URL/'"${API_BASE_URL//\//\\/}"'/g' koekalenteri-frontend/src/config.js
  sed -i '' -e 's/{StageNameParam}/'"$STAGE_NAME_PARAM"'/g' koekalenteri-frontend/src/config.js
  sed -i '' -e 's/COGNITO_HOSTED_DOMAIN/'"$COGNITO_HOSTED_DOMAIN"'/g' koekalenteri-frontend/src/config.js
  sed -i '' -e 's/REDIRECT_URL/'"${REDIRECT_URL//\//\\/}"'/g' koekalenteri-frontend/src/config.js
else
  sed -i -e 's/AWS_USER_POOLS_WEB_CLIENT_ID/'"$AWS_USER_POOLS_WEB_CLIENT_ID"'/g' koekalenteri-frontend/src/config.js
  sed -i -e 's/API_BASE_URL/'"${API_BASE_URL//\//\\/}"'/g' koekalenteri-frontend/src/config.js
  sed -i -e 's/{StageNameParam}/'"$STAGE_NAME_PARAM"'/g' koekalenteri-frontend/src/config.js
  sed -i -e 's/COGNITO_HOSTED_DOMAIN/'"$COGNITO_HOSTED_DOMAIN"'/g' koekalenteri-frontend/src/config.js
  sed -i -e 's/REDIRECT_URL/'"${REDIRECT_URL//\//\\/}"'/g' koekalenteri-frontend/src/config.js
fi

git add koekalenteri-frontend/src/config.js
git commit -m 'Frontend config update'
git push