// You can obtain these values by running:
// aws cloudformation describe-stacks --stack-name <YOUR STACK NAME> --query "Stacks[0].Outputs[]"

const config = {
  "aws_user_pools_web_client_id": "7qg6ahgm2083ld85ml14soie0i",     // CognitoClientID
  "api_base_url": "https://pyttgl9as9.execute-api.eu-north-1.amazonaws.com/prod",                                     // KoekalenteriunctionApi
  "cognito_hosted_domain": "koekalenteri-prod-amplify-koekalenteri-dev.auth.eu-north-1.amazoncognito.com",                   // CognitoDomainName
  "redirect_url": "https://main.d15teg8m38gx7.amplifyapp.com"                                      // AmplifyURL
};

export default config;
