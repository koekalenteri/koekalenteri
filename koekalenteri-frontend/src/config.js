// You can obtain these values by running:
// aws cloudformation describe-stacks --stack-name <YOUR STACK NAME> --query "Stacks[0].Outputs[]"

const config = {
    "aws_user_pools_web_client_id": "7kls1vv6p6nadnqcehu10as53o",     // CognitoClientID
    "api_base_url": "",                                     // KoekalenteriunctionApi
    "cognito_hosted_domain": "koekalenteri-prod-amplify-koekalenteri.auth.eu-north-1.amazoncognito.com",                   // CognitoDomainName
    "redirect_url": "https://main.d30uwxw1rgpwmt.amplifyapp.com"                                      // AmplifyURL
  };
  
  export default config;