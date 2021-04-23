// You can obtain these values by running:
// aws cloudformation describe-stacks --stack-name <YOUR STACK NAME> --query "Stacks[0].Outputs[]"

const config = {
    "aws_user_pools_web_client_id": "338fl248f87sphteskhtn0nnge",     // CognitoClientID
    "api_base_url": "",                                     // TodoFunctionApi
    "cognito_hosted_domain": "koekalenteri-koekalenteri-test.auth.eu-north-1.amazoncognito.com",                   // CognitoDomainName
    "redirect_url": "https://master.d1405hsb64tm6b.amplifyapp.com"                                      // AmplifyURL
  };
  
  export default config;